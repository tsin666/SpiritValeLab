import mongoose from 'mongoose'
import { Redis } from 'ioredis'
import { createHash } from 'node:crypto'
import { BuildModel } from './models/build.js'
import { slugify } from './catalog-utils.js'
import { setTimeout as delay } from 'node:timers/promises'
import { guideHtmlTextLength, MAX_GUIDE_TEXT_LENGTH, normalizeGuideHtml } from './guide-html.js'

let mongoReady = false
let redis: Redis | null = null
type StoredBuild = Record<string, unknown> & {
  slug: string
  views?: number
  likes?: number
  viewedBy?: string[]
  likedBy?: string[]
  provenance?: {
    site?: string
    sourceId?: string
    contentHash?: string
    firstImportedAt?: Date | string
    lastFetchedAt?: Date | string
    translation?: {
      sourceHash?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}
const fallbackUserBuilds: StoredBuild[] = []
const buildsCacheKey = 'spiritvale:builds:v2'
const legacyDemoBuildSlugs = ['paladin-aegis-v1', 'wizard-meteor-v1', 'ranger-storm-v1', 'assassin-shadow-v1']

export type ExternalBuildProvenance = {
  site: string
  sourceId: string
  sourceUrl: string
  author?: string
  originalLanguage: string
  originalTitle: string
  originalSummary?: string
  originalGuideHtml?: string
  sourceCreatedAt?: Date | string
  sourceUpdatedAt?: Date | string
  firstImportedAt: Date | string
  lastFetchedAt: Date | string
  contentHash: string
  translation: {
    targetLanguage: 'zh-CN'
    status: 'pending' | 'translated' | 'reviewed' | 'stale' | 'failed' | 'not-needed'
    method?: 'manual' | 'machine-assisted'
    updatedAt?: Date | string
    sourceHash?: string
  }
}

export type ExternalBuildSourceMetrics = {
  likes?: number
  views?: number
  comments?: number
  fetchedAt: Date | string
}

export type TrustedExternalBuildInput = Record<string, unknown> & {
  slug?: string
  title: string
  archetype: string
  difficulty: string
  provenance: ExternalBuildProvenance
  sourceMetrics?: ExternalBuildSourceMetrics
}

const externalBuildContentFields = [
  'title',
  'titleEn',
  'archetype',
  'archetypeZh',
  'role',
  'buildType',
  'buildFor',
  'buildOrientation',
  'tier',
  'patch',
  'difficulty',
  'summary',
  'summaryEn',
  'guide',
  'guideHtml',
  'guideEn',
  'guideHtmlEn',
  'tags',
  'tagsEn',
  'updatedAt',
  'color',
  'classIcon',
  'snapshotVersion',
  'character',
  'skills',
  'skillTree',
  'equipment',
  'artifacts',
  'grimoires',
  'metrics',
  'createdBy',
  'active'
] as const

function publicProvenance(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  const allowedFields = [
    'site',
    'sourceId',
    'sourceUrl',
    'author',
    'originalLanguage',
    'originalTitle',
    'sourceCreatedAt',
    'sourceUpdatedAt'
  ] as const
  return Object.fromEntries(
    allowedFields
      .filter(field => record[field] !== undefined)
      .map(field => [field, record[field]])
  )
}

function publicBuild(value: StoredBuild | Record<string, unknown>) {
  const {
    viewedBy: _viewedBy,
    likedBy: _likedBy,
    guideHtml,
    guideHtmlEn,
    provenance,
    ...record
  } = value as StoredBuild
  const normalizedGuideHtml = typeof guideHtml === 'string' ? normalizeGuideHtml(guideHtml) : undefined
  const safeGuideHtml = normalizedGuideHtml && guideHtmlTextLength(normalizedGuideHtml) <= MAX_GUIDE_TEXT_LENGTH
    ? normalizedGuideHtml
    : undefined
  const normalizedGuideHtmlEn = typeof guideHtmlEn === 'string' ? normalizeGuideHtml(guideHtmlEn) : undefined
  const safeGuideHtmlEn = normalizedGuideHtmlEn && guideHtmlTextLength(normalizedGuideHtmlEn) <= MAX_GUIDE_TEXT_LENGTH
    ? normalizedGuideHtmlEn
    : undefined
  const safeProvenance = publicProvenance(provenance)
  return {
    ...record,
    ...(safeGuideHtml ? { guideHtml: safeGuideHtml } : {}),
    ...(safeGuideHtmlEn ? { guideHtmlEn: safeGuideHtmlEn } : {}),
    ...(safeProvenance ? { provenance: safeProvenance } : {})
  }
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
      if (Array.isArray(parsed)) return parsed.map(value => publicBuild(value as Record<string, unknown>))
      await redis?.del(buildsCacheKey).catch(() => undefined)
    } catch {
      await redis?.del(buildsCacheKey).catch(() => undefined)
    }
  }
  const result = mongoReady
    ? (await BuildModel.find({ active: { $ne: false } }).select('-viewedBy -likedBy').sort({ createdAt: -1 }).lean())
      .map(value => publicBuild(value as unknown as Record<string, unknown>))
    : fallbackUserBuilds.map(publicBuild)
  await redis?.set(buildsCacheKey, JSON.stringify(result), 'EX', 120).catch(() => undefined)
  return result
}

export async function getBuild(slug: string) {
  if (mongoReady) {
    const build = await BuildModel.findOne({ slug, active: { $ne: false } }).select('-viewedBy -likedBy').lean()
    return build ? publicBuild(build as unknown as Record<string, unknown>) : null
  }
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

  const {
    _id: _id,
    active: _active,
    createdAt: _createdAt,
    likedBy: _likedBy,
    likes: _likes,
    metrics: _metrics,
    provenance: _provenance,
    savedAt: _savedAt,
    source: _source,
    sourceMetrics: _sourceMetrics,
    tier: _tier,
    updatedAt: _updatedAt,
    userGenerated: _userGenerated,
    viewedBy: _viewedBy,
    views: _views,
    ...userInput
  } = input
  const now = new Date()
  const record = {
    ...userInput,
    slug,
    tier: 'Community',
    patch: userInput.patch || 'Community',
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

function pickExternalBuildContent(input: TrustedExternalBuildInput) {
  const content: Record<string, unknown> = {}
  for (const field of externalBuildContentFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) content[field] = input[field]
  }
  return content
}

async function normalizeExternalBuild(
  input: TrustedExternalBuildInput,
  slug: string,
  firstImportedAt?: Date | string
) {
  const record = {
    ...pickExternalBuildContent(input),
    slug,
    source: 'external',
    userGenerated: false,
    provenance: {
      ...input.provenance,
      firstImportedAt: firstImportedAt || input.provenance.firstImportedAt
    },
    ...(input.sourceMetrics ? { sourceMetrics: input.sourceMetrics } : {}),
    views: 0,
    likes: 0,
    viewedBy: [],
    likedBy: []
  }
  const document = new BuildModel(record)
  await document.validate()
  const normalized = document.toObject() as StoredBuild & {
    _id?: unknown
    createdAt?: unknown
    savedAt?: unknown
  }
  delete normalized._id
  delete normalized.createdAt
  delete normalized.savedAt
  return normalized
}

function externalBuildIdentity(input: TrustedExternalBuildInput) {
  return {
    source: 'external',
    'provenance.site': input.provenance.site,
    'provenance.sourceId': input.provenance.sourceId
  }
}

async function resolveExternalSlug(input: TrustedExternalBuildInput) {
  const baseSlug = input.slug
    || slugify(input.title)
    || `external-build-${slugify(input.provenance.sourceId) || createHash('sha256')
      .update(`${input.provenance.site}:${input.provenance.sourceId}`)
      .digest('hex')
      .slice(0, 12)}`
  let slug = baseSlug
  for (let suffix = 1; suffix <= 1_000; suffix += 1) {
    if (!(await slugExists(slug))) return slug
    slug = `${baseSlug}-${suffix + 1}`
  }
  throw new DuplicateBuildSlugError(baseSlug)
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
}

function preserveEngagement(existing: StoredBuild, replacement: StoredBuild) {
  return {
    ...replacement,
    slug: existing.slug,
    views: Number(existing.views || 0),
    likes: Number(existing.likes || 0),
    viewedBy: Array.isArray(existing.viewedBy) ? [...existing.viewedBy] : [],
    likedBy: Array.isArray(existing.likedBy) ? [...existing.likedBy] : []
  }
}

async function findExternalBuildInMongo(input: TrustedExternalBuildInput) {
  return BuildModel.findOne(externalBuildIdentity(input))
    .select('+provenance.contentHash +provenance.translation.sourceHash +viewedBy +likedBy')
    .lean()
}

/**
 * Trusted ingestion boundary for already normalized, attributed external builds.
 * HTTP request payloads must never be passed here directly.
 */
export async function upsertExternalBuild(input: TrustedExternalBuildInput) {
  if (!input.provenance || typeof input.provenance.site !== 'string' || typeof input.provenance.sourceId !== 'string') {
    throw new TypeError('External builds require a site and sourceId')
  }

  if (mongoReady) {
    const existing = await findExternalBuildInMongo(input) as StoredBuild | null
    const slug = existing?.slug || await resolveExternalSlug(input)
    const normalized = await normalizeExternalBuild(
      input,
      slug,
      existing?.provenance?.firstImportedAt
    )

    if (existing?.provenance?.contentHash === normalized.provenance?.contentHash) {
      const updated = await BuildModel.findByIdAndUpdate(
        (existing as Record<string, unknown>)._id,
        {
          $set: {
            'provenance.sourceUrl': normalized.provenance?.sourceUrl,
            'provenance.author': normalized.provenance?.author,
            'provenance.sourceCreatedAt': normalized.provenance?.sourceCreatedAt,
            'provenance.sourceUpdatedAt': normalized.provenance?.sourceUpdatedAt,
            'provenance.lastFetchedAt': normalized.provenance?.lastFetchedAt,
            ...(normalized.sourceMetrics ? { sourceMetrics: normalized.sourceMetrics } : {})
          },
          ...(!normalized.sourceMetrics ? { $unset: { sourceMetrics: 1 } } : {})
        },
        { new: true }
      ).select('-viewedBy -likedBy').lean()
      await redis?.del(buildsCacheKey).catch(() => undefined)
      return publicBuild((updated || existing) as unknown as Record<string, unknown>)
    }

    if (existing) {
      const replacement = preserveEngagement(existing, normalized) as StoredBuild & {
        _id?: unknown
        createdAt?: unknown
      }
      replacement._id = (existing as Record<string, unknown>)._id
      replacement.createdAt = (existing as Record<string, unknown>).createdAt
      await BuildModel.replaceOne(
        { _id: replacement._id },
        replacement,
        { runValidators: true }
      )
      const updated = await BuildModel.findById(replacement._id).select('-viewedBy -likedBy').lean()
      await redis?.del(buildsCacheKey).catch(() => undefined)
      return updated ? publicBuild(updated as unknown as Record<string, unknown>) : null
    }

    try {
      const created = await BuildModel.create(normalized)
      await redis?.del(buildsCacheKey).catch(() => undefined)
      return publicBuild(created.toObject())
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const concurrent = await findExternalBuildInMongo(input)
        if (concurrent) return upsertExternalBuild(input)
      }
      throw error
    }
  }

  const existingIndex = fallbackUserBuilds.findIndex(build =>
    build.provenance?.site === input.provenance.site
    && build.provenance?.sourceId === input.provenance.sourceId
  )
  const existing = existingIndex >= 0 ? fallbackUserBuilds[existingIndex] : undefined
  const slug = existing?.slug || await resolveExternalSlug(input)
  const normalized = await normalizeExternalBuild(
    input,
    slug,
    existing?.provenance?.firstImportedAt
  )

  if (existing && existing.provenance?.contentHash === normalized.provenance?.contentHash) {
    existing.provenance = {
      ...existing.provenance,
      sourceUrl: normalized.provenance?.sourceUrl,
      author: normalized.provenance?.author,
      sourceCreatedAt: normalized.provenance?.sourceCreatedAt,
      sourceUpdatedAt: normalized.provenance?.sourceUpdatedAt,
      lastFetchedAt: normalized.provenance?.lastFetchedAt
    }
    if (normalized.sourceMetrics) existing.sourceMetrics = normalized.sourceMetrics
    else delete existing.sourceMetrics
    await redis?.del(buildsCacheKey).catch(() => undefined)
    return publicBuild(existing)
  }

  if (existing) {
    const replacement = preserveEngagement(existing, normalized)
    fallbackUserBuilds.splice(existingIndex, 1, replacement)
    await redis?.del(buildsCacheKey).catch(() => undefined)
    return publicBuild(replacement)
  }

  fallbackUserBuilds.unshift(normalized)
  await redis?.del(buildsCacheKey).catch(() => undefined)
  return publicBuild(normalized)
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
