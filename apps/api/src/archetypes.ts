import {
  asRecord,
  canonical,
  flattenSearchText,
  humanize,
  localized,
  matchesQuery,
  readString,
  readStringList,
  slugify,
  type LocalizedText
} from './catalog-utils.js'
import lineage from '../../../packages/game-data/src/archetype-lineage.json' with { type: 'json' }

export const archetypeRoles = ['melee', 'ranged', 'magic', 'support', 'profession', 'other'] as const
export type ArchetypeRole = typeof archetypeRoles[number]
export const archetypeStages = ['base', 'advanced', 'special', 'profession'] as const
export type ArchetypeStage = typeof archetypeStages[number]
export type ArchetypeFallbackIconBasis = 'npc-config-same-id'

export type ArchetypeFallbackIconSource = Record<string, unknown> & {
  sourcePathId: number
  configClass: 'NpcConfig'
  configId: string
  configSourcePathId: number
  spriteId: string
}

const roleLabels: Record<ArchetypeRole, LocalizedText> = {
  melee: { zh: '近战', en: 'Melee' },
  ranged: { zh: '远程', en: 'Ranged' },
  magic: { zh: '法术', en: 'Magic' },
  support: { zh: '辅助', en: 'Support' },
  profession: { zh: '生活职业', en: 'Profession' },
  other: { zh: '其他', en: 'Other' }
}
const stageLabels: Record<ArchetypeStage, LocalizedText> = {
  base: { zh: '基础职业', en: 'Base class' },
  advanced: { zh: '进阶职业', en: 'Advanced class' },
  special: { zh: '特殊职业', en: 'Special class' },
  profession: { zh: '生活 / 服务职业', en: 'Profession / utility' }
}

const derivedRoles: Record<string, ArchetypeRole> = Object.fromEntries([
  ...['Assassin', 'Berserker', 'DragonKnight', 'Knight', 'Monk', 'Paladin', 'Revenant', 'Rogue', 'Shinobi', 'Warrior'].map(id => [canonical(id), 'melee']),
  ...['Gunslinger', 'Ranger', 'Scout'].map(id => [canonical(id), 'ranged']),
  ...['Mage', 'Necromancer', 'Warlock', 'Weaver', 'Wizard'].map(id => [canonical(id), 'magic']),
  ...['Acolyte', 'Chronomancer', 'Druid', 'Jester', 'Priest', 'Summoner'].map(id => [canonical(id), 'support']),
  ...['Artificer', 'Blacksmith', 'Cardweaver', 'Craftsman', 'Gemsmith', 'Merchant', 'Stylist'].map(id => [canonical(id), 'profession'])
] as Array<[string, ArchetypeRole]>)
const baseArchetypes = new Set(lineage.baseArchetypes.map(canonical))
const specialArchetypes = new Set(lineage.specialArchetypes.map(canonical))
const professionArchetypes = new Set(lineage.professionArchetypes.map(canonical))
const requiredClassByArchetype = new Map(Object.entries(lineage.requiredClassByArchetype).map(([id, base]) => [canonical(id), base]))
const advancesToByBase = new Map<string, string[]>()
for (const [advanced, base] of Object.entries(lineage.requiredClassByArchetype)) {
  const key = canonical(base)
  advancesToByBase.set(key, [...(advancesToByBase.get(key) || []), advanced])
}

/**
 * Returns a target class followed by every base class it can legitimately
 * inherit from. The game binary's `GetRequiredClass` table is the source of
 * truth. We keep the original IDs for API consumers but use canonical keys
 * and a visited set so malformed future lineage data cannot loop forever.
 *
 * Special, profession and unknown classes deliberately only resolve to
 * themselves: they are not part of the combat advancement chain.
 */
export function archetypeLineageIds(archetypeId: string): string[] {
  const self = archetypeId.trim()
  if (!self) return []

  const selfKey = canonical(self)
  if (specialArchetypes.has(selfKey) || professionArchetypes.has(selfKey)) return [self]

  const result = [self]
  const visited = new Set([selfKey])
  let currentKey = selfKey
  while (true) {
    const requiredClass = requiredClassByArchetype.get(currentKey)
    if (!requiredClass) break
    const requiredKey = canonical(requiredClass)
    if (!requiredKey || visited.has(requiredKey)) break
    result.push(requiredClass)
    visited.add(requiredKey)
    currentKey = requiredKey
  }
  return result
}

/** True when a class-bound resource is usable by the target class. */
export function inheritsArchetype(targetArchetypeId: string, resourceArchetypeId: string): boolean {
  const resourceKey = canonical(resourceArchetypeId)
  return Boolean(resourceKey) && archetypeLineageIds(targetArchetypeId).some(id => canonical(id) === resourceKey)
}

export type ArchetypeRecord = Record<string, unknown> & {
  id: string
  slug: string
  name: LocalizedText
  displayName: string
  description: LocalizedText
  role: ArchetypeRole
  roleLabel: LocalizedText
  stage: ArchetypeStage
  stageLabel: LocalizedText
  icon: string | null
  fallbackIcon: string | null
  fallbackIconSource: ArchetypeFallbackIconSource | null
  fallbackIconBasis: ArchetypeFallbackIconBasis | null
  previewSkills: string[]
  requiredClassId: string | null
  advancesToIds: string[]
  advancementJobLevel: number | null
  lineageSource: typeof lineage.meta
  inferred: boolean
  derivedFields: string[]
  fieldSources: Record<string, 'source' | 'name-derived' | 'game-binary'>
}

export type SkillRecord = Record<string, unknown> & {
  id: string
  slug: string
  name: LocalizedText
  displayName: string
  description: LocalizedText
  icon: string | null
  allowedArchetypes: string[]
}

type IndexedArchetype = { item: ArchetypeRecord; searchText: string }

export type ArchetypeQuery = {
  q?: string
  role?: ArchetypeRole
  stage?: ArchetypeStage
  page: number
  pageSize: number
}

function iconFrom(raw: Record<string, unknown>): string | null {
  const value = readString(raw.icon, raw.iconUrl, raw.image, raw.imageUrl)
  return value && (/^\//.test(value) || /^https?:\/\//.test(value)) ? value : null
}

function fallbackIconFrom(raw: Record<string, unknown>): {
  icon: string | null
  source: ArchetypeFallbackIconSource | null
  basis: ArchetypeFallbackIconBasis | null
} {
  const basis = readString(raw.fallbackIconBasis) === 'npc-config-same-id' ? 'npc-config-same-id' : null
  const value = readString(raw.fallbackIcon)
  const icon = basis && value && (/^\//.test(value) || /^https?:\/\//.test(value)) ? value : null
  const source = asRecord(raw.fallbackIconSource)
  const sourcePathId = typeof source.sourcePathId === 'number' ? source.sourcePathId : 0
  const configSourcePathId = typeof source.configSourcePathId === 'number' ? source.configSourcePathId : 0
  const configId = readString(source.configId)
  const spriteId = readString(source.spriteId) || ''
  const validSource = basis && source.configClass === 'NpcConfig' && sourcePathId > 0 && configSourcePathId > 0 && configId
    ? { ...source, sourcePathId, configClass: 'NpcConfig' as const, configId, configSourcePathId, spriteId }
    : null
  return { icon: validSource ? icon : null, source: validSource, basis: validSource && icon ? basis : null }
}

function normalizeRole(value: string | null, id: string): ArchetypeRole {
  const explicit = value ? canonical(value) : ''
  return archetypeRoles.find(role => canonical(role) === explicit) || derivedRoles[canonical(id)] || 'other'
}

function normalizeStage(id: string): ArchetypeStage {
  const key = canonical(id)
  if (baseArchetypes.has(key)) return 'base'
  if (requiredClassByArchetype.has(key)) return 'advanced'
  if (specialArchetypes.has(key)) return 'special'
  if (professionArchetypes.has(key)) return 'profession'
  return 'special'
}

export function normalizeArchetype(value: unknown): ArchetypeRecord {
  const raw = asRecord(value)
  const id = readString(raw.id, raw.key, raw.slug) || 'unknown-archetype'
  const name = localized(raw.name, humanize(id))
  const displayName = name.zh || name.en || humanize(id)
  const sourceRole = readString(raw.role)
  const role = normalizeRole(sourceRole, id)
  const stage = normalizeStage(id)
  const requiredClassId = requiredClassByArchetype.get(canonical(id)) || null
  const fallbackIcon = fallbackIconFrom(raw)
  return {
    ...raw,
    id,
    slug: readString(raw.slug) || slugify(id) || 'unknown-archetype',
    name,
    displayName,
    description: localized(raw.description ?? raw.summary),
    role,
    roleLabel: roleLabels[role],
    stage,
    stageLabel: stageLabels[stage],
    icon: iconFrom(raw),
    fallbackIcon: fallbackIcon.icon,
    fallbackIconSource: fallbackIcon.source,
    fallbackIconBasis: fallbackIcon.basis,
    previewSkills: readStringList(raw.previewSkills),
    requiredClassId,
    advancesToIds: [...(advancesToByBase.get(canonical(id)) || [])],
    advancementJobLevel: stage === 'advanced' ? lineage.meta.advancementJobLevel : null,
    lineageSource: lineage.meta,
    inferred: !sourceRole,
    derivedFields: sourceRole ? ['stage', 'progression'] : ['role', 'stage', 'progression'],
    fieldSources: { role: sourceRole ? 'source' : 'name-derived', stage: 'game-binary', progression: 'game-binary' }
  }
}

export function normalizeSkill(value: unknown): SkillRecord {
  const raw = asRecord(value)
  const id = readString(raw.id, raw.key, raw.slug) || 'unknown-skill'
  const name = localized(raw.name, humanize(id))
  return {
    ...raw,
    id,
    slug: readString(raw.slug) || slugify(id) || 'unknown-skill',
    name,
    displayName: name.zh || name.en || humanize(id),
    description: localized(raw.description ?? raw.summary),
    icon: iconFrom(raw),
    allowedArchetypes: readStringList(raw.allowedArchetypes, raw.archetypes, raw.archetype)
  }
}

export function createArchetypeCatalog(records: readonly unknown[]): IndexedArchetype[] {
  return records
    .map(normalizeArchetype)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'en') || left.slug.localeCompare(right.slug, 'en'))
    .map(item => ({ item, searchText: flattenSearchText(item).toLocaleLowerCase('en-US') }))
}

export function createSkillCatalog(records: readonly unknown[]): SkillRecord[] {
  return records
    .map(normalizeSkill)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'en') || left.slug.localeCompare(right.slug, 'en'))
}

export function listArchetypes(index: IndexedArchetype[], query: ArchetypeQuery) {
  const searched = index.filter(entry => matchesQuery(entry.searchText, query.q))
  const filtered = searched.filter(entry => (!query.role || entry.item.role === query.role) && (!query.stage || entry.item.stage === query.stage))
  const start = (query.page - 1) * query.pageSize
  const counts = new Map<ArchetypeRole, number>()
  const stageCounts = new Map<ArchetypeStage, number>()
  for (const { item } of searched) counts.set(item.role, (counts.get(item.role) || 0) + 1)
  for (const { item } of searched) stageCounts.set(item.stage, (stageCounts.get(item.stage) || 0) + 1)
  return {
    items: filtered.slice(start, start + query.pageSize).map(entry => entry.item),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(filtered.length / query.pageSize),
    facets: {
      roles: [...counts.entries()]
        .map(([value, count]) => ({ value, label: roleLabels[value].zh, count }))
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh')),
      stages: archetypeStages
        .filter(value => stageCounts.has(value))
        .map(value => ({ value, label: stageLabels[value].zh, count: stageCounts.get(value) || 0 }))
    }
  }
}

export function findArchetype(index: IndexedArchetype[], slug: string): ArchetypeRecord | null {
  const key = canonical(slug)
  return index.find(entry => canonical(entry.item.slug) === key || canonical(entry.item.id) === key)?.item || null
}

export function skillsByIds(skills: SkillRecord[], skillIds: readonly string[]): SkillRecord[] {
  const byId = new Map(skills.map(skill => [canonical(skill.id), skill]))
  return [...new Map(skillIds.map(id => [canonical(id), id])).keys()]
    .map(id => byId.get(id))
    .filter((skill): skill is SkillRecord => Boolean(skill))
}
