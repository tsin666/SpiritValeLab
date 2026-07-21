import Fastify from 'fastify'
import cors from '@fastify/cors'
import { ZodError, z } from 'zod'
import catalog from '../../../packages/game-data/src/catalog.json' with { type: 'json' }
import {
  closeServices,
  connectServices,
  createBuild,
  DuplicateBuildSlugError,
  getBuild,
  getServiceStatus,
  listBuilds,
  registerBuildView,
  toggleBuildLike
} from './services.js'
import {
  createEquipmentCatalog,
  equipmentCategories,
  findEquipment,
  listEquipment,
  type EquipmentRecord
} from './equipment.js'
import {
  archetypeRoles,
  archetypeStages,
  createArchetypeCatalog,
  createSkillCatalog,
  findArchetype,
  listArchetypes,
  skillsByIds,
  type ArchetypeRecord,
  type SkillRecord
} from './archetypes.js'
import { arrayOrEmpty, asRecord, canonical, flattenSearchText, humanize, readString, slugify } from './catalog-utils.js'
import {
  runtimeArchetypeRecords,
  runtimeCatalogKinds,
  runtimeDataMeta,
  runtimeEquipmentRecords,
  runtimeRecordsForKind,
  type RuntimeCatalogKind
} from './runtime-data.js'

const catalogKinds = runtimeCatalogKinds
const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  archetype: z.string().trim().max(50).optional(),
  sort: z.enum(['rank', 'newest', 'likes', 'views']).default('rank')
}).strict()
const buildEngagementSchema = z.object({ visitorId: z.string().uuid() }).strict()
const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0)
}).strict()
const equipmentQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(equipmentCategories).optional(),
  archetype: z.string().trim().min(1).max(80).optional(),
  slot: z.string().trim().min(1).max(80).optional(),
  type: z.string().trim().min(1).max(80).optional(),
  element: z.string().trim().min(1).max(80).optional(),
  level: z.coerce.number().int().min(0).max(10_000).optional(),
  setId: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24)
}).strict()
const archetypeQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  role: z.enum(archetypeRoles).optional(),
  stage: z.enum(archetypeStages).optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(40)
}).strict()
const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9-]*$/)
}).strict()
const catalogDetailParamsSchema = z.object({
  kind: z.enum(catalogKinds),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9][a-z0-9-]*$/)
}).strict()
const buildSelectionSchema = z.object({
  id: z.string().trim().min(1).max(120)
}).strict()
const equipmentSelectionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  slot: z.string().trim().min(1).max(50).optional()
}).strict()
const createBuildSchema = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  title: z.string().trim().min(2).max(100),
  archetype: z.string().trim().min(1).max(80),
  difficulty: z.enum(['入门', '进阶', '专家']),
  summary: z.string().trim().min(5).max(600),
  guide: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  skills: z.array(buildSelectionSchema).min(1).max(8),
  equipment: z.array(equipmentSelectionSchema).max(12).default([]),
  createdBy: z.string().trim().min(1).max(50).default('local-user')
}).strict()

export type BuildAppOptions = {
  equipmentRecords?: readonly unknown[]
  archetypeRecords?: readonly unknown[]
  skillRecords?: readonly unknown[]
}

type BuildSummary = {
  slug: string
  title: string
  titleEn: string
  archetype: string
  archetypeZh: string
  tier: string
  summary: string
  summaryEn: string
  color: string | null
  classIcon: string | null
  userGenerated: boolean
}

function summarizeBuild(value: unknown): BuildSummary | null {
  const build = asRecord(value)
  const slug = readString(build.slug)
  if (!slug) return null
  return {
    slug,
    title: readString(build.title) || slug,
    titleEn: readString(build.titleEn) || '',
    archetype: readString(build.archetype) || '',
    archetypeZh: readString(build.archetypeZh) || '',
    tier: readString(build.tier) || '',
    summary: readString(build.summary) || '',
    summaryEn: readString(build.summaryEn) || '',
    color: readString(build.color),
    classIcon: readString(build.classIcon),
    userGenerated: build.userGenerated === true
  }
}

function equipmentBuildTokens(item: EquipmentRecord): Set<string> {
  return new Set([item.id, item.slug, item.name.zh, item.name.en, item.displayName].filter(Boolean).map(canonical))
}

function relatedBuildsForEquipment(allBuilds: unknown[], item: EquipmentRecord): BuildSummary[] {
  const tokens = equipmentBuildTokens(item)
  return allBuilds
    .filter(value => arrayOrEmpty(asRecord(value).equipment).some(entry => {
      const equipment = asRecord(entry)
      return [readString(equipment.id), readString(equipment.name)]
        .filter((candidate): candidate is string => Boolean(candidate))
        .some(candidate => tokens.has(canonical(candidate)))
    }))
    .map(summarizeBuild)
    .filter((build): build is BuildSummary => Boolean(build))
}

function relatedBuildsForArchetype(allBuilds: unknown[], archetype: ArchetypeRecord): BuildSummary[] {
  const tokens = new Set([archetype.id, archetype.slug, archetype.name.en, archetype.name.zh].map(canonical))
  return allBuilds
    .filter(value => {
      const build = asRecord(value)
      return [readString(build.archetype), readString(build.archetypeZh)]
        .filter((candidate): candidate is string => Boolean(candidate))
        .some(candidate => tokens.has(canonical(candidate)))
    })
    .map(summarizeBuild)
    .filter((build): build is BuildSummary => Boolean(build))
}

function optionName(record: { name: { zh: string; en: string } }) {
  return { zh: record.name.zh, en: record.name.en }
}

function selectionMap<T extends { id: string; slug: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    map.set(canonical(item.id), item)
    map.set(canonical(item.slug), item)
  }
  return map
}

function recordsForCatalogKind(kind: RuntimeCatalogKind): { records: unknown[]; source: string; runtime: boolean } {
  return { records: runtimeRecordsForKind(kind), source: runtimeDataMeta.source, runtime: true }
}

function buildRankScore(value: unknown) {
  const record = asRecord(value)
  return Math.max(0, Number(record.likes) || 0) * 5 + Math.max(0, Number(record.views) || 0)
}

function buildCreatedTime(value: unknown) {
  const record = asRecord(value)
  const raw = record.createdAt || record.savedAt || record.updatedAt
  const time = raw instanceof Date ? raw.getTime() : Date.parse(String(raw || ''))
  return Number.isFinite(time) ? time : 0
}

function compactCatalogItem(value: unknown, kind: RuntimeCatalogKind) {
  const record = asRecord(value)
  const artifactPartIcon = kind === 'artifacts' ? readString(asRecord(arrayOrEmpty(record.parts)[0]).icon) : null
  const common = {
    id: record.id,
    slug: record.slug,
    name: record.name,
    displayName: record.displayName,
    description: record.description,
    icon: record.icon || artifactPartIcon
  }
  const stats = arrayOrEmpty(record.stats).slice(0, 3)
  if (kind === 'skills') {
    const scaled = asRecord(record.scaledValues)
    return {
      ...common,
      maxLevel: record.maxLevel,
      element: record.element,
      damageType: record.damageType,
      targetType: record.targetType,
      castType: record.castType,
      cooldown: scaled.cooldown,
      cost: scaled.cost,
      requirements: arrayOrEmpty(record.requirements).slice(0, 2),
      statusEffects: arrayOrEmpty(record.statusEffects).slice(0, 2)
    }
  }
  if (kind === 'skillPassives') return { ...common, maxLevel: record.maxLevel, stats }
  if (kind === 'equips') {
    return {
      ...common,
      type: record.type,
      element: record.element,
      levelRequired: record.levelRequired,
      setId: record.setId,
      stats,
      affixes: arrayOrEmpty(record.affixes).slice(0, 2),
      availableAffixes: arrayOrEmpty(record.availableAffixes).slice(0, 2)
    }
  }
  if (kind === 'equipment-sets') return { ...common, memberCount: record.memberCount, stats: arrayOrEmpty(record.fullSet).slice(0, 3) }
  if (kind === 'substat-pools') {
    const groups = arrayOrEmpty(record.groups)
    return {
      ...common,
      groupCount: groups.length,
      candidateCount: groups.reduce<number>((count, value) => count + arrayOrEmpty(asRecord(value).stats).length, 0)
    }
  }
  if (kind === 'archetype-skill-relations') {
    return { ...common, archetypeId: record.archetypeId, skillId: record.skillId, relationKind: record.kind, configKind: record.configKind }
  }
  if (kind === 'artifacts') return { ...common, stats, partCount: arrayOrEmpty(record.parts).length }
  if (kind === 'gems') return { ...common, affix: record.affix, stats, isBoss: record.isBoss }
  if (kind === 'cards') return { ...common, equipClass: record.equipClass, affix: record.affix, stats, unique: record.unique, isBoss: record.isBoss }
  if (kind === 'monsters') {
    return {
      ...common,
      level: record.level,
      race: record.race,
      element: record.element,
      size: record.size,
      isBoss: record.isBoss,
      archetype: record.archetype,
      skills: arrayOrEmpty(record.skills).slice(0, 2)
    }
  }
  if (kind === 'monster-archetypes') {
    return { ...common, attributes: record.attributes, moveSpeed: record.moveSpeed, attackSpeed: record.attackSpeed, ranged: record.ranged }
  }
  if (kind === 'statuses') return { ...common, category: record.category, element: record.element, maxStacks: record.maxStacks, fixedDuration: record.fixedDuration, stats }
  if (kind === 'archetypes') {
    return {
      ...common,
      role: record.role,
      stage: record.stage,
      requiredClassId: record.requiredClassId,
      advancesToIds: arrayOrEmpty(record.advancesToIds),
      maxJobLevel: record.maxJobLevel,
      previewSkills: arrayOrEmpty(record.previewSkills).slice(0, 4)
    }
  }
  if (kind === 'weapons') {
    return { ...common, attackDelay: record.attackDelay, allowedArchetypes: record.allowedArchetypes, statScalings: record.statScalings }
  }
  return common
}

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(value => value.trim()).filter(Boolean)
    || ['http://127.0.0.1:3000', 'http://localhost:3000']
  await app.register(cors, { origin: allowedOrigins })
  await connectServices()
  const equipmentIndex = createEquipmentCatalog(options.equipmentRecords || runtimeEquipmentRecords)
  const archetypeIndex = createArchetypeCatalog(options.archetypeRecords || runtimeArchetypeRecords)
  const runtimeSkills = runtimeRecordsForKind('skills')
  const skillCatalog = createSkillCatalog(options.skillRecords || (runtimeSkills.length ? runtimeSkills : catalog.skills as unknown[]))
  const allEquipment = listEquipment(equipmentIndex, { page: 1, pageSize: 100 }).items.length === equipmentIndex.length
    ? listEquipment(equipmentIndex, { page: 1, pageSize: 100 }).items
    : equipmentIndex.map(entry => entry.item)
  const allArchetypes = listArchetypes(archetypeIndex, { page: 1, pageSize: 100 }).items
  const recommendedArchetypesBySkill = new Map<string, string[]>()
  for (const archetype of allArchetypes) {
    for (const skillId of archetype.previewSkills) {
      const key = canonical(skillId)
      const recommendations = recommendedArchetypesBySkill.get(key) || []
      if (!recommendations.some(value => canonical(value) === canonical(archetype.id))) recommendations.push(archetype.id)
      recommendedArchetypesBySkill.set(key, recommendations)
    }
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', code: 'VALIDATION_ERROR', details: error.issues })
    }
    if (error instanceof DuplicateBuildSlugError) {
      return reply.code(409).send({ error: 'Build slug already exists', code: 'BUILD_SLUG_EXISTS', slug: error.slug })
    }
    app.log.error(error)
    return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL_ERROR' })
  })

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'Route not found', code: 'NOT_FOUND' }))

  app.get('/api/health', async () => ({
    ok: true,
    services: await getServiceStatus(),
    game: 'SpiritVale',
    localizedCatalogEntries: catalog.meta.entryCount,
    equipmentEntries: equipmentIndex.length,
    archetypeEntries: archetypeIndex.length,
    archetypeSkillRelationEntries: runtimeDataMeta.archetypeSkillRelationCount,
    skillEntries: runtimeDataMeta.skillCount,
    skillPassiveEntries: runtimeDataMeta.skillPassiveCount,
    artifactEntries: runtimeDataMeta.artifactCount,
    gemEntries: runtimeDataMeta.gemCount,
    cardEntries: runtimeDataMeta.cardCount,
    monsterArchetypeEntries: runtimeDataMeta.monsterArchetypeCount,
    monsterEntries: runtimeDataMeta.monsterCount,
    statusEntries: runtimeDataMeta.statusCount,
    weaponEntries: runtimeDataMeta.weaponCount,
    runtimeCatalogCollections: runtimeDataMeta.runtimeCatalogCollectionCount,
    runtimeCatalogEntries: runtimeDataMeta.runtimeCatalogEntryCount,
    runtimeSpriteEntries: runtimeDataMeta.spriteCount,
    equipmentSetEntries: runtimeDataMeta.equipmentSetCount,
    substatPoolEntries: runtimeDataMeta.substatPoolCount,
    runtimeDataSource: runtimeDataMeta.source
  }))

  app.get('/api/builds', async request => {
    const query = searchSchema.parse(request.query)
    const all = await listBuilds()
    const filtered = all.filter(build => {
      const record = asRecord(build)
      const text = flattenSearchText(record).toLocaleLowerCase('en-US')
      const archetype = readString(record.archetype) || ''
      return (!query.q || text.includes(query.q.toLocaleLowerCase('en-US')))
        && (!query.archetype || canonical(archetype) === canonical(query.archetype))
    })
    return filtered
      .map((build): Record<string, unknown> & { rankScore: number } => ({ ...asRecord(build), rankScore: buildRankScore(build) }))
      .sort((left, right) => {
        if (query.sort === 'newest') return buildCreatedTime(right) - buildCreatedTime(left)
        if (query.sort === 'likes') return Number(right.likes || 0) - Number(left.likes || 0) || buildCreatedTime(right) - buildCreatedTime(left)
        if (query.sort === 'views') return Number(right.views || 0) - Number(left.views || 0) || buildCreatedTime(right) - buildCreatedTime(left)
        return Number(right.rankScore) - Number(left.rankScore)
          || Number(right.likes || 0) - Number(left.likes || 0)
          || Number(right.views || 0) - Number(left.views || 0)
          || buildCreatedTime(right) - buildCreatedTime(left)
      })
  })

  app.post('/api/builds', async (request, reply) => {
    const services = await getServiceStatus()
    if (!services.mongo && process.env.NODE_ENV !== 'test') {
      return reply.code(503).send({ error: 'Build persistence is unavailable', code: 'MONGO_UNAVAILABLE' })
    }
    const input = createBuildSchema.parse(request.body)
    const archetype = findArchetype(archetypeIndex, input.archetype)
    if (!archetype) return reply.code(400).send({ error: 'Unknown archetype', code: 'UNKNOWN_ARCHETYPE', value: input.archetype })

    const skillsById = selectionMap(skillCatalog)
    const equipmentById = selectionMap(allEquipment)
    const selectedSkills: SkillRecord[] = []
    for (const selection of input.skills) {
      const skill = skillsById.get(canonical(selection.id))
      if (!skill) return reply.code(400).send({ error: 'Unknown skill', code: 'UNKNOWN_SKILL', value: selection.id })
      if (skill.allowedArchetypes.length && !skill.allowedArchetypes.some(value => canonical(value) === canonical(archetype.id))) {
        return reply.code(400).send({ error: 'Skill is not available to this archetype', code: 'SKILL_ARCHETYPE_MISMATCH', value: selection.id })
      }
      selectedSkills.push(skill)
    }
    const selectedEquipment: Array<{ item: EquipmentRecord; slot?: string }> = []
    for (const selection of input.equipment) {
      const item = equipmentById.get(canonical(selection.id))
      if (!item) return reply.code(400).send({ error: 'Unknown equipment', code: 'UNKNOWN_EQUIPMENT', value: selection.id })
      if (item.allowedArchetypes.length && !item.allowedArchetypes.some(value => canonical(value) === canonical(archetype.id))) {
        return reply.code(400).send({ error: 'Equipment is not available to this archetype', code: 'EQUIPMENT_ARCHETYPE_MISMATCH', value: selection.id })
      }
      selectedEquipment.push({ item, slot: selection.slot })
    }

    const existing = await listBuilds()
    const archetypeTemplate = existing.map(asRecord).find(build => canonical(readString(build.archetype) || '') === canonical(archetype.id))
    const created = await createBuild({
      ...input,
      archetype: archetype.id,
      archetypeZh: archetype.name.zh,
      color: readString(archetypeTemplate?.color) || '#668f7a',
      classIcon: archetype.icon || archetype.fallbackIcon || readString(archetypeTemplate?.classIcon) || undefined,
      skills: selectedSkills.map(skill => ({
        id: skill.id,
        slug: skill.slug,
        name: skill.name.en || skill.name.zh,
        nameZh: skill.name.zh,
        nameEn: skill.name.en,
        icon: skill.icon || undefined
      })),
      equipment: selectedEquipment.map(({ item, slot }) => ({
        id: item.id,
        slug: item.slug,
        name: item.name.en || item.name.zh,
        nameZh: item.name.zh,
        nameEn: item.name.en,
        slot: slot || item.slot || item.categoryLabel.zh,
        icon: item.icon || undefined
      }))
    })
    return reply.code(201).send(created)
  })

  app.get('/api/builds/:slug', async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params)
    const build = await getBuild(slug)
    if (!build) return reply.code(404).send({ error: 'Build not found', code: 'BUILD_NOT_FOUND' })
    return build
  })

  app.post('/api/builds/:slug/view', async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params)
    const { visitorId } = buildEngagementSchema.parse(request.body)
    const result = await registerBuildView(slug, visitorId)
    if (!result) return reply.code(404).send({ error: 'Build not found', code: 'BUILD_NOT_FOUND' })
    return result
  })

  app.post('/api/builds/:slug/like', async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params)
    const { visitorId } = buildEngagementSchema.parse(request.body)
    const result = await toggleBuildLike(slug, visitorId)
    if (!result) return reply.code(404).send({ error: 'Build not found', code: 'BUILD_NOT_FOUND' })
    return result
  })

  app.get('/api/equipment', async request => {
    const query = equipmentQuerySchema.parse(request.query)
    return listEquipment(equipmentIndex, query)
  })

  app.get('/api/equipment/:slug', async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params)
    const item = findEquipment(equipmentIndex, slug)
    if (!item) return reply.code(404).send({ error: 'Equipment not found', code: 'EQUIPMENT_NOT_FOUND' })
    return { ...item, relatedBuilds: relatedBuildsForEquipment(await listBuilds(), item) }
  })

  app.get('/api/archetypes', async request => {
    const query = archetypeQuerySchema.parse(request.query)
    return listArchetypes(archetypeIndex, query)
  })

  app.get('/api/archetypes/:slug', async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params)
    const archetype = findArchetype(archetypeIndex, slug)
    if (!archetype) return reply.code(404).send({ error: 'Archetype not found', code: 'ARCHETYPE_NOT_FOUND' })
    const allBuilds = await listBuilds()
    const relatedBuilds = relatedBuildsForArchetype(allBuilds, archetype)
    const buildSkillIds = allBuilds
      .filter(build => canonical(readString(asRecord(build).archetype) || '') === canonical(archetype.id))
      .flatMap(build => arrayOrEmpty(asRecord(build).skills).map(skill => readString(asRecord(skill).id)).filter((id): id is string => Boolean(id)))
    const equipment = allEquipment
      .filter(item => item.allowedArchetypes.some(value => canonical(value) === canonical(archetype.id)))
      .map(item => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        icon: item.icon,
        type: item.type,
        slot: item.slot,
        element: item.element,
        levelRequired: item.levelRequired,
        setId: item.setId
      }))
    const requiredClass = archetype.requiredClassId
      ? findArchetype(archetypeIndex, archetype.requiredClassId)
      : null
    const advancesTo = archetype.advancesToIds
      .map(id => findArchetype(archetypeIndex, id))
      .filter((item): item is ArchetypeRecord => Boolean(item))
    const compactArchetype = (item: ArchetypeRecord) => ({
      id: item.id,
      slug: item.slug,
      name: item.name,
      displayName: item.displayName,
      description: item.description,
      icon: item.icon,
      fallbackIcon: item.fallbackIcon,
      fallbackIconSource: item.fallbackIconSource,
      fallbackIconBasis: item.fallbackIconBasis,
      role: item.role,
      roleLabel: item.roleLabel,
      stage: item.stage,
      stageLabel: item.stageLabel
    })
    const advancementOptions = archetype.advancesToIds.map(id => {
      const configured = findArchetype(archetypeIndex, id)
      return configured
        ? { ...compactArchetype(configured), configPresent: true }
        : {
            id,
            slug: slugify(id),
            name: { zh: '', en: humanize(id) },
            displayName: humanize(id),
            description: { zh: '', en: '' },
            icon: null,
            role: null,
            roleLabel: null,
            stage: 'advanced',
            stageLabel: { zh: '进阶职业', en: 'Advanced class' },
            configPresent: false
          }
    })
    return {
      ...archetype,
      requiredClass: requiredClass ? compactArchetype(requiredClass) : null,
      advancesTo: advancesTo.map(compactArchetype),
      advancementOptions,
      previewSkills: skillsByIds(skillCatalog, archetype.previewSkills),
      buildReferencedSkills: skillsByIds(skillCatalog, buildSkillIds),
      equipment,
      relatedBuilds
    }
  })

  app.get('/api/builder/options', async request => {
    z.object({}).strict().parse(request.query)
    return {
      archetypes: allArchetypes.map(item => ({
        id: item.id,
        slug: item.slug,
        name: optionName(item),
        role: item.role,
        stage: item.stage,
        requiredClassId: item.requiredClassId,
        icon: item.icon,
        fallbackIcon: item.fallbackIcon,
        fallbackIconSource: item.fallbackIconSource,
        fallbackIconBasis: item.fallbackIconBasis
      })),
      skills: skillCatalog.map(item => ({
        id: item.id,
        slug: item.slug,
        name: optionName(item),
        allowedArchetypes: item.allowedArchetypes,
        recommendedArchetypes: recommendedArchetypesBySkill.get(canonical(item.id)) || [],
        icon: item.icon
      })),
      equipment: allEquipment.map(item => ({
        id: item.id,
        slug: item.slug,
        name: optionName(item),
        category: item.category,
        slot: item.slot,
        type: item.type,
        element: item.element,
        levelRequired: item.levelRequired,
        allowedArchetypes: item.allowedArchetypes,
        hasArchetypeRestriction: item.allowedArchetypes.length > 0,
        icon: item.icon
      })),
      difficulties: ['入门', '进阶', '专家']
    }
  })

  app.get('/api/catalog/:kind', async request => {
    const { kind } = z.object({ kind: z.enum(catalogKinds) }).strict().parse(request.params)
    const query = catalogQuerySchema.parse(request.query)
    const catalogSection = recordsForCatalogKind(kind)
    const records = catalogSection.records.filter(item => !query.q || flattenSearchText(item).toLocaleLowerCase('en-US').includes(query.q.toLocaleLowerCase('en-US')))
    return {
      items: records.slice(query.offset, query.offset + query.limit).map(item => compactCatalogItem(item, kind)),
      total: records.length,
      limit: query.limit,
      offset: query.offset,
      source: catalogSection.source,
      runtime: catalogSection.runtime
    }
  })

  app.get('/api/catalog/:kind/:slug', async (request, reply) => {
    const { kind, slug } = catalogDetailParamsSchema.parse(request.params)
    const catalogSection = recordsForCatalogKind(kind)
    const key = canonical(slug)
    const item = catalogSection.records.find(value => {
      const record = asRecord(value)
      return [readString(record.slug), readString(record.id)]
        .filter((candidate): candidate is string => Boolean(candidate))
        .some(candidate => canonical(candidate) === key)
    })
    if (!item) return reply.code(404).send({ error: 'Catalog entry not found', code: 'CATALOG_ENTRY_NOT_FOUND' })
    return { ...asRecord(item), catalogKind: kind, dataSource: catalogSection.source, runtime: catalogSection.runtime }
  })

  app.addHook('onClose', closeServices)
  return app
}
