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
import { inheritsArchetype } from './archetypes.js'

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

function readonlyAliasMap<T extends Record<string, readonly string[]>>(aliases: T): Readonly<T> {
  for (const values of Object.values(aliases)) Object.freeze(values)
  return Object.freeze(aliases)
}

// Search-only labels for every effect type currently present in the 647 runtime
// equipment records. The first alias is the primary Chinese label; the remaining
// aliases are common Chinese/English search phrases. Source records stay untouched.
export const equipmentEffectSearchAliases = readonlyAliasMap({
  aftercastdelay: ['施法后延迟', '施法后摇', 'after cast delay', 'post cast delay'],
  agi: ['敏捷', 'agility', 'agi'],
  allresist: ['全抗性', '全元素抗性', 'all resistance', 'all resistances'],
  allstats: ['全属性', 'all stats', 'all attributes'],
  atk: ['物理攻击', '攻击力', 'physical attack', 'attack power'],
  atkmult: ['攻击倍率', '物理攻击倍率', 'attack multiplier', 'physical attack multiplier'],
  atkspd: ['攻击速度', '攻速', 'attack speed'],
  atkspdlimit: ['攻击速度上限', '攻速上限', 'attack speed limit', 'attack speed cap'],
  autoattackmatk: ['普攻魔法攻击', '普通攻击魔攻', 'auto attack magic attack', 'basic attack magic attack'],
  autocastattack: ['攻击时自动施法', '攻击触发施法', 'autocast on attack', 'auto cast on attack'],
  autocasthit: ['命中时自动施法', '命中触发施法', 'autocast on hit', 'auto cast on hit'],
  block: ['格挡', '格挡率', 'block', 'block chance'],
  buffduration: ['增益持续时间', '增益时长', 'buff duration'],
  castrange: ['施法距离', '施法范围', 'cast range', 'casting range'],
  castspd: ['施法速度', '吟唱速度', 'cast speed', 'casting speed'],
  chain: ['连锁', '连锁次数', 'chain', 'chain count'],
  cooldownrecovery: ['冷却恢复速度', '冷却恢复', 'cooldown recovery', 'cooldown recovery rate'],
  crit: ['暴击', '暴击率', 'critical chance', 'crit chance'],
  critdamage: ['暴击伤害', '爆伤', 'critical damage', 'crit damage'],
  critdef: ['暴击抗性', '暴击防御', 'critical resistance', 'critical defense'],
  critmult: ['暴击率倍率', '暴击倍率', 'critical chance multiplier', 'crit multiplier'],
  damagecloserange: ['近距离伤害', '近程伤害', 'close range damage', 'close-range damage'],
  damageelement: ['伤害元素', '伤害属性', 'damage element', 'damage type element'],
  damagefarrange: ['远距离伤害', '远程距离伤害', 'far range damage', 'long range damage'],
  damagefromelement: ['承受元素伤害', '受到的元素伤害', 'damage taken from element', 'damage from element'],
  damagefrommagic: ['承受魔法伤害', '受到的魔法伤害', 'magic damage taken', 'damage from magic'],
  damagefrommelee: ['承受近战伤害', '受到的近战伤害', 'melee damage taken', 'damage from melee'],
  damagefromranged: ['承受远程伤害', '受到的远程伤害', 'ranged damage taken', 'damage from ranged'],
  damagemagic: ['魔法伤害', 'magic damage'],
  damagemelee: ['近战伤害', 'melee damage'],
  damageranged: ['远程伤害', 'ranged damage'],
  damagestatus: ['状态伤害', '异常状态伤害', 'status damage', 'ailment damage'],
  damagetoelement: ['对元素伤害', '对属性伤害', 'damage to element', 'elemental target damage'],
  def: ['物理防御', '防御力', 'physical defense', 'defense'],
  defflat: ['固定物理防御', '物理防御固定值', 'flat physical defense', 'flat defense'],
  defmult: ['物理防御倍率', '防御倍率', 'physical defense multiplier', 'defense multiplier'],
  defpierce: ['物理防御穿透', '物防穿透', 'physical defense penetration', 'defense penetration'],
  dex: ['灵巧', 'dexterity', 'dex'],
  doubleattack: ['双重攻击', '二连击', 'double attack'],
  elementarmor: ['护甲元素', '元素护甲', 'armor element', 'elemental armor'],
  elementresist: ['元素抗性', '属性抗性', 'element resistance', 'elemental resistance'],
  flee: ['闪避', '闪避率', 'evasion', 'dodge chance'],
  fleemult: ['闪避倍率', 'evasion multiplier', 'flee multiplier'],
  grantskill: ['赋予技能', '获得技能', 'granted skill', 'grant skill'],
  healing: ['治疗效果', '治疗', 'healing', 'healing power'],
  healingreceived: ['受到的治疗', '受治疗效果', 'healing received', 'incoming healing'],
  hit: ['命中', '命中率', 'hit', 'hit chance'],
  hitmult: ['命中倍率', 'hit multiplier', 'accuracy multiplier'],
  hp: ['生命', '生命值', 'health', 'hit points'],
  hpmult: ['生命倍率', '生命值倍率', 'health multiplier', 'hp multiplier'],
  hpregen: ['生命恢复', '生命回复', 'health regeneration', 'hp regeneration'],
  hpregenmax: ['生命恢复上限', '生命回复上限', 'maximum health regeneration', 'hp regeneration cap'],
  hpregenmult: ['生命恢复倍率', '生命回复倍率', 'health regeneration multiplier', 'hp regeneration multiplier'],
  int: ['智力', 'intelligence', 'int'],
  leech: ['吸取', '生命吸取', 'leech', 'life leech'],
  leechkill: ['击杀恢复生命', '击杀生命吸取', 'health on kill', 'life on kill'],
  leechkillmp: ['击杀恢复法力', '击杀法力吸取', 'mana on kill', 'mp on kill'],
  luk: ['幸运', 'luck', 'luk'],
  matk: ['魔法攻击', '魔攻', 'magic attack', 'magic power'],
  matkmult: ['魔法攻击倍率', '魔攻倍率', 'magic attack multiplier', 'magic power multiplier'],
  matkperstr: ['每点力量魔攻', '力量转魔攻', 'magic attack per strength', 'matk per strength'],
  mdef: ['魔法防御', '魔防', 'magic defense'],
  mdefflat: ['固定魔法防御', '魔法防御固定值', 'flat magic defense'],
  mdefmult: ['魔法防御倍率', '魔防倍率', 'magic defense multiplier'],
  mdefpierce: ['魔法防御穿透', '魔防穿透', 'magic defense penetration'],
  movespd: ['移动速度', '移速', 'movement speed', 'move speed'],
  mp: ['法力', '法力值', 'mana', 'magic points'],
  mpcost: ['法力消耗', '耗蓝', 'mana cost', 'mp cost'],
  mpmult: ['法力倍率', '法力值倍率', 'mana multiplier', 'mp multiplier'],
  mpregen: ['法力恢复', '法力回复', 'mana regeneration', 'mp regeneration'],
  mpregenmax: ['法力恢复上限', '法力回复上限', 'maximum mana regeneration', 'mp regeneration cap'],
  mpregenmult: ['法力恢复倍率', '法力回复倍率', 'mana regeneration multiplier', 'mp regeneration multiplier'],
  nocastcancel: ['施法不被打断', '免疫施法中断', 'uninterruptible casting', 'no cast cancel'],
  noflinch: ['免疫硬直', '不会硬直', 'flinch immunity', 'no flinch'],
  noknockback: ['免疫击退', '不会被击退', 'knockback immunity', 'no knockback'],
  noreflect: ['无视反射', '不可被反射', 'ignore reflection', 'cannot be reflected'],
  perfectcloak: ['完全隐身', '完美隐身', 'perfect cloak', 'true stealth'],
  perfectdodge: ['完全闪避', '完美闪避', 'perfect dodge', 'guaranteed dodge'],
  perfecthit: ['必定命中', '完美命中', 'perfect hit', 'guaranteed hit'],
  range: ['攻击范围', '攻击距离', 'attack range'],
  reflectdamage: ['伤害反射', '反伤', 'damage reflection', 'reflect damage'],
  reflectspell: ['法术反射', '反射法术', 'spell reflection', 'reflect spell'],
  siphonhp: ['汲取生命', '生命虹吸', 'health siphon', 'siphon health'],
  siphonmp: ['汲取法力', '法力虹吸', 'mana siphon', 'siphon mana'],
  skillarea: ['技能范围', '技能作用范围', 'skill area', 'skill area of effect'],
  skillautocast: ['技能自动施法', '技能自动触发', 'skill autocast', 'automatic skill cast'],
  skillcasttime: ['技能施法时间', '技能吟唱时间', 'skill cast time', 'skill casting time'],
  skillchains: ['技能连锁次数', '技能连锁', 'skill chain count', 'skill chains'],
  skillcharges: ['技能充能次数', '技能充能', 'skill charges', 'skill charge count'],
  skillcooldown: ['技能冷却', '技能冷却时间', 'skill cooldown'],
  skillcost: ['技能消耗', '技能法力消耗', 'skill cost', 'skill mana cost'],
  skilldamage: ['技能伤害', 'skill damage'],
  skillduration: ['技能持续时间', '技能时长', 'skill duration'],
  skillhits: ['技能命中次数', '技能攻击次数', 'skill hit count', 'skill hits'],
  skilllevel: ['技能等级', 'skill level'],
  skillpiercing: ['技能穿透', '技能贯穿', 'skill piercing', 'skill penetration'],
  skillremoveknockback: ['移除技能击退', '技能取消击退', 'remove skill knockback', 'skill removes knockback'],
  skillremovestatus: ['移除技能状态效果', '技能取消状态', 'remove skill status', 'skill removes status'],
  skillreplace: ['技能替换', '替换技能', 'skill replacement', 'replace skill'],
  skillsplash: ['技能溅射', '技能范围溅射', 'skill splash', 'skill splash damage'],
  spelldodge: ['法术闪避', '闪避法术', 'spell dodge', 'magic dodge'],
  splash: ['溅射', '溅射伤害', 'splash', 'splash damage'],
  statusimmune: ['状态免疫', '异常状态免疫', 'status immunity', 'ailment immunity'],
  statusmaxstacks: ['状态最大层数', '状态叠加上限', 'maximum status stacks', 'status stack limit'],
  str: ['力量', 'strength', 'str'],
  summonallstats: ['召唤物全属性', '召唤单位全属性', 'summon all stats', 'summon all attributes'],
  summonatkmult: ['召唤物攻击倍率', '召唤单位攻击倍率', 'summon attack multiplier'],
  summonatkspd: ['召唤物攻击速度', '召唤单位攻速', 'summon attack speed'],
  summonhealing: ['召唤物治疗效果', '召唤单位治疗', 'summon healing', 'summon healing power'],
  summonhpmult: ['召唤物生命倍率', '召唤单位生命倍率', 'summon health multiplier', 'summon hp multiplier'],
  summonmatkmult: ['召唤物魔法攻击倍率', '召唤单位魔攻倍率', 'summon magic attack multiplier'],
  summonresist: ['召唤物抗性', '召唤单位抗性', 'summon resistance', 'summon resist'],
  vit: ['体质', 'vitality', 'vit'],
  weightlimit: ['负重上限', '最大负重', 'weight limit', 'carrying capacity']
} as const)

export function collectEquipmentEffectTypes(...sources: readonly unknown[]): readonly string[] {
  const types = new Set<string>()
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || value === null || value === undefined) return
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1)
      return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if (typeof record.type === 'string' && record.type.trim()) types.add(record.type.trim())
    for (const entry of Object.values(record)) visit(entry, depth + 1)
  }
  for (const source of sources) visit(source, 0)
  return Object.freeze([...types].sort((left, right) => left.localeCompare(right, 'en')))
}

function collectEffectSearchTerms(value: unknown, terms: Set<string>, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return
  if (Array.isArray(value)) {
    for (const entry of value) collectEffectSearchTerms(entry, terms, depth + 1)
    return
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectEffectSearchTerms(entry, terms, depth + 1)
    }
    return
  }
  if (typeof value !== 'string') return

  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) terms.add(humanize(value))
  const identifier = canonical(value)
  for (const [type, aliases] of Object.entries(equipmentEffectSearchAliases)) {
    const suffix = identifier.slice(type.length)
    if (identifier !== type && !(identifier.startsWith(type) && /^\d+$/.test(suffix))) continue
    for (const alias of aliases) terms.add(alias)
  }
}

function effectAliasSearchText(item: EquipmentRecord): string {
  const terms = new Set<string>()
  for (const source of [item.stats, item.affixes, item.availableAffixes, item.setBonuses]) {
    collectEffectSearchTerms(source, terms)
  }
  return [...terms].join(' ')
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
      searchText: `${flattenSearchText(item)} ${effectAliasSearchText(item)}`.toLocaleLowerCase('en-US')
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
      const inheritedAllowed = item.allowedArchetypes.some(value => inheritsArchetype(query.archetype!, value))
      const unrestricted = item.allowedArchetypes.length === 0
      if (query.compatible ? !unrestricted && !inheritedAllowed : !explicitlyAllowed) return false
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
