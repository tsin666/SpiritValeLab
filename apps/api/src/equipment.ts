import {
  arrayOrEmpty,
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

export const equipmentCategories = ['weapon', 'offhand', 'armor', 'accessory', 'class-item', 'utility', 'other'] as const
export type EquipmentCategory = typeof equipmentCategories[number]

const categoryLabels: Record<EquipmentCategory, LocalizedText> = {
  weapon: { zh: '武器', en: 'Weapon' },
  offhand: { zh: '副手', en: 'Off-hand' },
  armor: { zh: '防具', en: 'Armor' },
  accessory: { zh: '饰品', en: 'Accessory' },
  'class-item': { zh: '职业装备', en: 'Class item' },
  utility: { zh: '功能装备', en: 'Utility' },
  other: { zh: '其他', en: 'Other' }
}

export type EquipmentRecord = Record<string, unknown> & {
  id: string
  slug: string
  name: LocalizedText
  displayName: string
  description: LocalizedText
  category: EquipmentCategory
  categoryLabel: LocalizedText
  icon: string | null
  slot: string | null
  slots: string[]
  type: string | null
  element: string | null
  levelRequired: number | null
  allowedArchetypes: string[]
  setId: string | null
  set: Record<string, unknown> | null
  stats: unknown[]
  affixes: unknown[]
  availableAffixes: unknown[]
  setBonuses: unknown[]
  inferred: boolean
  derivedFields: string[]
  fieldSources: Record<string, 'source' | 'pool-derived' | 'type-derived' | 'name-derived' | 'default'>
}

type IndexedEquipment = {
  item: EquipmentRecord
  searchText: string
}

export type EquipmentQuery = {
  q?: string
  category?: EquipmentCategory
  archetype?: string
  compatible?: boolean
  slot?: string
  type?: string
  element?: string
  level?: number
  setId?: string
  page: number
  pageSize: number
}

export type FacetItem = {
  value: string
  label: string
  count: number
}

function keyword(text: string, terms: string[]): string | null {
  return terms.find(term => text.includes(term)) || null
}

function inferSlot(text: string, classItem: boolean): string | null {
  if (classItem) return 'class-item'
  if (keyword(text, ['shield', 'quiver', 'tome', 'grimoire', 'spellbook', 'offhand', 'off-hand'])) return 'off-hand'
  if (keyword(text, ['helmet', 'helm', 'hood', 'head', 'hat', 'crown', 'circlet', 'tiara', 'mask', 'glasses', 'goggles', 'earmuff', 'bandana', 'halo'])) return 'head'
  if (keyword(text, ['chest', 'armor', 'armour', 'robe', 'coat', 'vest', 'tunic', 'mail', 'garb', 'shirt', 'uniform', 'jacket', 'dress'])) return 'chest'
  if (keyword(text, ['glove', 'gauntlet', 'hands', 'handwrap', 'bracer'])) return 'hands'
  if (keyword(text, ['legs', 'pants', 'trousers', 'leggings', 'greaves', 'skirt'])) return 'legs'
  if (keyword(text, ['feet', 'boots', 'shoes', 'sandals', 'slippers', 'sabaton'])) return 'feet'
  if (keyword(text, ['ring', 'necklace', 'amulet', 'charm', 'earring', 'bracelet', 'pendant', 'brooch', 'scarf', 'hoop'])) return 'accessory'
  if (keyword(text, ['axe', 'blade', 'bow', 'cannon', 'crossbow', 'dagger', 'flail', 'gun', 'hammer', 'katana', 'knife', 'kunai', 'lance', 'mace', 'musket', 'pistol', 'rapier', 'rifle', 'rod', 'scepter', 'scythe', 'spear', 'staff', 'sword', 'wand', 'whip', 'claw', 'chakram', 'lute'])) return 'main-hand'
  return null
}

function normalizeSlot(value: string | null): string | null {
  if (!value) return null
  const key = canonical(value)
  const aliases: Record<string, string> = {
    mainhand: 'main-hand', weapon: 'main-hand', offhand: 'off-hand', secondary: 'off-hand',
    head: 'head', helmet: 'head', body: 'chest', torso: 'chest', chest: 'chest',
    hand: 'hands', hands: 'hands', gloves: 'hands', leg: 'legs', legs: 'legs',
    foot: 'feet', feet: 'feet', boots: 'feet', accessory: 'accessory', accessoryleft: 'accessory',
    accessoryright: 'accessory', eyewear: 'eyewear', back: 'back', classitem: 'class-item'
  }
  return aliases[key] || slugify(value) || null
}

function slotFromType(value: string | null): string | null {
  const type = canonical(value || '')
  if (type === 'shield') return 'off-hand'
  if (type === 'head') return 'head'
  if (type === 'legs') return 'legs'
  if (type === 'feet') return 'feet'
  if (type === 'chest') return 'chest'
  if (type === 'accessory') return 'accessory'
  if (type === 'eyewear') return 'eyewear'
  if (type === 'back') return 'back'
  if ([
    'sword', 'dagger', 'wand', 'spear', 'axe', 'mace', 'book', 'pistol', 'bow',
    'scythe', 'instrument', 'twinblade', 'mace2h', 'sword2h', 'axe2h', 'spear2h',
    'wand2h', 'rifle', 'shotgun', 'launcher', 'gatlinggun', 'katar', 'grimoire'
  ].includes(type)) return 'main-hand'
  return null
}

function inferType(text: string, slot: string | null, classItem: boolean): string | null {
  if (classItem) return 'class-item'
  const types: Array<[string, string[]]> = [
    ['crossbow', ['crossbow']], ['greatsword', ['greatsword']], ['spellbook', ['spellbook', 'grimoire', 'tome']],
    ['shield', ['shield', 'guardwall']], ['quiver', ['quiver']], ['staff', ['staff']], ['sword', ['sword']],
    ['axe', ['axe']], ['bow', ['bow']], ['dagger', ['dagger']], ['kunai', ['kunai']], ['spear', ['spear']],
    ['rifle', ['rifle']], ['pistol', ['pistol']], ['cannon', ['cannon']], ['gun', ['gun', 'musket']],
    ['hammer', ['hammer']], ['mace', ['mace']], ['scythe', ['scythe']], ['wand', ['wand']], ['lute', ['lute']],
    ['helmet', ['helmet', 'helm']], ['hood', ['hood']], ['robe', ['robe']], ['armor', ['armor', 'armour', 'mail']],
    ['gloves', ['glove', 'gauntlet']], ['boots', ['boots', 'shoes', 'feet']], ['ring', ['ring']], ['amulet', ['amulet', 'necklace', 'pendant']]
  ]
  for (const [type, terms] of types) if (keyword(text, terms)) return type
  return slot
}

function normalizeCategory(value: string | null, slot: string | null, classItem: boolean): EquipmentCategory {
  if (classItem) return 'class-item'
  const explicit = value ? canonical(value) : ''
  const aliases: Record<string, EquipmentCategory> = {
    weapon: 'weapon', mainhand: 'weapon', offhand: 'offhand', shield: 'offhand', armor: 'armor', armour: 'armor',
    accessory: 'accessory', jewelry: 'accessory', jewellery: 'accessory', classitem: 'class-item', utility: 'utility', other: 'other'
  }
  if (aliases[explicit]) return aliases[explicit]
  if (slot === 'main-hand') return 'weapon'
  if (slot === 'off-hand') return 'offhand'
  if (['head', 'chest', 'hands', 'legs', 'feet'].includes(slot || '')) return 'armor'
  if (['accessory', 'eyewear', 'back'].includes(slot || '')) return 'accessory'
  return 'other'
}

function readIcon(raw: Record<string, unknown>): string | null {
  const direct = readString(raw.icon, raw.iconUrl, raw.image, raw.imageUrl)
  if (direct && (/^\//.test(direct) || /^https?:\/\//.test(direct))) return direct
  return null
}

export function normalizeEquipment(value: unknown): EquipmentRecord {
  const raw = asRecord(value)
  const id = readString(raw.id, raw.key, raw.slug) || 'unknown-equipment'
  const name = localized(raw.name, humanize(id))
  const displayName = name.zh || name.en || humanize(id)
  const description = localized(raw.description ?? raw.flavorText ?? raw.descriptionText)
  const slug = readString(raw.slug) || slugify(id) || slugify(displayName) || 'unknown-equipment'
  const classMatch = id.match(/^([A-Za-z][A-Za-z0-9]*)_(\d+)$/)
  const hasExplicitArchetypeField = raw.allowedArchetypes !== undefined || raw.hasArchetypeRestriction !== undefined
  let allowedArchetypes = readStringList(raw.allowedArchetypes, raw.archetypes, raw.Archetypes, raw.archetype)
  if (!allowedArchetypes.length && !hasExplicitArchetypeField && classMatch) allowedArchetypes = [humanize(classMatch[1])]

  const sourceText = `${id} ${name.zh} ${name.en}`.toLocaleLowerCase('en-US')
  const sourceSlots = readStringList(raw.slots, raw.slot, raw.equipmentSlot)
  const sourceSlot = sourceSlots[0] || null
  const sourceType = readString(raw.type, raw.equipmentType, raw.itemType)
  const sourceCategory = readString(raw.category)
  const typeSlot = slotFromType(sourceType)
  const slot = normalizeSlot(sourceSlot) || typeSlot || inferSlot(sourceText, Boolean(classMatch))
  const slots = sourceSlots.length ? sourceSlots.map(value => normalizeSlot(value) || value) : slot ? [slot] : []
  const type = (sourceType && slugify(sourceType)) || inferType(sourceText, slot, Boolean(classMatch))
  const category = normalizeCategory(sourceCategory, slot, Boolean(classMatch))
  const sourceSet = asRecord(raw.set)
  const setId = readString(raw.setId, raw.set_id, raw.set, sourceSet.id, sourceSet.slug)
  const set = Object.keys(sourceSet).length ? sourceSet : setId ? { id: setId } : null
  const stats = arrayOrEmpty(raw.stats ?? raw.attributes)
  if (!stats.length) {
    for (const candidate of [raw.primaryStats, raw.primaryStat, raw.primary, raw.secondaryStats, raw.secondaryStat, raw.secondary]) {
      if (Array.isArray(candidate)) stats.push(...candidate)
      else if (candidate !== undefined && candidate !== null) stats.push(candidate)
    }
  }
  const affixes = arrayOrEmpty(raw.affixes ?? raw.substats ?? raw.modifiers ?? raw.effects)
  const availableAffixes = arrayOrEmpty(raw.availableAffixes ?? raw.substatCandidates)
  const hasSubstatPoolSource = raw.substatPoolId !== undefined || raw.substatPool !== undefined || raw.substat_pool !== undefined
  const setBonuses = arrayOrEmpty(raw.setBonuses ?? sourceSet.bonuses ?? sourceSet.FullSet ?? sourceSet.fullSet)
  const rawLevel = raw.levelRequired ?? raw.requiredLevel ?? raw.level
  const parsedLevel = typeof rawLevel === 'number' ? rawLevel : typeof rawLevel === 'string' ? Number(rawLevel) : Number.NaN
  const levelRequired = Number.isFinite(parsedLevel) && parsedLevel >= 0 ? parsedLevel : null
  const derivedFields = [
    !sourceSlot && slot ? 'slot' : null,
    !sourceType && type ? 'type' : null,
    !sourceCategory ? 'category' : null,
    classMatch && !hasExplicitArchetypeField && !readStringList(raw.allowedArchetypes, raw.archetypes, raw.Archetypes, raw.archetype).length ? 'allowedArchetypes' : null
  ].filter((field): field is string => Boolean(field))

  return {
    ...raw,
    id,
    slug,
    name,
    displayName,
    description,
    category,
    categoryLabel: categoryLabels[category],
    icon: readIcon(raw),
    slot,
    slots,
    type,
    element: readString(raw.element),
    levelRequired,
    allowedArchetypes,
    setId,
    set,
    stats,
    affixes,
    availableAffixes,
    setBonuses,
    inferred: derivedFields.length > 0,
    derivedFields,
    fieldSources: {
      slot: sourceSlot ? 'source' : typeSlot ? 'type-derived' : slot ? 'name-derived' : 'default',
      type: sourceType ? 'source' : type ? 'name-derived' : 'default',
      category: sourceCategory ? 'source' : 'name-derived',
      element: raw.element !== undefined ? 'source' : 'default',
      levelRequired: rawLevel !== undefined ? 'source' : 'default',
      allowedArchetypes: hasExplicitArchetypeField ? 'source' : classMatch ? 'name-derived' : 'default',
      setId: setId ? 'source' : 'default',
      stats: raw.stats !== undefined || raw.attributes !== undefined ? 'source' : 'default',
      affixes: raw.affixes !== undefined || raw.substats !== undefined || raw.modifiers !== undefined || raw.effects !== undefined ? 'source' : 'default',
      availableAffixes: hasSubstatPoolSource ? 'pool-derived' : raw.availableAffixes !== undefined || raw.substatCandidates !== undefined ? 'source' : 'default'
    }
  }
}

export function createEquipmentCatalog(records: readonly unknown[]): IndexedEquipment[] {
  return records
    .map(normalizeEquipment)
    .sort((left, right) => left.displayName.localeCompare(right.displayName, 'en') || left.slug.localeCompare(right.slug, 'en'))
    .map(item => ({
      item,
      searchText: flattenSearchText(item).toLocaleLowerCase('en-US')
    }))
}

function equalsFacet(left: string | null, right?: string): boolean {
  return !right || Boolean(left && canonical(left) === canonical(right))
}

type FilterKey = 'category' | 'archetype' | 'slot' | 'type' | 'element' | 'level' | 'setId'

function filterEquipment(index: IndexedEquipment[], query: EquipmentQuery, omit?: FilterKey): IndexedEquipment[] {
  return index.filter(({ item, searchText }) => {
    if (!matchesQuery(searchText, query.q)) return false
    if (omit !== 'category' && query.category && item.category !== query.category) return false
    if (omit !== 'archetype' && query.archetype) {
      const explicitlyAllowed = item.allowedArchetypes.some(value => canonical(value) === canonical(query.archetype!))
      const unrestricted = item.allowedArchetypes.length === 0
      if (query.compatible ? !unrestricted && !explicitlyAllowed : !explicitlyAllowed) return false
    }
    if (omit !== 'slot' && query.slot && !item.slots.some(slot => equalsFacet(slot, query.slot))) return false
    if (omit !== 'type' && !equalsFacet(item.type, query.type)) return false
    if (omit !== 'element' && !equalsFacet(item.element, query.element)) return false
    if (omit !== 'level' && query.level !== undefined && item.levelRequired !== query.level) return false
    if (omit !== 'setId' && !equalsFacet(item.setId, query.setId)) return false
    return true
  })
}

function facets(
  records: IndexedEquipment[],
  values: (item: EquipmentRecord) => Array<{ value: string; label?: string }>
): FacetItem[] {
  const counts = new Map<string, FacetItem>()
  for (const { item } of records) {
    for (const entry of values(item)) {
      if (!entry.value) continue
      const key = canonical(entry.value)
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { value: entry.value, label: entry.label || humanize(entry.value), count: 1 })
    }
  }
  return [...counts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'en'))
}

function setLabel(item: EquipmentRecord): string | undefined {
  if (!item.set) return undefined
  const name = localized(item.set.name)
  return name.zh || name.en || undefined
}

export function listEquipment(index: IndexedEquipment[], query: EquipmentQuery) {
  const filtered = filterEquipment(index, query)
  const start = (query.page - 1) * query.pageSize
  return {
    items: filtered.slice(start, start + query.pageSize).map(entry => entry.item),
    total: filtered.length,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(filtered.length / query.pageSize),
    facets: {
      categories: facets(filterEquipment(index, query, 'category'), item => [{ value: item.category, label: item.categoryLabel.zh }]),
      archetypes: facets(filterEquipment(index, query, 'archetype'), item => item.allowedArchetypes.map(value => ({ value }))),
      slots: facets(filterEquipment(index, query, 'slot'), item => item.slots.map(value => ({ value }))),
      types: facets(filterEquipment(index, query, 'type'), item => item.type ? [{ value: item.type }] : []),
      elements: facets(filterEquipment(index, query, 'element'), item => item.element ? [{ value: item.element }] : []),
      levels: facets(filterEquipment(index, query, 'level'), item => item.levelRequired !== null ? [{ value: String(item.levelRequired), label: String(item.levelRequired) }] : []),
      sets: facets(filterEquipment(index, query, 'setId'), item => item.setId ? [{ value: item.setId, label: setLabel(item) }] : [])
    }
  }
}

export function findEquipment(index: IndexedEquipment[], slug: string): EquipmentRecord | null {
  const key = canonical(slug)
  return index.find(entry => canonical(entry.item.slug) === key)?.item || null
}
