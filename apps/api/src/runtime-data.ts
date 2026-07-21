import runtimeCatalogJson from '../../../packages/game-data/src/runtime-catalog.json' with { type: 'json' }
import { arrayOrEmpty, asRecord, canonical, localized, readString, slugify } from './catalog-utils.js'

type RuntimeEnumEntry = {
  name: string
  value: number
}

type RuntimeCatalog = {
  meta: Record<string, unknown>
  enums: Record<string, RuntimeEnumEntry[]>
  equipment: unknown[]
  equipmentSets: unknown[]
  substatPools: unknown[]
  archetypes: unknown[]
  archetypeSkillRelations: unknown[]
  weapons: unknown[]
  skills?: unknown[]
  skillPassives?: unknown[]
  artifacts?: unknown[]
  gems?: unknown[]
  cards?: unknown[]
  monsters?: unknown[]
  monsterArchetypes?: unknown[]
  statuses?: unknown[]
  sprites?: Record<string, unknown>
}

const runtimeCatalog = runtimeCatalogJson as unknown as RuntimeCatalog

function recordMap(records: readonly unknown[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>()
  for (const value of records) {
    const record = asRecord(value)
    const id = readString(record.id)
    if (id) result.set(canonical(id), record)
  }
  return result
}

function catalogRecord(value: unknown, fallbackId?: string, fallbackName?: string): Record<string, unknown> {
  const record = asRecord(value)
  const id = readString(record.id, fallbackId) || 'unknown'
  const displayName = readString(record.displayName, record.name, fallbackName, id) || id
  return {
    ...record,
    id,
    slug: readString(record.slug) || slugify(id),
    name: localized(record.name, displayName),
    displayName
  }
}

function enrichedSet(value: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!value) return null
  const memberCount = arrayOrEmpty(value.equipmentIds).length
  const fullSet = arrayOrEmpty(value.fullSet).map(entry => ({
    ...asRecord(entry),
    requiredPieces: memberCount || undefined
  }))
  return { ...value, memberCount, fullSet }
}

export const runtimeEquipmentSetRecords = runtimeCatalog.equipmentSets
  .map(value => enrichedSet(catalogRecord(value)))
  .filter((value): value is Record<string, unknown> => Boolean(value))

export const runtimeSubstatPoolRecords = runtimeCatalog.substatPools.map(value => catalogRecord(value))
const equipmentSets = recordMap(runtimeEquipmentSetRecords)
const substatPools = recordMap(runtimeSubstatPoolRecords)

function enrichedSubstatCandidates(pool: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!pool) return []
  return arrayOrEmpty(pool.groups).flatMap(groupValue => {
    const group = asRecord(groupValue)
    const index = typeof group.index === 'number' ? group.index : null
    return arrayOrEmpty(group.stats).map(stat => ({
      ...asRecord(stat),
      group: index,
      groupIndex: index,
      poolId: readString(pool.id)
    }))
  })
}

export const runtimeEquipmentRecords = runtimeCatalog.equipment.map(value => {
  const equipment = asRecord(value)
  // EquipConfig.Slots is a source scalar, not the separate EquipSlot enum. Keep it
  // verbatim for evidence; the public body slot is derived from the exact EquipType.
  const runtimeSlots = typeof equipment.slots === 'number' ? equipment.slots : null
  const setId = readString(equipment.setId)
  const set = enrichedSet(setId ? equipmentSets.get(canonical(setId)) : undefined)
  const substatPoolId = readString(equipment.substatPoolId)
  const substatPool = substatPoolId ? substatPools.get(canonical(substatPoolId)) || null : null
  return {
    ...equipment,
    runtimeSlots,
    slotsValue: runtimeSlots,
    set,
    setBonuses: arrayOrEmpty(set?.fullSet),
    substatPool,
    availableAffixes: enrichedSubstatCandidates(substatPool || undefined)
  }
})

export const runtimeArchetypeRecords = runtimeCatalog.archetypes.map(value => {
  const archetype = asRecord(value)
  const previewSkills = arrayOrEmpty(archetype.previewSkills)
    .map(skill => readString(skill))
    .filter((skill): skill is string => Boolean(skill))
  return { ...archetype, previewSkills }
})

export const runtimeArchetypeSkillRelationRecords = runtimeCatalog.archetypeSkillRelations.map(value => {
  const relation = asRecord(value)
  const archetypeId = readString(relation.archetypeId) || 'unknown-archetype'
  const skillId = readString(relation.skillId) || 'unknown-skill'
  return catalogRecord(
    { ...relation, id: `${archetypeId}-${skillId}` },
    `${archetypeId}-${skillId}`,
    `${archetypeId} / ${skillId}`
  )
})

export const runtimeWeaponRecords = runtimeCatalog.weapons.map(value => catalogRecord(value))
export const runtimeMonsterArchetypeRecords = arrayOrEmpty(runtimeCatalog.monsterArchetypes).map(value => catalogRecord(value))
const monsterArchetypes = recordMap(runtimeMonsterArchetypeRecords)

export const runtimeMonsterRecords = arrayOrEmpty(runtimeCatalog.monsters).map(value => {
  const monster = asRecord(value)
  const archetypeId = readString(monster.archetypeId)
  return {
    ...monster,
    archetype: archetypeId ? monsterArchetypes.get(canonical(archetypeId)) || null : null
  }
})

export const runtimeCatalogKinds = [
  'equips',
  'equipment-sets',
  'substat-pools',
  'archetypes',
  'archetype-skill-relations',
  'skills',
  'skillPassives',
  'artifacts',
  'gems',
  'cards',
  'monster-archetypes',
  'monsters',
  'statuses',
  'weapons'
] as const

export type RuntimeCatalogKind = typeof runtimeCatalogKinds[number]

const runtimeRecordsByKind: Record<RuntimeCatalogKind, unknown[]> = {
  equips: runtimeEquipmentRecords,
  'equipment-sets': runtimeEquipmentSetRecords,
  'substat-pools': runtimeSubstatPoolRecords,
  archetypes: runtimeArchetypeRecords,
  'archetype-skill-relations': runtimeArchetypeSkillRelationRecords,
  skills: arrayOrEmpty(runtimeCatalog.skills),
  skillPassives: arrayOrEmpty(runtimeCatalog.skillPassives),
  artifacts: arrayOrEmpty(runtimeCatalog.artifacts),
  gems: arrayOrEmpty(runtimeCatalog.gems),
  cards: arrayOrEmpty(runtimeCatalog.cards),
  'monster-archetypes': runtimeMonsterArchetypeRecords,
  monsters: runtimeMonsterRecords,
  statuses: arrayOrEmpty(runtimeCatalog.statuses),
  weapons: runtimeWeaponRecords
}

export const runtimeDataMeta = {
  ...runtimeCatalog.meta,
  source: readString(runtimeCatalog.meta.source) || 'Local SpiritVale runtime configuration',
  equipmentCount: runtimeEquipmentRecords.length,
  equipmentSetCount: runtimeEquipmentSetRecords.length,
  substatPoolCount: runtimeSubstatPoolRecords.length,
  archetypeCount: runtimeArchetypeRecords.length,
  archetypeSkillRelationCount: runtimeArchetypeSkillRelationRecords.length,
  skillCount: arrayOrEmpty(runtimeCatalog.skills).length,
  skillPassiveCount: arrayOrEmpty(runtimeCatalog.skillPassives).length,
  artifactCount: arrayOrEmpty(runtimeCatalog.artifacts).length,
  gemCount: arrayOrEmpty(runtimeCatalog.gems).length,
  cardCount: arrayOrEmpty(runtimeCatalog.cards).length,
  monsterArchetypeCount: runtimeMonsterArchetypeRecords.length,
  monsterCount: runtimeMonsterRecords.length,
  statusCount: arrayOrEmpty(runtimeCatalog.statuses).length,
  weaponCount: runtimeWeaponRecords.length,
  spriteCount: Object.keys(runtimeCatalog.sprites || {}).length,
  runtimeCatalogCollectionCount: runtimeCatalogKinds.length,
  runtimeCatalogEntryCount: Object.values(runtimeRecordsByKind).reduce((total, records) => total + records.length, 0)
}

export function runtimeRecordsForKind(kind: RuntimeCatalogKind): unknown[] {
  return runtimeRecordsByKind[kind]
}
