import mongoose from 'mongoose'
import { Redis } from 'ioredis'
import { createHash } from 'node:crypto'
import { BuildModel } from './models/build.js'
import { slugify } from './catalog-utils.js'
import { setTimeout as delay } from 'node:timers/promises'

let mongoReady = false
let redis: Redis | null = null
type StoredBuild = Record<string, unknown> & {
  slug: string
  views?: number
  likes?: number
  viewedBy?: string[]
  likedBy?: string[]
}
const fallbackUserBuilds: StoredBuild[] = []
const buildsCacheKey = 'spiritvale:builds:v2'
const legacyDemoBuildSlugs = ['paladin-aegis-v1', 'wizard-meteor-v1', 'ranger-storm-v1', 'assassin-shadow-v1']

function publicBuild(value: StoredBuild | Record<string, unknown>) {
  const { viewedBy: _viewedBy, likedBy: _likedBy, ...record } = value as StoredBuild
  return record
}

function visitorFingerprint(visitorId: string) {
  return createHash('sha256').update(`spiritvale-lab:${visitorId}`).digest('hex')
}

function engagement(record: StoredBuild, visitorHash: string) {
  return {
    views: Number(record.views || 0),
    likes: Number(record.likes || 0),
    liked: (record.likedBy || []).includes(visitorHash)
  }
}

export class DuplicateBuildSlugError extends Error {
  constructor(public readonly slug: string) {
    super(`Build slug already exists: ${slug}`)
    this.name = 'DuplicateBuildSlugError'
  }
}

export async function connectServices() {
  mongoReady = false
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 1500 })
      mongoReady = true
      await BuildModel.deleteMany({ slug: { $in: legacyDemoBuildSlugs }, source: 'seed', userGenerated: { $ne: true } })
    } catch {
      mongoReady = false
    }
  }
  if (process.env.REDIS_URL) {
    for (let attempt = 0; attempt < 12 && !redis; attempt += 1) {
      const candidate = new Redis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1200,
        retryStrategy: null
      })
      candidate.on('error', () => undefined)
      try {
        await candidate.connect()
        await candidate.ping()
        redis = candidate
        await redis.del(buildsCacheKey).catch(() => undefined)
      } catch {
        candidate.disconnect()
        if (attempt < 11) await delay(350)
      }
    }
  }
  return { mongo: mongoReady, redis: Boolean(redis) }
}

export async function getServiceStatus() {
  const mongo = mongoReady && mongoose.connection.readyState === 1
  if (!mongo) mongoReady = false

  let redisReady = false
  if (redis) {
    try {
      redisReady = await redis.ping() === 'PONG'
    } catch {
      redis.disconnect()
      redis = null
    }
  }
  return { mongo, redis: redisReady }
}

export async function listBuilds() {
  const cached = await redis?.get(buildsCacheKey).catch(() => null)
  if (cached) {
    try {
      const parsed: unknown = JSON.parse(cached)
      if (Array.isArray(parsed)) return parsed
      await redis?.del(buildsCacheKey).catch(() => undefined)
    } catch {
      await redis?.del(buildsCacheKey).catch(() => undefined)
    }
  }
  const result = mongoReady
    ? await BuildModel.find({ active: { $ne: false } }).select('-viewedBy -likedBy').sort({ createdAt: -1 }).lean()
    : fallbackUserBuilds.map(publicBuild)
  await redis?.set(buildsCacheKey, JSON.stringify(result), 'EX', 120).catch(() => undefined)
  return result
}

export async function getBuild(slug: string) {
  if (mongoReady) return BuildModel.findOne({ slug, active: { $ne: false } }).select('-viewedBy -likedBy').lean()
  const build = fallbackUserBuilds.find(record => record.slug === slug)
  return build ? publicBuild(build) : null
}

async function slugExists(slug: string): Promise<boolean> {
  if (mongoReady) return Boolean(await BuildModel.exists({ slug }))
  return fallbackUserBuilds.some(build => build.slug === slug)
}

export async function createBuild(input: Record<string, unknown> & { title: string; slug?: string }) {
  const requestedSlug = input.slug
  const baseSlug = requestedSlug || slugify(input.title) || `community-build-${Date.now()}`
  let slug = baseSlug

  for (let suffix = 1; suffix <= 100; suffix += 1) {
    if (!(await slugExists(slug))) break
    if (requestedSlug) throw new DuplicateBuildSlugError(requestedSlug)
    slug = `${baseSlug}-${suffix + 1}`
  }
  if (await slugExists(slug)) throw new DuplicateBuildSlugError(slug)

  const now = new Date()
  const record = {
    ...input,
    slug,
    tier: 'Community',
    patch: input.patch || 'Community',
    views: 0,
    likes: 0,
    viewedBy: [],
    likedBy: [],
    metrics: [],
    updatedAt: now.toISOString().slice(0, 10),
    source: 'user',
    userGenerated: true,
    active: true
  }

  if (mongoReady) {
    try {
      const created = await BuildModel.create(record)
      await redis?.del(buildsCacheKey).catch(() => undefined)
      return publicBuild(created.toObject())
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new DuplicateBuildSlugError(slug)
      }
      throw error
    }
  }

  fallbackUserBuilds.unshift(record)
  await redis?.del(buildsCacheKey).catch(() => undefined)
  return publicBuild(record)
}

export async function registerBuildView(slug: string, visitorId: string) {
  const visitorHash = visitorFingerprint(visitorId)
  if (mongoReady) {
    const updated = await BuildModel.findOneAndUpdate(
      { slug, active: { $ne: false }, viewedBy: { $ne: visitorHash } },
      { $addToSet: { viewedBy: visitorHash }, $inc: { views: 1 } },
      { new: true }
    ).select('views likes +likedBy').lean()
    const record = updated || await BuildModel.findOne({ slug, active: { $ne: false } }).select('views likes +likedBy').lean()
    if (!record) return null
    if (updated) await redis?.del(buildsCacheKey).catch(() => undefined)
    return engagement(record as unknown as StoredBuild, visitorHash)
  }

  const record = fallbackUserBuilds.find(build => build.slug === slug)
  if (!record) return null
  record.viewedBy ||= []
  if (!record.viewedBy.includes(visitorHash)) {
    record.viewedBy.push(visitorHash)
    record.views = Number(record.views || 0) + 1
    await redis?.del(buildsCacheKey).catch(() => undefined)
  }
  return engagement(record, visitorHash)
}

export async function toggleBuildLike(slug: string, visitorId: string) {
  const visitorHash = visitorFingerprint(visitorId)
  if (mongoReady) {
    const removed = await BuildModel.findOneAndUpdate(
      { slug, active: { $ne: false }, likedBy: visitorHash },
      { $pull: { likedBy: visitorHash }, $inc: { likes: -1 } },
      { new: true }
    ).select('views likes +likedBy').lean()
    if (removed) {
      await redis?.del(buildsCacheKey).catch(() => undefined)
      return engagement(removed as unknown as StoredBuild, visitorHash)
    }

    const added = await BuildModel.findOneAndUpdate(
      { slug, active: { $ne: false }, likedBy: { $ne: visitorHash } },
      { $addToSet: { likedBy: visitorHash }, $inc: { likes: 1 } },
      { new: true }
    ).select('views likes +likedBy').lean()
    if (!added) return null
    await redis?.del(buildsCacheKey).catch(() => undefined)
    return engagement(added as unknown as StoredBuild, visitorHash)
  }

  const record = fallbackUserBuilds.find(build => build.slug === slug)
  if (!record) return null
  record.likedBy ||= []
  const index = record.likedBy.indexOf(visitorHash)
  if (index >= 0) record.likedBy.splice(index, 1)
  else record.likedBy.push(visitorHash)
  record.likes = record.likedBy.length
  await redis?.del(buildsCacheKey).catch(() => undefined)
  return engagement(record, visitorHash)
}

export async function closeServices() {
  await mongoose.disconnect().catch(() => undefined)
  redis?.disconnect()
  redis = null
  mongoReady = false
}
