import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
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
  archetypeLineageIds,
  inheritsArchetype,
  listArchetypes,
  skillsByIds,
  type ArchetypeRecord,
  type SkillRecord
} from './archetypes.js'
import { arrayOrEmpty, asRecord, canonical, flattenSearchText, humanize, localized, readString, slugify } from './catalog-utils.js'
import {
  runtimeArchetypeRecords,
  ArtifactSlot,
  EquipSlot,
  runtimeCatalogKinds,
  runtimeDataMeta,
  runtimeEquipmentRecords,
  runtimeEquipmentSetRecords,
  runtimeRecordsForKind,
  StanceType,
  StatType,
  type RuntimeCatalogKind
} from './runtime-data.js'
import { createOcrCatalogMatcher, ocrCatalogKinds, type OcrCatalogSources } from './ocr/catalog-matcher.js'
import { guideHtmlTextLength, MAX_GUIDE_TEXT_LENGTH, sanitizeGuideHtml } from './guide-html.js'

const catalogKinds = runtimeCatalogKinds
const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  archetype: z.string().trim().max(50).optional(),
  origin: z.enum(['all', 'user', 'external']).default('all'),
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
  compatible: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
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
const finiteBuildNumberSchema = z.number().finite().min(-1_000_000_000).max(1_000_000_000)
const runtimeEffectValueSchema = z.object({
  base: z.number().finite(),
  perLevel: z.number().finite(),
  string: z.string(),
  string2: z.string()
}).strict()
const runtimeEffectSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  typeValue: z.number().int(),
  value: runtimeEffectValueSchema,
  eventType: z.string().min(1),
  eventTypeValue: z.number().int(),
  eventValue: z.string(),
  conditionType: z.string().min(1),
  conditionTypeValue: z.number().int(),
  conditionValue: z.string(),
  chance: z.number().finite(),
  triggerType: z.string().min(1),
  triggerTypeValue: z.number().int(),
  target: z.string().min(1),
  targetValue: z.number().int()
}).strict()
const runtimeRequirementSchema = z.object({
  skillId: z.string().min(1),
  level: z.number().int().min(0),
  resolvedConfigKind: z.enum(['active', 'passive'])
}).strict()
const statTypeSchema = z.enum(StatType as unknown as [string, ...string[]])
const stanceTypeSchema = z.enum(StanceType as unknown as [string, ...string[]])
const artifactSlotSchema = z.enum(ArtifactSlot as unknown as [string, ...string[]])
const equipSlotKeyByName: Readonly<Record<string, string>> = {
  Mainhand: 'main-hand',
  Offhand: 'off-hand',
  Head: 'head',
  Legs: 'legs',
  Feet: 'feet',
  Chest: 'chest',
  AccessoryLeft: 'accessory-left',
  AccessoryRight: 'accessory-right',
  Eyewear: 'eyewear',
  Back: 'back'
}
const buildEquipSlotKeys = EquipSlot
  .map(name => equipSlotKeyByName[name])
  .filter((value): value is string => Boolean(value))
const equipSlotKeySchema = z.enum(buildEquipSlotKeys as unknown as [string, ...string[]])
const buildStatValueSchema = z.object({
  type: statTypeSchema,
  value: finiteBuildNumberSchema,
  bonus: finiteBuildNumberSchema.optional(),
  unit: z.enum(['flat', 'percent']).default('flat'),
  subjectId: z.string().trim().min(1).max(120).optional()
}).strict()
const uniqueStatTypes = (items: Array<{ type: string }>) => new Set(items.map(item => item.type)).size === items.length
const uniqueStatSubjects = (items: Array<{ type: string; subjectId?: string }>) => new Set(items
  .map(item => `${item.type}:${canonical(item.subjectId || '')}`)).size === items.length
const buildStatValuesSchema = (maximum: number, uniqueness: 'type' | 'subject' = 'subject') => z.array(buildStatValueSchema).max(maximum)
  .refine(uniqueness === 'type' ? uniqueStatTypes : uniqueStatSubjects, {
    message: uniqueness === 'type' ? 'Stat types must be unique' : 'Stat type and subject pairs must be unique'
  })
const equipmentCardSelectionSchema = z.object({
  slotIndex: z.number().int().min(0).max(3),
  id: z.string().trim().min(1).max(120)
}).strict()
const equipmentSelectionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  slot: z.string().trim().min(1).max(50).optional(),
  slotKey: equipSlotKeySchema.optional(),
  refineLevel: z.number().int().min(0).max(100).optional(),
  potential: z.number().int().min(0).max(100).optional(),
  actualAffixes: buildStatValuesSchema(8).default([]),
  cards: z.array(equipmentCardSelectionSchema).max(4)
    .refine(items => new Set(items.map(item => item.slotIndex)).size === items.length, { message: 'Equipment card slot indexes must be unique' })
    .default([])
}).strict()
const characterSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  level: z.number().int().min(1).max(1000).optional(),
  jobLevel: z.number().int().min(0).max(1000).optional(),
  stance: stanceTypeSchema.optional(),
  stats: buildStatValuesSchema(64, 'type').default([])
}).strict()
const skillTreeSelectionSchema = z.object({
  kind: z.enum(['active', 'passive']),
  id: z.string().trim().min(1).max(120),
  level: z.number().int().min(0).max(10),
  treeArchetype: z.string().trim().min(1).max(80)
}).strict()
const artifactSelectionSchema = z.object({
  slot: artifactSlotSchema,
  partIndex: z.number().int().min(0).max(3),
  id: z.string().trim().min(1).max(120),
  refineLevel: z.number().int().min(0).max(100).optional(),
  actualAffixes: buildStatValuesSchema(8).default([]),
  gem: z.object({ id: z.string().trim().min(1).max(120) }).strict().optional()
}).strict()
const grimoireSelectionSchema = z.object({
  slotIndex: z.number().int().min(0).max(2),
  id: z.string().trim().min(1).max(120)
}).strict()
const ocrMatchLineSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.:-]+$/),
  text: z.string().trim().min(1).max(240),
  kinds: z.array(z.enum(ocrCatalogKinds)).min(1).max(ocrCatalogKinds.length).optional()
}).strict()
const ocrMatchSchema = z.object({
  lines: z.array(ocrMatchLineSchema).min(1).max(64)
    .refine(lines => new Set(lines.map(line => line.id)).size === lines.length, { message: 'OCR line ids must be unique' }),
  maxCandidates: z.number().int().min(1).max(5).default(5)
}).strict()
const hasUniqueSelectionIds = (items: Array<{ id: string }>) => new Set(items.map(item => canonical(item.id))).size === items.length
const slotKeyEquipmentSelectionsAreValid = (items: Array<{ slotKey?: string }>): boolean => {
  const usesSlotKeys = items.some(item => item.slotKey !== undefined)
  if (!usesSlotKeys) return true
  return items.every(item => item.slotKey !== undefined)
    && new Set(items.map(item => item.slotKey)).size === items.length
}
const guideHtmlSchema = z.string()
  .transform(sanitizeGuideHtml)
  .refine(value => guideHtmlTextLength(value) <= MAX_GUIDE_TEXT_LENGTH, {
    message: `Guide rich text must contain at most ${MAX_GUIDE_TEXT_LENGTH} characters`
  })
  .transform(value => guideHtmlTextLength(value) > 0 ? value : undefined)
const createBuildSchema = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9][a-z0-9-]*$/).optional(),
  title: z.string().trim().min(2).max(100),
  archetype: z.string().trim().min(1).max(80),
  difficulty: z.enum(['入门', '进阶', '专家']),
  summary: z.string().trim().min(5).max(600),
  guide: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  guideHtml: guideHtmlSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  snapshotVersion: z.literal(1).optional(),
  character: characterSnapshotSchema.optional(),
  skills: z.array(buildSelectionSchema).min(1).max(8)
    .refine(hasUniqueSelectionIds, { message: 'Duplicate skill selection' }),
  skillTree: z.array(skillTreeSelectionSchema).max(128)
    .refine(items => new Set(items.map(item => `${item.kind}:${canonical(item.id)}`)).size === items.length, { message: 'Duplicate skill tree selection' })
    .default([]),
  equipment: z.array(equipmentSelectionSchema).max(12)
    .refine(items => items.some(item => item.slotKey !== undefined) || hasUniqueSelectionIds(items), { message: 'Duplicate equipment selection' })
    .refine(slotKeyEquipmentSelectionsAreValid, { message: 'Equipment must use either unique ids or a complete set of unique slot keys' })
    .default([]),
  artifacts: z.array(artifactSelectionSchema).max(4)
    .refine(items => new Set(items.map(item => item.slot)).size === items.length, { message: 'Artifact slots must be unique' })
    .default([]),
  grimoires: z.array(grimoireSelectionSchema).max(3)
    .refine(items => new Set(items.map(item => item.slotIndex)).size === items.length, { message: 'Grimoire slot indexes must be unique' })
    .refine(hasUniqueSelectionIds, { message: 'Duplicate grimoire selection' })
    .default([]),
  createdBy: z.string().trim().min(1).max(50).default('local-user')
}).strict()

export type BuildAppOptions = {
  equipmentRecords?: readonly unknown[]
  archetypeRecords?: readonly unknown[]
  skillRecords?: readonly unknown[]
  ocrCatalogSources?: OcrCatalogSources
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

function runtimeSelectionMap(items: readonly unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  for (const value of items) {
    const item = asRecord(value)
    for (const candidate of [readString(item.id), readString(item.slug)]) {
      if (candidate) map.set(canonical(candidate), item)
    }
  }
  return map
}

function catalogSnapshot(item: Record<string, unknown>) {
  const id = readString(item.id) || 'unknown'
  const name = asRecord(item.name)
  const nameZh = readString(name.zh) || ''
  const nameEn = readString(name.en) || ''
  return {
    id,
    slug: readString(item.slug) || slugify(id),
    name: nameEn || nameZh || readString(item.displayName) || id,
    nameZh,
    nameEn,
    icon: readString(item.icon) || undefined
  }
}

function describedCatalogSnapshot(value: unknown): Record<string, unknown> {
  const item = asRecord(value)
  const description = asRecord(item.description)
  const descriptionZh = readString(description.zh)
  const descriptionEn = readString(description.en, item.runtimeDescription)
  return {
    ...catalogSnapshot(item),
    ...(descriptionZh ? { descriptionZh } : {}),
    ...(descriptionEn ? { descriptionEn } : {})
  }
}

function runtimeEffectSnapshots(value: unknown): Array<z.infer<typeof runtimeEffectSchema>> {
  return arrayOrEmpty(value).flatMap(effect => {
    // runtime-data enriches set effects with a derived requiredPieces field for
    // catalog browsing. It is not serialized by the game and therefore must
    // not enter an immutable BD source snapshot.
    const { requiredPieces: _derivedRequiredPieces, ...sourceEffect } = asRecord(effect)
    const parsed = runtimeEffectSchema.safeParse(sourceEffect)
    return parsed.success ? [parsed.data] : []
  })
}

function equipmentSetSnapshot(value: unknown): Record<string, unknown> | undefined {
  const item = asRecord(value)
  const id = readString(item.id)
  if (!id) return undefined
  const effects = runtimeEffectSnapshots(item.fullSet)
  const equipmentIds = arrayOrEmpty(item.equipmentIds)
    .map(readString)
    .filter((entry): entry is string => Boolean(entry))
  return {
    ...catalogSnapshot(item),
    equipmentIds,
    ...(effects.length ? { effects } : {})
  }
}

function grimoirePassiveSnapshot(value: unknown): Record<string, unknown> | undefined {
  const item = asRecord(value)
  const id = readString(item.id)
  if (!id) return undefined
  const description = asRecord(item.description)
  const effects = runtimeEffectSnapshots(item.passives)
  const weaponTypes = arrayOrEmpty(item.weaponTypes)
    .map(readString)
    .filter((entry): entry is string => Boolean(entry))
  const weaponTypeValues = arrayOrEmpty(item.weaponTypeValues)
    .filter((entry): entry is number => typeof entry === 'number' && Number.isInteger(entry))
  const stanceTypes = arrayOrEmpty(item.stanceTypes)
    .map(readString)
    .filter((entry): entry is string => Boolean(entry))
  const stanceTypeValues = arrayOrEmpty(item.stanceTypeValues)
    .filter((entry): entry is number => typeof entry === 'number' && Number.isInteger(entry))
  const requirements = arrayOrEmpty(item.requirements).flatMap(requirement => {
    const parsed = runtimeRequirementSchema.safeParse(requirement)
    return parsed.success ? [parsed.data] : []
  })
  return {
    ...catalogSnapshot(item),
    descriptionZh: readString(description.zh) || '',
    descriptionEn: readString(description.en) || '',
    maxLevel: typeof item.maxLevel === 'number' ? item.maxLevel : 0,
    weaponTypes,
    weaponTypeValues,
    stanceTypes,
    stanceTypeValues,
    requirements,
    ...(effects.length ? { effects } : {})
  }
}

function compactRuntimeOption(value: unknown) {
  const item = asRecord(value)
  const id = readString(item.id) || 'unknown'
  return {
    id,
    slug: readString(item.slug) || slugify(id),
    name: localized(item.name, readString(item.displayName) || id),
    icon: readString(item.icon)
  }
}

const weaponEquipTypes = new Set([
  'Sword', 'Dagger', 'Wand', 'Spear', 'Axe', 'Mace', 'Book', 'Pistol', 'Bow',
  'Scythe', 'Instrument', 'Twinblade', 'Mace2H', 'Sword2H', 'Axe2H', 'Spear2H',
  'Wand2H', 'Rifle', 'Shotgun', 'Launcher', 'GatlingGun', 'Katar'
].map(canonical))
const directEquipClasses = new Map([
  'Shield', 'Head', 'Legs', 'Feet', 'Chest', 'Accessory', 'Eyewear', 'Back', 'Grimoire'
].map(value => [canonical(value), value]))

function equipClassForType(type: string | null): string | null {
  const key = canonical(type || '')
  if (weaponEquipTypes.has(key)) return 'Weapon'
  return directEquipClasses.get(key) || null
}

function allowedEquipmentSlotKeys(item: EquipmentRecord): string[] {
  const type = canonical(item.type || '')
  if (weaponEquipTypes.has(type)) return ['main-hand', 'off-hand']
  if (type === canonical('Accessory')) return ['accessory-left', 'accessory-right']
  if (type === canonical('Shield')) return ['off-hand']
  const directSlots = ['Head', 'Back', 'Eyewear', 'Feet', 'Chest', 'Legs']
  const direct = directSlots.find(value => canonical(value) === type)
  return direct ? [slugify(direct)] : []
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
  const provenance = asRecord(record.provenance)
  const raw = readString(record.source) === 'external'
    ? provenance.sourceCreatedAt || provenance.sourceUpdatedAt || record.createdAt || record.savedAt || record.updatedAt
    : record.createdAt || record.savedAt || record.updatedAt
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
  await app.register(rateLimit, { global: false })
  await connectServices()
  const equipmentIndex = createEquipmentCatalog(options.equipmentRecords || runtimeEquipmentRecords)
  const archetypeIndex = createArchetypeCatalog(options.archetypeRecords || runtimeArchetypeRecords)
  const runtimeSkills = runtimeRecordsForKind('skills')
  const skillCatalog = createSkillCatalog(options.skillRecords || (runtimeSkills.length ? runtimeSkills : catalog.skills as unknown[]))
  const allEquipment = listEquipment(equipmentIndex, { page: 1, pageSize: 100 }).items.length === equipmentIndex.length
    ? listEquipment(equipmentIndex, { page: 1, pageSize: 100 }).items
    : equipmentIndex.map(entry => entry.item)
  const allArchetypes = listArchetypes(archetypeIndex, { page: 1, pageSize: 100 }).items
  const skillPassiveRecords = runtimeRecordsForKind('skillPassives')
  const artifactRecords = runtimeRecordsForKind('artifacts')
  const gemRecords = runtimeRecordsForKind('gems')
  const cardRecords = runtimeRecordsForKind('cards')
  const equipmentSetById = runtimeSelectionMap(runtimeEquipmentSetRecords)
  const activeSkillById = selectionMap(skillCatalog)
  const passiveSkillById = runtimeSelectionMap(skillPassiveRecords)
  const artifactById = runtimeSelectionMap(artifactRecords)
  const gemById = runtimeSelectionMap(gemRecords)
  const cardById = runtimeSelectionMap(cardRecords)
  const grimoireRecords = allEquipment.filter(item => canonical(item.type || '') === canonical('Grimoire'))
  const regularEquipmentRecords = allEquipment.filter(item => canonical(item.type || '') !== canonical('Grimoire'))
  const grimoireEquipmentById = selectionMap(grimoireRecords)
  const ocrCatalogMatcher = createOcrCatalogMatcher({
    archetype: options.ocrCatalogSources?.archetype ?? allArchetypes,
    skill: options.ocrCatalogSources?.skill ?? skillCatalog,
    equipment: options.ocrCatalogSources?.equipment ?? regularEquipmentRecords,
    grimoire: options.ocrCatalogSources?.grimoire ?? grimoireRecords,
    skillPassive: options.ocrCatalogSources?.skillPassive ?? skillPassiveRecords,
    artifact: options.ocrCatalogSources?.artifact ?? artifactRecords,
    gem: options.ocrCatalogSources?.gem ?? gemRecords,
    card: options.ocrCatalogSources?.card ?? cardRecords
  })
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
    const clientError = error !== null && typeof error === 'object'
      ? error as { statusCode?: unknown; code?: unknown; message?: unknown }
      : null
    if (typeof clientError?.statusCode === 'number' && clientError.statusCode >= 400 && clientError.statusCode < 500) {
      const body = clientError.statusCode === 413
        ? { error: 'Request body is too large', code: 'BODY_TOO_LARGE' }
        : clientError.statusCode === 415
          ? { error: 'Unsupported media type', code: 'UNSUPPORTED_MEDIA_TYPE' }
          : clientError.statusCode === 429
            ? { error: 'Too many requests', code: 'RATE_LIMITED' }
            : { error: 'Invalid request', code: 'REQUEST_ERROR' }
      return reply.code(clientError.statusCode).send(body)
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
      const source = readString(record.source) || (record.userGenerated === true ? 'user' : '')
      return (!query.q || text.includes(query.q.toLocaleLowerCase('en-US')))
        && (!query.archetype || canonical(archetype) === canonical(query.archetype))
        && (query.origin === 'all' || source === query.origin)
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

    const maxJobLevel = Number(archetype.maxJobLevel)
    if (input.character?.jobLevel !== undefined && Number.isFinite(maxJobLevel) && input.character.jobLevel > maxJobLevel) {
      return reply.code(400).send({
        error: 'Job level exceeds the selected archetype limit',
        code: 'CHARACTER_JOB_LEVEL_EXCEEDS_MAX',
        value: input.character.jobLevel,
        maxJobLevel
      })
    }

    const skillsById = selectionMap(skillCatalog)
    const equipmentById = selectionMap(allEquipment)
    const selectedSkills: SkillRecord[] = []
    for (const selection of input.skills) {
      const skill = skillsById.get(canonical(selection.id))
      if (!skill) return reply.code(400).send({ error: 'Unknown skill', code: 'UNKNOWN_SKILL', value: selection.id })
      if (skill.allowedArchetypes.length && !skill.allowedArchetypes.some(value => inheritsArchetype(archetype.id, value))) {
        return reply.code(400).send({ error: 'Skill is not available to this archetype', code: 'SKILL_ARCHETYPE_MISMATCH', value: selection.id })
      }
      selectedSkills.push(skill)
    }

    const lineageIds = archetypeLineageIds(archetype.id)
    const lineageById = new Map(lineageIds.map(id => [canonical(id), id]))
    const selectedSkillTree: Array<Record<string, unknown>> = []
    for (const selection of input.skillTree) {
      const skill = selection.kind === 'active'
        ? activeSkillById.get(canonical(selection.id))
        : passiveSkillById.get(canonical(selection.id))
      if (!skill) {
        const oppositeKindExists = selection.kind === 'active'
          ? passiveSkillById.has(canonical(selection.id))
          : activeSkillById.has(canonical(selection.id))
        return reply.code(400).send({
          error: oppositeKindExists ? 'Skill exists in the opposite catalog kind' : `Unknown ${selection.kind} skill`,
          code: oppositeKindExists
            ? 'SKILL_KIND_MISMATCH'
            : selection.kind === 'active' ? 'UNKNOWN_ACTIVE_SKILL' : 'UNKNOWN_PASSIVE_SKILL',
          value: selection.id
        })
      }
      // The extracted preview relation table is intentionally incomplete, so it
      // cannot prove full skill ownership. We only constrain the selected tree
      // to the class lineage and preserve that attribution as user-confirmed.
      const treeArchetype = lineageById.get(canonical(selection.treeArchetype))
      if (!treeArchetype) {
        return reply.code(400).send({
          error: 'Skill tree archetype is outside the selected archetype lineage',
          code: 'SKILL_TREE_ARCHETYPE_MISMATCH',
          value: selection.treeArchetype
        })
      }
      const skillRecord = asRecord(skill)
      const rawMaxLevel = Number(skillRecord.maxLevel)
      const hasCatalogMaxLevel = Number.isInteger(rawMaxLevel) && rawMaxLevel >= 0
      const maxLevel = hasCatalogMaxLevel ? rawMaxLevel : 0
      if (hasCatalogMaxLevel && selection.level > maxLevel) {
        return reply.code(400).send({
          error: 'Skill level exceeds the catalog maximum',
          code: 'SKILL_LEVEL_EXCEEDS_MAX',
          value: selection.id,
          level: selection.level,
          maxLevel
        })
      }
      const skillSnapshot = catalogSnapshot(skillRecord)
      const passiveEquipment = selection.kind === 'passive' ? equipmentById.get(canonical(skillSnapshot.id)) : null
      selectedSkillTree.push({
        ...skillSnapshot,
        icon: skillSnapshot.icon || passiveEquipment?.icon || undefined,
        kind: selection.kind,
        level: selection.level,
        treeArchetype,
        treeArchetypeSource: 'user-confirmed',
        maxLevel
      })
    }

    const selectedEquipment: Array<{
      item: EquipmentRecord
      selection: typeof input.equipment[number]
      cards: Array<Record<string, unknown>>
      set: Record<string, unknown> | undefined
    }> = []
    for (const selection of input.equipment) {
      const item = equipmentById.get(canonical(selection.id))
      if (!item) return reply.code(400).send({ error: 'Unknown equipment', code: 'UNKNOWN_EQUIPMENT', value: selection.id })
      if (canonical(item.type || '') === canonical('Grimoire')) {
        return reply.code(400).send({
          error: 'Grimoires must use the dedicated grimoire slots',
          code: 'GRIMOIRE_NOT_REGULAR_EQUIPMENT',
          value: selection.id
        })
      }
      if (item.allowedArchetypes.length && !item.allowedArchetypes.some(value => inheritsArchetype(archetype.id, value))) {
        return reply.code(400).send({ error: 'Equipment is not available to this archetype', code: 'EQUIPMENT_ARCHETYPE_MISMATCH', value: selection.id })
      }
      if (selection.slotKey) {
        const allowedSlotKeys = allowedEquipmentSlotKeys(item)
        if (!allowedSlotKeys.includes(selection.slotKey)) {
          return reply.code(400).send({
            error: 'Equipment does not fit the selected loadout slot',
            code: 'EQUIPMENT_SLOT_MISMATCH',
            value: selection.id,
            slotKey: selection.slotKey,
            allowedSlotKeys
          })
        }
      }
      // EquipConfig.slots is an unexplained source scalar, not the EquipSlot
      // enum. Do not reinterpret it as a card-capacity rule without evidence.
      const expectedCardClass = equipClassForType(item.type)
      const cards: Array<Record<string, unknown>> = []
      for (const cardSelection of selection.cards) {
        const card = cardById.get(canonical(cardSelection.id))
        if (!card) return reply.code(400).send({ error: 'Unknown card', code: 'UNKNOWN_CARD', value: cardSelection.id })
        const equipClass = readString(card.equipClass) || ''
        if (expectedCardClass && canonical(equipClass) !== canonical(expectedCardClass)) {
          return reply.code(400).send({
            error: 'Card is not compatible with this equipment type',
            code: 'CARD_EQUIPMENT_CLASS_MISMATCH',
            value: cardSelection.id,
            equipment: item.id,
            expectedEquipClass: expectedCardClass,
            actualEquipClass: equipClass
          })
        }
        cards.push({
          ...describedCatalogSnapshot(card),
          slotIndex: cardSelection.slotIndex,
          equipClass,
          stats: runtimeEffectSnapshots(card.stats)
        })
      }
      const setRecord = item.setId ? equipmentSetById.get(canonical(item.setId)) : undefined
      selectedEquipment.push({ item, selection, cards, set: equipmentSetSnapshot(setRecord) })
    }

    const selectedArtifacts: Array<Record<string, unknown>> = []
    for (const selection of input.artifacts) {
      const artifact = artifactById.get(canonical(selection.id))
      if (!artifact) return reply.code(400).send({ error: 'Unknown artifact', code: 'UNKNOWN_ARTIFACT', value: selection.id })
      const parts = arrayOrEmpty(artifact.parts)
      if (selection.partIndex >= parts.length) {
        return reply.code(400).send({
          error: 'Artifact part index is outside the catalog part list',
          code: 'ARTIFACT_PART_INDEX_OUT_OF_RANGE',
          value: selection.id,
          partIndex: selection.partIndex,
          partCount: parts.length
        })
      }
      // ArtifactSlot and the four serialized part arrays are separate sources;
      // keep the reviewed UI slot and part index without inventing a mapping.
      let gemSnapshot: Record<string, unknown> | undefined
      if (selection.gem) {
        const gem = gemById.get(canonical(selection.gem.id))
        if (!gem) return reply.code(400).send({ error: 'Unknown gem', code: 'UNKNOWN_GEM', value: selection.gem.id })
        gemSnapshot = {
          ...describedCatalogSnapshot(gem),
          affix: readString(gem.affix, gem.runtimeAffix) || undefined,
          stats: runtimeEffectSnapshots(gem.stats)
        }
      }
      const selectedPart = asRecord(parts[selection.partIndex])
      const partDescription = asRecord(selectedPart.description)
      selectedArtifacts.push({
        ...describedCatalogSnapshot(artifact),
        slot: selection.slot,
        partIndex: selection.partIndex,
        partIcon: readString(selectedPart.icon) || undefined,
        partDescriptionZh: readString(partDescription.zh) || undefined,
        partDescriptionEn: readString(partDescription.en, selectedPart.runtimeDescription) || undefined,
        fullSet: runtimeEffectSnapshots(artifact.fullSet),
        perPiece: runtimeEffectSnapshots(artifact.perPiece),
        perRefine: runtimeEffectSnapshots(artifact.perRefine),
        individual: runtimeEffectSnapshots(artifact.individual),
        refineLevel: selection.refineLevel,
        actualAffixes: selection.actualAffixes,
        gem: gemSnapshot
      })
    }

    const selectedGrimoires: Array<Record<string, unknown>> = []
    for (const selection of input.grimoires) {
      const item = equipmentById.get(canonical(selection.id))
      const passive = item ? passiveSkillById.get(canonical(item.id)) : null
      if (!item || canonical(item.type || '') !== canonical('Grimoire') || !passive) {
        return reply.code(400).send({ error: 'Unknown grimoire', code: 'UNKNOWN_GRIMOIRE', value: selection.id })
      }
      if (item.allowedArchetypes.length && !item.allowedArchetypes.some(value => inheritsArchetype(archetype.id, value))) {
        return reply.code(400).send({
          error: 'Grimoire is not available to this archetype',
          code: 'GRIMOIRE_ARCHETYPE_MISMATCH',
          value: selection.id
        })
      }
      selectedGrimoires.push({
        ...catalogSnapshot(asRecord(item)),
        slotIndex: selection.slotIndex,
        passive: grimoirePassiveSnapshot(passive)
      })
    }

    const existing = await listBuilds()
    const archetypeTemplate = existing.map(asRecord).find(build => canonical(readString(build.archetype) || '') === canonical(archetype.id))
    const hasRichSnapshot = Boolean(input.character)
      || input.skillTree.length > 0
      || input.artifacts.length > 0
      || input.grimoires.length > 0
      || input.equipment.some(selection => Boolean(
        selection.slotKey
        || selection.refineLevel !== undefined
        || selection.potential !== undefined
        || selection.actualAffixes.length
        || selection.cards.length
      ))
    const created = await createBuild({
      ...input,
      snapshotVersion: input.snapshotVersion ?? (hasRichSnapshot ? 1 : undefined),
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
      skillTree: selectedSkillTree,
      equipment: selectedEquipment.map(({ item, selection, cards, set }) => ({
        id: item.id,
        slug: item.slug,
        name: item.name.en || item.name.zh,
        nameZh: item.name.zh,
        nameEn: item.name.en,
        slot: selection.slot || item.slot || item.categoryLabel.zh,
        slotKey: selection.slotKey,
        icon: item.icon || undefined,
        descriptionZh: item.description.zh || undefined,
        descriptionEn: item.description.en || undefined,
        type: item.type || undefined,
        element: item.element || undefined,
        levelRequired: item.levelRequired ?? undefined,
        primaryStats: runtimeEffectSnapshots(item.primaryStats),
        secondaryStats: runtimeEffectSnapshots(item.secondaryStats),
        refineLevel: selection.refineLevel,
        potential: selection.potential,
        actualAffixes: selection.actualAffixes,
        cards,
        ...(item.setId ? { setId: item.setId } : {}),
        ...(set ? { set } : {})
      })),
      artifacts: selectedArtifacts,
      grimoires: selectedGrimoires
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

  app.post('/api/ocr/match', {
    bodyLimit: 32 * 1024,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async request => {
    const input = ocrMatchSchema.parse(request.body)
    return {
      source: 'text-only',
      reviewRequired: true,
      selectionsAccepted: false,
      lines: input.lines.map(line => ({
        lineId: line.id,
        ...ocrCatalogMatcher.match(line.text, { kinds: line.kinds, maxCandidates: input.maxCandidates })
      }))
    }
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
      .filter(item => item.allowedArchetypes.some(value => inheritsArchetype(archetype.id, value)))
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
        maxJobLevel: typeof item.maxJobLevel === 'number' ? item.maxJobLevel : null,
        advancementJobLevel: item.advancementJobLevel,
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
        maxLevel: typeof item.maxLevel === 'number' ? item.maxLevel : 0,
        configKind: readString(item.configKind) || 'active',
        icon: item.icon
      })),
      skillPassives: skillPassiveRecords.map(value => {
        const item = asRecord(value)
        const option = compactRuntimeOption(item)
        const grimoire = grimoireEquipmentById.get(canonical(option.id))
        return {
          ...option,
          icon: option.icon || grimoire?.icon || null,
          maxLevel: typeof item.maxLevel === 'number' ? item.maxLevel : 0,
          configKind: readString(item.configKind) || 'passive'
        }
      }),
      equipment: allEquipment.map(item => ({
        id: item.id,
        slug: item.slug,
        name: optionName(item),
        category: item.category,
        slot: item.slot,
        type: item.type,
        element: item.element,
        levelRequired: item.levelRequired,
        setId: item.setId,
        allowedArchetypes: item.allowedArchetypes,
        hasArchetypeRestriction: item.allowedArchetypes.length > 0,
        icon: item.icon
      })),
      equipmentSets: runtimeEquipmentSetRecords
        .map(equipmentSetSnapshot)
        .filter((item): item is Record<string, unknown> => Boolean(item)),
      grimoires: grimoireRecords.map(item => ({
        id: item.id,
        slug: item.slug,
        name: optionName(item),
        category: item.category,
        slot: item.slot,
        type: item.type,
        element: item.element,
        levelRequired: item.levelRequired,
        allowedArchetypes: item.allowedArchetypes,
        hasRestriction: item.allowedArchetypes.length > 0,
        hasArchetypeRestriction: item.allowedArchetypes.length > 0,
        icon: item.icon,
        passive: grimoirePassiveSnapshot(passiveSkillById.get(canonical(item.id)))
      })),
      artifacts: artifactRecords.map(value => {
        const item = asRecord(value)
        const option = compactRuntimeOption(item)
        const description = describedCatalogSnapshot(item)
        const parts = arrayOrEmpty(item.parts).map((partValue, index) => {
          const part = asRecord(partValue)
          return {
            index: typeof part.index === 'number' ? part.index : index,
            icon: readString(part.icon)
          }
        })
        return {
          ...option,
          icon: option.icon || parts[0]?.icon || null,
          descriptionZh: description.descriptionZh || null,
          descriptionEn: description.descriptionEn || null,
          fullSet: runtimeEffectSnapshots(item.fullSet),
          perPiece: runtimeEffectSnapshots(item.perPiece),
          perRefine: runtimeEffectSnapshots(item.perRefine),
          individual: runtimeEffectSnapshots(item.individual),
          parts,
          partCount: parts.length
        }
      }),
      gems: gemRecords.map(value => {
        const item = asRecord(value)
        const localizedAffix = asRecord(item.affix)
        const description = describedCatalogSnapshot(item)
        return {
          ...compactRuntimeOption(item),
          descriptionZh: description.descriptionZh || null,
          descriptionEn: description.descriptionEn || null,
          affix: Object.keys(localizedAffix).length
            ? localized(item.affix)
            : readString(item.runtimeAffix),
          stats: runtimeEffectSnapshots(item.stats),
          isBoss: item.isBoss === true
        }
      }),
      cards: cardRecords.map(value => {
        const item = asRecord(value)
        const description = describedCatalogSnapshot(item)
        return {
          ...compactRuntimeOption(item),
          descriptionZh: description.descriptionZh || null,
          descriptionEn: description.descriptionEn || null,
          equipClass: readString(item.equipClass),
          stats: runtimeEffectSnapshots(item.stats),
          unique: item.unique === true,
          isBoss: item.isBoss === true
        }
      }),
      equipmentSlots: EquipSlot.flatMap(sourceName => {
        const value = equipSlotKeyByName[sourceName]
        return value ? [{ value, sourceName }] : []
      }),
      artifactSlots: [...ArtifactSlot],
      stances: [...StanceType],
      statTypes: [...StatType],
      metadata: {
        skillTreeOwnership: 'user-confirmed',
        equipmentRuntimeSlotsMeaning: 'unverified',
        artifactPartSlotMapping: 'user-confirmed'
      },
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
