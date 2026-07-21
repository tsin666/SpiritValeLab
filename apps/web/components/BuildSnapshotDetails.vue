<script setup lang="ts">
import type {
  Build,
  BuildEquipment,
  BuildGrimoire,
  BuildStatValue,
  LocalizedText
} from '~/composables/useApi'

type RuntimeEffectValue = {
  base?: number
  perLevel?: number
  string?: string
  string2?: string
}

type RuntimeEffect = {
  name?: string
  type?: string
  typeValue?: number
  value?: RuntimeEffectValue
  eventType?: string
  eventTypeValue?: number
  eventValue?: string
  conditionType?: string
  conditionTypeValue?: number
  conditionValue?: string
  chance?: number
  triggerType?: string
  triggerTypeValue?: number
  target?: string
  targetValue?: number
}

type EquipmentSetSnapshot = {
  id?: string
  slug?: string
  name?: string | LocalizedText
  nameZh?: string
  nameEn?: string
  equipmentIds?: string[]
  effects?: RuntimeEffect[]
  fullSet?: RuntimeEffect[]
}

type SnapshotEquipment = BuildEquipment & {
  setId?: string
  set?: EquipmentSetSnapshot
}

type PassiveRequirement = {
  skillId?: string
  level?: number
  resolvedConfigKind?: 'active' | 'passive' | string
}

type GrimoirePassiveSnapshot = {
  id?: string
  slug?: string
  name?: string | LocalizedText
  nameZh?: string
  nameEn?: string
  descriptionZh?: string
  descriptionEn?: string
  maxLevel?: number
  pvpMaxLevel?: number
  weaponTypes?: string[]
  weaponTypeValues?: number[]
  stanceTypes?: string[]
  stanceTypeValues?: number[]
  requirements?: PassiveRequirement[]
  effects?: RuntimeEffect[]
}

type SnapshotGrimoire = BuildGrimoire & {
  passive?: GrimoirePassiveSnapshot
}

type NameSnapshot = {
  id?: string
  name?: string | LocalizedText
  nameZh?: string
  nameEn?: string
}

const props = defineProps<{ build: Build }>()
const { t, locale } = useI18n()
const { statText } = useGameLocale()
const isEnglish = computed(() => locale.value.startsWith('en'))
const copy = computed(() => isEnglish.value ? {
  savedSnapshot: 'Saved source snapshot',
  selectedPieces: 'Selected pieces',
  sourceMembers: 'Set members in the saved game data',
  membersUnavailable: 'This build did not save the set member list.',
  effectsUnavailable: 'This build did not save set effects.',
  passiveSnapshot: 'Grimoire passive',
  passiveUnavailable: 'This legacy build did not save the grimoire passive or its restrictions.',
  descriptionUnavailable: 'No description was saved.',
  weaponRestriction: 'Weapon restriction',
  stanceRestriction: 'Stance restriction',
  noRestriction: 'None',
  unavailable: 'Not saved',
  maxLevel: 'Max level',
  requirements: 'Requirements',
  requiredSkill: 'Skill',
  effectId: 'Source effect',
  effectType: 'Type',
  effectValue: 'Value',
  event: 'Event',
  condition: 'Condition',
  chance: 'Chance',
  trigger: 'Trigger',
  target: 'Target',
  perLevel: 'per level',
  slot: 'Slot'
} : {
  savedSnapshot: '已保存的真实快照',
  selectedPieces: '本 BD 已选部件',
  sourceMembers: '游戏数据中的套装成员',
  membersUnavailable: '这套 BD 未保存套装成员列表。',
  effectsUnavailable: '这套 BD 未保存套装效果。',
  passiveSnapshot: '魔导书被动',
  passiveUnavailable: '这份旧版 BD 未保存魔导书被动与搭配限制。',
  descriptionUnavailable: '未保存说明。',
  weaponRestriction: '武器限制',
  stanceRestriction: '姿态限制',
  noRestriction: '无',
  unavailable: '未保存',
  maxLevel: '最高等级',
  requirements: '前置需求',
  requiredSkill: '技能',
  effectId: '源效果',
  effectType: '类型',
  effectValue: '数值',
  event: '事件',
  condition: '条件',
  chance: '概率',
  trigger: '触发器',
  target: '目标',
  perLevel: '每级',
  slot: '槽位'
})

const equipment = computed(() => props.build.equipment as SnapshotEquipment[])
const grimoires = computed(() => ([...(props.build.grimoires || [])] as SnapshotGrimoire[])
  .sort((left, right) => left.slotIndex - right.slotIndex))

const setCards = computed(() => {
  const sets = new Map<string, {
    id: string
    name: string
    selected: SnapshotEquipment[]
    memberIds?: string[]
    effects?: RuntimeEffect[]
  }>()

  for (const item of equipment.value) {
    const id = item.set?.id || item.setId
    if (!id) continue
    const current = sets.get(id)
    const effects = Array.isArray(item.set?.effects)
      ? item.set.effects
      : Array.isArray(item.set?.fullSet) ? item.set.fullSet : undefined
    const memberIds = Array.isArray(item.set?.equipmentIds) ? item.set.equipmentIds : undefined
    if (current) {
      current.selected.push(item)
      if (!current.effects && effects) current.effects = effects
      if (!current.memberIds && memberIds) current.memberIds = memberIds
      continue
    }
    sets.set(id, {
      id,
      name: localizedName(item.set || {}, id),
      selected: [item],
      memberIds,
      effects
    })
  }
  return [...sets.values()]
})

const affixCards = computed(() => {
  const result: Array<{ key: string; name: string; slot: string; affixes: BuildStatValue[] }> = []
  for (const [index, item] of equipment.value.entries()) {
    if (!item.actualAffixes?.length) continue
    result.push({
      key: `equipment:${item.id}:${item.slotKey || item.slot}:${index}`,
      name: localizedName(item, item.id),
      slot: item.slotKey ? t(`builder.loadout.equipmentSlots.${item.slotKey}`) : item.slot,
      affixes: item.actualAffixes
    })
  }
  for (const [index, item] of (props.build.artifacts || []).entries()) {
    if (!item.actualAffixes?.length) continue
    result.push({
      key: `artifact:${item.id}:${item.slot}:${index}`,
      name: localizedName(item, item.id),
      slot: t(`builder.loadout.artifactSlots.${item.slot}`),
      affixes: item.actualAffixes
    })
  }
  return result
})

const hasDetails = computed(() => setCards.value.length > 0 || affixCards.value.length > 0 || grimoires.value.length > 0)

function localizedName(item: NameSnapshot, fallback = '') {
  const localized = typeof item.name === 'object' && item.name
    ? (isEnglish.value ? item.name.en || item.name.zh : item.name.zh || item.name.en)
    : item.name
  return isEnglish.value
    ? (item.nameEn || localized || item.nameZh || fallback)
    : (item.nameZh || localized || item.nameEn || fallback)
}

function formatNumber(value?: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value)
    : '—'
}

function formatStat(stat: BuildStatValue) {
  const value = `${stat.value > 0 ? '+' : ''}${formatNumber(stat.value)}${stat.unit === 'percent' ? '%' : ''}`
  const bonus = typeof stat.bonus === 'number' && stat.bonus !== 0
    ? ` · ${stat.bonus > 0 ? '+' : ''}${formatNumber(stat.bonus)}${stat.unit === 'percent' ? '%' : ''}`
    : ''
  const subject = stat.subjectId ? ` · ${stat.subjectId}` : ''
  return `${statText(stat.type)} ${value}${bonus}${subject}`
}

function formatEffectValue(value?: RuntimeEffectValue) {
  if (!value) return '—'
  const parts: string[] = []
  if (typeof value.base === 'number') parts.push(formatNumber(value.base))
  if (typeof value.perLevel === 'number') parts.push(`${copy.value.perLevel} ${formatNumber(value.perLevel)}`)
  if (value.string) parts.push(value.string)
  if (value.string2) parts.push(value.string2)
  return parts.join(' · ') || '—'
}

function enumValue(name?: string, numeric?: number, extra?: string) {
  return [name || '—', typeof numeric === 'number' ? `#${numeric}` : '', extra || ''].filter(Boolean).join(' · ')
}

function effectRows(effect: RuntimeEffect) {
  const type = effect.type || '—'
  const localizedType = effect.type ? statText(effect.type) : type
  return [
    { label: copy.value.effectId, value: effect.name || '—' },
    { label: copy.value.effectType, value: localizedType === type ? enumValue(type, effect.typeValue) : `${localizedType} · ${enumValue(type, effect.typeValue)}` },
    { label: copy.value.effectValue, value: formatEffectValue(effect.value) },
    { label: copy.value.event, value: enumValue(effect.eventType, effect.eventTypeValue, effect.eventValue) },
    { label: copy.value.condition, value: enumValue(effect.conditionType, effect.conditionTypeValue, effect.conditionValue) },
    { label: copy.value.chance, value: formatNumber(effect.chance) },
    { label: copy.value.trigger, value: enumValue(effect.triggerType, effect.triggerTypeValue) },
    { label: copy.value.target, value: enumValue(effect.target, effect.targetValue) }
  ]
}

function constraintList(passive: GrimoirePassiveSnapshot | undefined, field: 'weaponTypes' | 'stanceTypes') {
  const values = passive?.[field]
  if (!Array.isArray(values)) return copy.value.unavailable
  if (!values.length) return copy.value.noRestriction
  if (field === 'stanceTypes') return values.map(value => t(`builder.loadout.stances.${value}`)).join(' / ')
  return values.join(' / ')
}

function passiveDescription(passive?: GrimoirePassiveSnapshot) {
  if (!passive) return ''
  return isEnglish.value
    ? (passive.descriptionEn || passive.descriptionZh || '')
    : (passive.descriptionZh || passive.descriptionEn || '')
}
</script>

<template>
  <div v-if="hasDetails" class="build-snapshot-details">
    <section v-if="affixCards.length" class="build-snapshot-details__section">
      <header>
        <span>{{ copy.savedSnapshot }}</span>
        <h3>{{ t('builder.loadout.editor.actualAffixes') }}</h3>
      </header>
      <div class="build-snapshot-affixes">
        <article v-for="item in affixCards" :key="item.key">
          <small>{{ copy.slot }} · {{ item.slot }}</small>
          <h4>{{ item.name }}</h4>
          <ul><li v-for="(affix, index) in item.affixes" :key="`${affix.type}:${affix.subjectId || ''}:${index}`">{{ formatStat(affix) }}</li></ul>
        </article>
      </div>
    </section>

    <section v-if="setCards.length" class="build-snapshot-details__section">
      <header>
        <span>{{ t('equipment.setKicker') }}</span>
        <h3>{{ t('equipment.setInfo') }}</h3>
      </header>
      <div class="build-snapshot-sets">
        <article v-for="set in setCards" :key="set.id">
          <header>
            <div><small>{{ set.id }}</small><h4>{{ set.name }}</h4></div>
            <strong>{{ set.selected.length }} / {{ set.memberIds?.length ?? '—' }}</strong>
          </header>
          <div class="build-snapshot-chip-group">
            <span>{{ copy.selectedPieces }}</span>
            <div><code v-for="item in set.selected" :key="`${set.id}:${item.id}:${item.slotKey || item.slot}`">{{ localizedName(item, item.id) }}</code></div>
          </div>
          <div v-if="set.memberIds" class="build-snapshot-chip-group">
            <span>{{ copy.sourceMembers }}</span>
            <div><code v-for="id in set.memberIds" :key="`${set.id}:member:${id}`">{{ id }}</code></div>
          </div>
          <p v-else class="build-snapshot-details__missing">{{ copy.membersUnavailable }}</p>
          <h5>{{ t('equipment.setBonuses') }}</h5>
          <div v-if="set.effects" class="build-snapshot-effects">
            <details v-for="(effect, index) in set.effects" :key="`${set.id}:${effect.name || index}`" :open="index === 0">
              <summary><strong>{{ effect.type ? statText(effect.type) : effect.name }}</strong><span>{{ formatEffectValue(effect.value) }}</span></summary>
              <dl><div v-for="row in effectRows(effect)" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
            </details>
          </div>
          <p v-else class="build-snapshot-details__missing">{{ copy.effectsUnavailable }}</p>
        </article>
      </div>
    </section>

    <section v-if="grimoires.length" class="build-snapshot-details__section">
      <header>
        <span>{{ copy.passiveSnapshot }}</span>
        <h3>{{ t('builder.loadout.grimoires') }}</h3>
      </header>
      <div class="build-snapshot-grimoires">
        <article v-for="grimoire in grimoires" :key="`${grimoire.slotIndex}:${grimoire.id}`">
          <header>
            <div><small>{{ t('builder.loadout.editor.slotNumber', { number: grimoire.slotIndex + 1 }) }}</small><h4>{{ localizedName(grimoire, grimoire.id) }}</h4></div>
            <img v-if="grimoire.icon" :src="grimoire.icon" alt="" loading="lazy">
          </header>
          <template v-if="grimoire.passive">
            <h5>{{ localizedName(grimoire.passive, grimoire.passive.id || grimoire.id) }}</h5>
            <p>{{ passiveDescription(grimoire.passive) || copy.descriptionUnavailable }}</p>
            <dl class="build-snapshot-restrictions">
              <div><dt>{{ copy.weaponRestriction }}</dt><dd>{{ constraintList(grimoire.passive, 'weaponTypes') }}</dd></div>
              <div><dt>{{ copy.stanceRestriction }}</dt><dd>{{ constraintList(grimoire.passive, 'stanceTypes') }}</dd></div>
              <div><dt>{{ copy.maxLevel }}</dt><dd>{{ formatNumber(grimoire.passive.maxLevel) }}</dd></div>
            </dl>
            <div v-if="grimoire.passive.requirements?.length" class="build-snapshot-requirements">
              <strong>{{ copy.requirements }}</strong>
              <span v-for="(requirement, index) in grimoire.passive.requirements" :key="`${requirement.skillId}:${index}`">
                {{ copy.requiredSkill }} {{ requirement.skillId || '—' }} · {{ requirement.resolvedConfigKind || '—' }} · Lv.{{ requirement.level ?? '—' }}
              </span>
            </div>
            <div v-if="grimoire.passive.effects" class="build-snapshot-effects">
              <details v-for="(effect, index) in grimoire.passive.effects" :key="`${grimoire.id}:${effect.name || index}`">
                <summary><strong>{{ effect.type ? statText(effect.type) : effect.name }}</strong><span>{{ formatEffectValue(effect.value) }}</span></summary>
                <dl><div v-for="row in effectRows(effect)" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div></dl>
              </details>
            </div>
          </template>
          <p v-else class="build-snapshot-details__missing">{{ copy.passiveUnavailable }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.build-snapshot-details { display: grid; gap: 18px; margin-top: 18px; }
.build-snapshot-details__section { padding: clamp(18px, 3vw, 28px); border: 1px solid #dce9e5; border-radius: 24px; background: rgba(255, 255, 255, .82); box-shadow: 0 18px 42px rgba(32, 62, 57, .08); }
.build-snapshot-details__section > header { margin-bottom: 16px; }
.build-snapshot-details__section > header span { color: #168d7e; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.build-snapshot-details__section h3 { margin: 5px 0 0; color: #123c38; font-size: clamp(20px, 2.4vw, 28px); }
.build-snapshot-details__section h4, .build-snapshot-details__section h5 { margin: 0; color: #173f3b; }
.build-snapshot-details__section h4 { font-size: 16px; }
.build-snapshot-details__section h5 { margin-top: 16px; font-size: 13px; }
.build-snapshot-affixes, .build-snapshot-sets, .build-snapshot-grimoires { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.build-snapshot-affixes > article, .build-snapshot-sets > article, .build-snapshot-grimoires > article { min-width: 0; padding: 16px; border: 1px solid #e0ece8; border-radius: 18px; background: #f8fbfa; }
.build-snapshot-affixes small, .build-snapshot-sets small, .build-snapshot-grimoires small { color: #6b8984; font-size: 10px; }
.build-snapshot-affixes ul { display: grid; gap: 6px; margin: 12px 0 0; padding: 0; list-style: none; }
.build-snapshot-affixes li { padding: 7px 9px; border-radius: 9px; color: #245b54; background: #eaf5f1; font-size: 11px; overflow-wrap: anywhere; }
.build-snapshot-sets > article > header, .build-snapshot-grimoires > article > header { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.build-snapshot-sets > article > header strong { flex: 0 0 auto; padding: 6px 9px; border-radius: 999px; color: #0f7468; background: #e4f3ef; font-size: 11px; }
.build-snapshot-grimoires > article > header img { width: 46px; height: 46px; object-fit: contain; border-radius: 11px; background: #eaf4f1; }
.build-snapshot-grimoires p { margin: 8px 0 0; color: #58726e; font-size: 11px; line-height: 1.7; }
.build-snapshot-chip-group { margin-top: 14px; }
.build-snapshot-chip-group > span { display: block; margin-bottom: 7px; color: #64827d; font-size: 10px; font-weight: 700; }
.build-snapshot-chip-group > div { display: flex; flex-wrap: wrap; gap: 5px; }
.build-snapshot-chip-group code { padding: 4px 7px; border-radius: 7px; color: #236159; background: #e9f4f1; font-size: 9px; overflow-wrap: anywhere; }
.build-snapshot-details__missing { margin: 12px 0 0; padding: 9px 11px; border-radius: 10px; color: #87765f; background: #f7f0e6; font-size: 11px; line-height: 1.6; }
.build-snapshot-effects { display: grid; gap: 7px; margin-top: 9px; }
.build-snapshot-effects details { overflow: hidden; border: 1px solid #dceae6; border-radius: 12px; background: #fff; }
.build-snapshot-effects summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; color: #285c55; cursor: pointer; font-size: 11px; }
.build-snapshot-effects summary span { color: #148779; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.build-snapshot-effects dl, .build-snapshot-restrictions { display: grid; gap: 1px; margin: 0; padding: 0 12px 12px; }
.build-snapshot-effects dl > div, .build-snapshot-restrictions > div { display: grid; grid-template-columns: minmax(90px, .35fr) minmax(0, 1fr); gap: 10px; padding: 6px 0; border-top: 1px solid #edf3f1; }
.build-snapshot-effects dt, .build-snapshot-restrictions dt { color: #78908c; font-size: 9px; }
.build-snapshot-effects dd, .build-snapshot-restrictions dd { min-width: 0; margin: 0; color: #315e58; font: 10px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.build-snapshot-restrictions { margin-top: 12px; padding: 0; }
.build-snapshot-requirements { display: grid; gap: 5px; margin-top: 12px; }
.build-snapshot-requirements strong { color: #526f6a; font-size: 10px; }
.build-snapshot-requirements span { padding: 7px 9px; border-radius: 9px; color: #365f59; background: #edf5f2; font-size: 10px; }

@media (max-width: 760px) {
  .build-snapshot-affixes, .build-snapshot-sets, .build-snapshot-grimoires { grid-template-columns: 1fr; }
}
</style>
