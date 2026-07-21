<script setup lang="ts">
import type {
  Archetype,
  ArchetypeStage,
  BuildArtifact,
  BuildArtifactSlot,
  BuildCharacterSnapshot,
  BuildEquipment,
  BuildEquipmentSet,
  BuildEquipmentSlot,
  BuildGrimoire,
  BuilderEquipmentSlotOption,
  BuilderOption,
  BuilderOptions,
  BuildSkillAllocation,
  RuntimeEffect
} from '~/composables/useApi'
import { CANONICAL_EQUIPMENT_SLOTS, splitEquipmentColumns } from '~/utils/equipment-slots'

const props = withDefaults(defineProps<{
  options: BuilderOptions
  mode?: 'view' | 'edit'
  archetype?: BuilderOption
  equipmentSelections: BuildEquipment[]
  artifactSelections: BuildArtifact[]
  grimoireSelections: BuildGrimoire[]
  character?: BuildCharacterSnapshot
  skillTree?: BuildSkillAllocation[]
}>(), {
  mode: 'edit',
  equipmentSelections: () => [],
  artifactSelections: () => [],
  grimoireSelections: () => [],
  skillTree: () => []
})

const emit = defineEmits<{
  'open-equipment': [slot: BuildEquipmentSlot]
  'open-artifact': [slot: BuildArtifactSlot]
  'open-grimoire': [index: number]
  'open-character': []
  'open-skills': []
  'remove-unresolved-equipment': [selection: BuildEquipment, index: number]
}>()

const { t, te, locale } = useI18n()
const { gameLocale, gameText, statText } = useGameLocale()

const canonicalEquipmentSlots: BuildEquipmentSlot[] = [...CANONICAL_EQUIPMENT_SLOTS]
const canonicalArtifactSlots: BuildArtifactSlot[] = ['Rune', 'Jewel', 'Scroll', 'Relic']
const grimoireSlotIndexes = [0, 1, 2] as const
const skillStages: ArchetypeStage[] = ['base', 'advanced', 'profession', 'special']
const failedIcons = ref(new Set<string>())
const isEditable = computed(() => props.mode === 'edit')

const equipmentCatalog = computed(() => new Map(props.options.equipment.map(item => [item.id, item])))
const equipmentSetCatalog = computed(() => new Map((props.options.equipmentSets || []).map(item => [item.id, item])))
const artifactCatalog = computed(() => new Map(props.options.artifacts.map(item => [item.id, item])))
const grimoireCatalog = computed(() => new Map(props.options.grimoires.map(item => [item.id, item])))
const gemCatalog = computed(() => new Map(props.options.gems.map(item => [item.id, item])))
const cardCatalog = computed(() => new Map(props.options.cards.map(item => [item.id, item])))
const skillCatalog = computed(() => new Map([...props.options.skills, ...props.options.skillPassives].map(item => [item.id, item])))
const archetypeCatalog = computed(() => new Map(props.options.archetypes.map(item => [item.id, item])))

const equipmentSlots = computed<BuilderEquipmentSlotOption[]>(() => canonicalEquipmentSlots.map(value => (
  props.options.equipmentSlots.find(slot => slot.value === value) || { value, sourceName: value }
)))
const artifactSlots = computed(() => {
  const configured = props.options.artifactSlots.filter(slot => canonicalArtifactSlots.includes(slot))
  return [...configured, ...canonicalArtifactSlots.filter(slot => !configured.includes(slot))].slice(0, 4)
})

const archetypeIconItem = computed(() => props.archetype as unknown as Partial<Archetype> | undefined)
const className = computed(() => optionName(props.archetype, props.archetype?.id || ''))
const classStage = computed(() => props.archetype?.stage ? t(`classes.stages.${props.archetype.stage}`) : '')
const archetypeLineage = computed(() => {
  const lineage: BuilderOption[] = []
  const seen = new Set<string>()
  let current = props.archetype
  while (current && !seen.has(current.id)) {
    lineage.unshift(current)
    seen.add(current.id)
    current = current.requiredClassId ? archetypeCatalog.value.get(current.requiredClassId) : undefined
  }
  return lineage
})

const equipmentAssignments = computed(() => {
  const selections = new Map<BuildEquipmentSlot, BuildEquipment>()
  const unresolved: BuildEquipment[] = []
  for (const item of props.equipmentSelections) {
    const slot = resolveEquipmentSlot(item)
    if (slot && !selections.has(slot)) selections.set(slot, item)
    else unresolved.push(item)
  }
  return { selections, unresolved }
})

const equipmentSelectionBySlot = computed(() => equipmentAssignments.value.selections)
const unresolvedEquipmentCards = computed(() => equipmentAssignments.value.unresolved.map((selection, index) => {
  const catalog = equipmentCatalog.value.get(selection.id)
  const icon = publicIcon(catalog?.icon) || publicIcon(selection.icon)
  return {
    index,
    selection,
    icon,
    iconKey: `equipment:unresolved:${selection.id}:${index}:${icon}`,
    name: optionName(catalog, snapshotName(selection) || selection.id),
    sourceSlot: selection.slot || selection.slotEn || '',
    details: equipmentDetails(selection, catalog)
  }
}))

const equipmentCards = computed(() => equipmentSlots.value.map((slot, index) => {
  const selection = equipmentSelectionBySlot.value.get(slot.value)
  const catalog = selection ? equipmentCatalog.value.get(selection.id) : undefined
  const icon = publicIcon(catalog?.icon) || publicIcon(selection?.icon)
  return {
    index,
    slot: slot.value,
    label: t(`builder.loadout.equipmentSlots.${slot.value}`),
    selection,
    icon,
    iconKey: `equipment:${slot.value}:${selection?.id || 'empty'}:${icon}`,
    name: selection ? optionName(catalog, snapshotName(selection) || selection.id) : '',
    details: selection ? equipmentDetails(selection, catalog) : []
  }
}))
const equipmentColumns = computed(() => splitEquipmentColumns(equipmentCards.value))
const leftEquipmentCards = computed(() => equipmentColumns.value.left)
const rightEquipmentCards = computed(() => equipmentColumns.value.right)
const equipmentSetCards = computed(() => {
  const unique = new Map<string, BuildEquipmentSet>()
  for (const selection of props.equipmentSelections) {
    const catalog = equipmentCatalog.value.get(selection.id)
    const set = resolveEquipmentSet(selection, catalog)
    if (set && !unique.has(set.id)) unique.set(set.id, set)
  }
  return [...unique.values()].map(set => ({
    set,
    name: snapshotName(set) || set.id,
    equipmentIds: set.equipmentIds || [],
    effects: set.effects || []
  }))
})

const artifactCards = computed(() => artifactSlots.value.map(slot => {
  const selection = props.artifactSelections.find(item => item.slot === slot)
  const catalog = selection ? artifactCatalog.value.get(selection.id) : undefined
  const partIcon = selection
    ? publicIcon(catalog?.parts?.find(part => part.index === selection.partIndex)?.icon)
    : ''
  const icon = partIcon || publicIcon(selection?.partIcon) || publicIcon(catalog?.icon)
  return {
    slot,
    label: t(`builder.loadout.artifactSlots.${slot}`),
    selection,
    icon,
    iconKey: `artifact:${slot}:${selection?.id || 'empty'}:${icon}`,
    name: selection ? optionName(catalog, snapshotName(selection) || selection.id) : '',
    details: selection ? artifactDetails(selection, catalog) : []
  }
}))

const grimoireCards = computed(() => grimoireSlotIndexes.map(index => {
  const selection = props.grimoireSelections.find(item => item.slotIndex === index)
  const catalog = selection ? grimoireCatalog.value.get(selection.id) : undefined
  const icon = publicIcon(catalog?.icon) || publicIcon(selection?.icon)
  return {
    index,
    selection,
    icon,
    iconKey: `grimoire:${index}:${selection?.id || 'empty'}:${icon}`,
    name: selection ? optionName(catalog, snapshotName(selection) || selection.id) : '',
    details: selection ? grimoireDetails(selection, catalog) : []
  }
}))

const equippedCount = computed(() => props.equipmentSelections.length)
const artifactCount = computed(() => artifactCards.value.filter(card => card.selection).length)
const grimoireCount = computed(() => grimoireCards.value.filter(card => card.selection).length)

// Every entry in skillTree is an explicit user-confirmed allocation. Some
// runtime passives have maxLevel 0 and are represented as a deliberate 0/0
// selection, so filtering by a positive level would silently erase evidence
// the player saved. Empty catalog entries never enter this array.
const allocatedSkills = computed(() => props.skillTree || [])
const skillGroups = computed(() => {
  const grouped = new Map<ArchetypeStage | 'unresolved', ReturnType<typeof skillCard>[]>()
  for (const stage of skillStages) grouped.set(stage, [])
  grouped.set('unresolved', [])

  for (const skill of allocatedSkills.value) {
    const tree = archetypeCatalog.value.get(skill.treeArchetype)
    const stage = tree?.stage && skillStages.includes(tree.stage) ? tree.stage : 'unresolved'
    grouped.get(stage)?.push(skillCard(skill))
  }

  return [
    ...skillStages.map(stage => ({ stage, label: skillStageLabel(stage), cards: grouped.get(stage) || [] })),
    ...(grouped.get('unresolved')?.length
      ? [{ stage: 'unresolved' as const, label: t('builder.loadout.unresolvedTree'), cards: grouped.get('unresolved') || [] }]
      : [])
  ]
})

const coreStats = computed(() => {
  const order = new Map(props.options.statTypes.map((type, index) => [type, index]))
  return [...(props.character?.stats || [])]
    .filter(stat => isFiniteNumber(stat.value) && (stat.bonus === undefined || isFiniteNumber(stat.bonus)))
    .sort((left, right) => (order.get(left.type) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.type) ?? Number.MAX_SAFE_INTEGER))
})

function publicIcon(value?: string | null) {
  const icon = value?.trim()
  return icon && icon.startsWith('/') && !icon.startsWith('//') ? icon : ''
}

function optionName(option?: BuilderOption, fallback = '') {
  if (!option) return fallback
  return gameText(option.name, option.displayName || option.id || fallback)
}

function snapshotName(item: { name?: string; nameZh?: string; nameEn?: string }) {
  return gameLocale.value === 'en'
    ? (item.nameEn || item.name || item.nameZh || '')
    : (item.nameZh || item.name || item.nameEn || '')
}

function localizedDescription(item: { descriptionZh?: string | null; descriptionEn?: string | null }) {
  return gameLocale.value === 'en'
    ? (item.descriptionEn || item.descriptionZh || '')
    : (item.descriptionZh || item.descriptionEn || '')
}

function skillCard(skill: BuildSkillAllocation) {
  const catalog = skillCatalog.value.get(skill.id)
  const icon = publicIcon(catalog?.icon) || publicIcon(skill.icon)
  return {
    skill,
    icon,
    iconKey: `skill:${skill.treeArchetype}:${skill.id}:${icon}`,
    name: optionName(catalog, snapshotName(skill) || skill.id)
  }
}

function skillStageLabel(stage: ArchetypeStage) {
  if (stage === 'base') return t('builder.loadout.baseTree')
  if (stage === 'advanced') return t('builder.loadout.advancedTree')
  return `${t(`classes.stages.${stage}`)} / ${t('builder.loadout.skills')}`
}

function normalizeSlot(value?: string | null) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function resolveEquipmentSlot(item: BuildEquipment) {
  if (item.slotKey && canonicalEquipmentSlots.includes(item.slotKey)) return item.slotKey
  const catalog = equipmentCatalog.value.get(item.id)
  const candidates = [item.slot, item.slotEn, catalog?.slot].map(normalizeSlot).filter(Boolean)
  return equipmentSlots.value.find(slot => {
    const values = [slot.value, slot.sourceName].map(normalizeSlot)
    return candidates.some(candidate => values.includes(candidate))
  })?.value
}

function markIconFailed(key: string) {
  const next = new Set(failedIcons.value)
  next.add(key)
  failedIcons.value = next
}

function iconMarker(name: string, fallback = '+') {
  const marker = Array.from(name.trim()).slice(0, 2).join('').toLocaleUpperCase(locale.value)
  return marker || fallback
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatStatValue(value: number, unit?: 'flat' | 'percent') {
  const formatted = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }).format(value)
  return unit === 'percent' ? `${formatted}%` : formatted
}

function formatBonus(value: number, unit?: 'flat' | 'percent') {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatStatValue(value, unit)}`
}

function affixText(affix: NonNullable<BuildEquipment['actualAffixes']>[number]) {
  const bonus = affix.bonus ? ` ${formatBonus(affix.bonus, affix.unit)}` : ''
  return `${statText(affix.type)} ${formatStatValue(affix.value, affix.unit)}${bonus}`
}

type LoadoutDetail = { key: string; label: string; value: string }

function runtimeEffectText(effect: RuntimeEffect) {
  const values: string[] = []
  if (isFiniteNumber(effect.value?.base)) values.push(`${t('builder.loadout.effectBase')} ${formatStatValue(effect.value.base)}`)
  if (isFiniteNumber(effect.value?.perLevel) && effect.value.perLevel !== 0) {
    values.push(`${t('builder.loadout.effectPerLevel')} ${formatBonus(effect.value.perLevel)}`)
  }
  if (effect.value?.string) values.push(effect.value.string)
  if (effect.value?.string2) values.push(effect.value.string2)
  if (effect.chance) values.push(`${t('builder.loadout.chance')} ${formatStatValue(effect.chance * 100, 'percent')}`)
  if (effect.eventType && effect.eventType !== 'None') values.push(`${t('builder.loadout.event')} ${effect.eventType}`)
  if (effect.conditionType && effect.conditionType !== 'None') values.push(`${t('builder.loadout.condition')} ${effect.conditionType}${effect.conditionValue ? `: ${effect.conditionValue}` : ''}`)
  if (effect.triggerType && effect.triggerType !== 'None') values.push(`${t('builder.loadout.trigger')} ${effect.triggerType}`)
  if (effect.target) values.push(`${t('builder.loadout.target')} ${effect.target}`)
  const localizedType = effect.type ? statText(effect.type) : ''
  const title = localizedType || effect.type || effect.name
  const source = effect.name && effect.name !== effect.type
    ? `${t('builder.loadout.sourceEffect')} ${effect.name}`
    : ''
  return [title, source, ...values].filter(Boolean).join(' · ')
}

function equipmentDetails(selection: BuildEquipment, catalog?: BuilderOption) {
  const details: Array<{ key: string; label: string; value: string }> = []
  const description = localizedDescription(selection) || (catalog ? localizedDescription(catalog) : '')
  if (description) details.push({ key: 'description', label: t('builder.loadout.description'), value: description })
  const equipmentType = selection.type || catalog?.type || ''
  const element = selection.element || catalog?.element || ''
  const levelRequired = selection.levelRequired ?? catalog?.levelRequired
  if (equipmentType) details.push({ key: 'equipment-type', label: t('builder.loadout.equipmentType'), value: equipmentType })
  if (element) details.push({ key: 'element', label: t('builder.loadout.element'), value: element })
  if (isFiniteNumber(levelRequired)) {
    details.push({ key: 'level-required', label: t('builder.loadout.levelRequired'), value: String(levelRequired) })
  }
  for (const [index, effect] of (selection.primaryStats || []).entries()) {
    details.push({ key: `primary-stat:${index}`, label: t('builder.loadout.primaryStat'), value: runtimeEffectText(effect) })
  }
  for (const [index, effect] of (selection.secondaryStats || []).entries()) {
    details.push({ key: `secondary-stat:${index}`, label: t('builder.loadout.secondaryStat'), value: runtimeEffectText(effect) })
  }
  if (isFiniteNumber(selection.refineLevel)) {
    details.push({ key: 'refine', label: t('builder.loadout.refine'), value: `+${selection.refineLevel}` })
  }
  if (isFiniteNumber(selection.potential)) {
    details.push({ key: 'potential', label: t('builder.loadout.potential'), value: String(selection.potential) })
  }
  for (const [index, affix] of (selection.actualAffixes || []).entries()) {
    details.push({ key: `affix:${index}`, label: t('builder.loadout.affix'), value: affixText(affix) })
  }
  for (const [index, card] of (selection.cards || []).entries()) {
    const cardOption = cardCatalog.value.get(card.id)
    details.push({
      key: `card:${card.slotIndex}:${card.id}:${index}`,
      label: t('builder.loadout.card'),
      value: optionName(cardOption, snapshotName(card) || card.id)
    })
    const cardDescription = localizedDescription(card) || (cardOption ? localizedDescription(cardOption) : '')
    if (cardDescription) {
      details.push({ key: `card-description:${card.slotIndex}:${card.id}:${index}`, label: t('builder.loadout.cardDescription'), value: cardDescription })
    }
    for (const [statIndex, effect] of (card.stats || cardOption?.stats || []).entries()) {
      details.push({ key: `card-stat:${card.slotIndex}:${card.id}:${index}:${statIndex}`, label: t('builder.loadout.cardStat'), value: runtimeEffectText(effect) })
    }
  }
  const setId = selection.setId || catalog?.setId || undefined
  const set = resolveEquipmentSet(selection, catalog)
  if (set || setId) {
    details.push({
      key: `set:${setId || set?.id}`,
      label: t('builder.loadout.set'),
      value: set ? snapshotName(set) || set.id : String(setId)
    })
  }
  return details
}

function resolveEquipmentSet(selection: BuildEquipment, catalog?: BuilderOption) {
  if (selection.set) return selection.set
  const setId = selection.setId || catalog?.setId || undefined
  return setId ? equipmentSetCatalog.value.get(setId) : undefined
}

function artifactDetails(selection: BuildArtifact, catalog?: BuilderOption) {
  const details: LoadoutDetail[] = [{
    key: 'part-index',
    label: t('builder.loadout.partIndex'),
    value: String(selection.partIndex)
  }]
  const description = localizedDescription(selection) || (catalog ? localizedDescription(catalog) : '')
  if (description) details.push({ key: 'description', label: t('builder.loadout.description'), value: description })
  const partDescription = gameLocale.value === 'en'
    ? (selection.partDescriptionEn || selection.partDescriptionZh || '')
    : (selection.partDescriptionZh || selection.partDescriptionEn || '')
  if (partDescription) details.push({ key: 'part-description', label: t('builder.loadout.partDescription'), value: partDescription })
  const artifactEffects: Array<[string, RuntimeEffect[] | undefined, string]> = [
    ['full-set', selection.fullSet || catalog?.fullSet, t('builder.loadout.artifactFullSet')],
    ['per-piece', selection.perPiece || catalog?.perPiece, t('builder.loadout.artifactPerPiece')],
    ['per-refine', selection.perRefine || catalog?.perRefine, t('builder.loadout.artifactPerRefine')],
    ['individual', selection.individual || catalog?.individual, t('builder.loadout.artifactIndividual')]
  ]
  for (const [group, effects, label] of artifactEffects) {
    for (const [index, effect] of (effects || []).entries()) {
      details.push({ key: `${group}:${index}`, label, value: runtimeEffectText(effect) })
    }
  }
  if (isFiniteNumber(selection.refineLevel)) {
    details.push({ key: 'refine', label: t('builder.loadout.refine'), value: `+${selection.refineLevel}` })
  }
  for (const [index, affix] of (selection.actualAffixes || []).entries()) {
    details.push({ key: `affix:${index}`, label: t('builder.loadout.affix'), value: affixText(affix) })
  }
  if (selection.gem) {
    const gemOption = gemCatalog.value.get(selection.gem.id)
    details.push({ key: `gem:${selection.gem.id}`, label: t('builder.loadout.gem'), value: optionName(gemOption, snapshotName(selection.gem) || selection.gem.id) })
    const gemDescription = localizedDescription(selection.gem) || (gemOption ? localizedDescription(gemOption) : '')
    if (gemDescription) details.push({ key: `gem-description:${selection.gem.id}`, label: t('builder.loadout.gemDescription'), value: gemDescription })
    if (selection.gem.affix) {
      details.push({ key: `gem-affix:${selection.gem.id}`, label: t('builder.loadout.gemAffix'), value: selection.gem.affix })
    }
    for (const [index, effect] of (selection.gem.stats || gemOption?.stats || []).entries()) {
      details.push({ key: `gem-stat:${selection.gem.id}:${index}`, label: t('builder.loadout.gemStat'), value: runtimeEffectText(effect) })
    }
  }
  return details
}

function localizedPassiveDescription(passive: NonNullable<BuildGrimoire['passive']>) {
  return gameLocale.value === 'en'
    ? (passive.descriptionEn || passive.descriptionZh || '')
    : (passive.descriptionZh || passive.descriptionEn || '')
}

function weaponTypeLabel(value: string) {
  const key = value ? `${value.charAt(0).toLocaleLowerCase('en-US')}${value.slice(1)}` : ''
  return key && te(`game.types.${key}`) ? t(`game.types.${key}`) : value
}

function stanceTypeLabel(value: string) {
  return te(`builder.loadout.stances.${value}`) ? t(`builder.loadout.stances.${value}`) : value
}

function restrictionText(values: string[] | undefined, formatter: (value: string) => string) {
  if (!Array.isArray(values)) return ''
  return values.length ? values.map(formatter).join(', ') : t('builder.loadout.unrestricted')
}

function grimoireDetails(selection: BuildGrimoire, catalog?: BuilderOption) {
  const details: LoadoutDetail[] = []
  const passive = selection.passive || catalog?.passive
  if (!passive) return details
  details.push({
    key: `passive:${passive.id}`,
    label: t('builder.loadout.passive'),
    value: snapshotName(passive) || passive.id
  })
  const description = localizedPassiveDescription(passive)
  if (description) details.push({ key: `passive-description:${passive.id}`, label: t('builder.loadout.description'), value: description })
  const weaponRestriction = restrictionText(passive.weaponTypes, weaponTypeLabel)
  if (weaponRestriction) details.push({ key: `weapon-restriction:${passive.id}`, label: t('builder.loadout.weaponRestriction'), value: weaponRestriction })
  const stanceRestriction = restrictionText(passive.stanceTypes, stanceTypeLabel)
  if (stanceRestriction) details.push({ key: `stance-restriction:${passive.id}`, label: t('builder.loadout.stanceRestriction'), value: stanceRestriction })
  for (const [index, requirement] of (passive.requirements || []).entries()) {
    details.push({
      key: `passive-requirement:${passive.id}:${requirement.skillId}:${index}`,
      label: t('builder.loadout.requirement'),
      value: `${requirement.skillId} · ${t('builder.loadout.requirementLevel', { level: requirement.level })}`
    })
  }
  for (const [index, effect] of (passive.effects || []).entries()) {
    details.push({ key: `passive-effect:${passive.id}:${index}`, label: t('builder.loadout.passiveEffect'), value: runtimeEffectText(effect) })
  }
  return details
}

function stanceLabel() {
  const stance = props.character?.stance
  return stance ? t(`builder.loadout.stances.${stance}`) : '\u2014'
}
</script>

<template>
  <section class="build-loadout-board" :aria-label="t('builder.loadout.title')">
    <header class="build-loadout-board__header">
      <div>
        <span>{{ t('builder.loadout.title') }}</span>
        <p>{{ t('builder.loadout.subtitle') }}</p>
      </div>
      <strong>{{ t('builder.loadout.equippedCount', { count: equippedCount }) }}</strong>
    </header>

    <div class="build-loadout-board__stage">
      <div class="build-loadout-board__equipment build-loadout-board__equipment--left">
        <component
          :is="isEditable ? 'button' : 'article'"
          v-for="card in leftEquipmentCards"
          :key="card.slot"
          :type="isEditable ? 'button' : undefined"
          :data-equipment-slot="card.slot"
          class="build-loadout-slot"
          :class="{ 'is-filled': card.selection, 'is-editable': isEditable }"
          :aria-label="isEditable
            ? `${t('builder.loadout.selectSlot')}: ${card.label}: ${card.name || t('builder.loadout.emptySlot')}`
            : `${card.label}: ${card.name || t('builder.loadout.emptySlot')}`"
          @click="isEditable && emit('open-equipment', card.slot)"
        >
          <span class="build-loadout-slot__icon">
            <img v-if="card.icon && !failedIcons.has(card.iconKey)" :src="card.icon" alt="" loading="lazy" @error="markIconFailed(card.iconKey)">
            <b v-else aria-hidden="true">{{ iconMarker(card.name) }}</b>
          </span>
          <span class="build-loadout-slot__copy">
            <small>{{ card.label }}</small>
            <strong>{{ card.name || t('builder.loadout.emptySlot') }}</strong>
            <span v-if="card.details.length" class="build-loadout-slot__details">
              <span v-for="detail in card.details" :key="detail.key">
                <b>{{ detail.label }}</b> {{ detail.value }}
              </span>
            </span>
          </span>
        </component>
      </div>

      <div class="build-loadout-board__class">
        <small>{{ classStage ? `${t('builder.loadout.classPreview')} · ${classStage}` : t('builder.loadout.classPreview') }}</small>
        <div class="build-loadout-board__portrait">
          <ClassIcon v-if="archetypeIconItem" :item="archetypeIconItem" size="large" />
          <b v-else aria-hidden="true">?</b>
        </div>
        <strong>{{ className || t('builder.loadout.classPreview') }}</strong>
        <div v-if="archetypeLineage.length" class="build-loadout-board__lineage">
          <template v-for="(item, index) in archetypeLineage" :key="item.id">
            <b v-if="index" aria-hidden="true">→</b>
            <span :title="item.stage ? t(`classes.stages.${item.stage}`) : undefined">{{ optionName(item, item.id) }}</span>
          </template>
        </div>
      </div>

      <div class="build-loadout-board__equipment build-loadout-board__equipment--right">
        <component
          :is="isEditable ? 'button' : 'article'"
          v-for="card in rightEquipmentCards"
          :key="card.slot"
          :type="isEditable ? 'button' : undefined"
          :data-equipment-slot="card.slot"
          class="build-loadout-slot"
          :class="{ 'is-filled': card.selection, 'is-editable': isEditable }"
          :aria-label="isEditable
            ? `${t('builder.loadout.selectSlot')}: ${card.label}: ${card.name || t('builder.loadout.emptySlot')}`
            : `${card.label}: ${card.name || t('builder.loadout.emptySlot')}`"
          @click="isEditable && emit('open-equipment', card.slot)"
        >
          <span class="build-loadout-slot__icon">
            <img v-if="card.icon && !failedIcons.has(card.iconKey)" :src="card.icon" alt="" loading="lazy" @error="markIconFailed(card.iconKey)">
            <b v-else aria-hidden="true">{{ iconMarker(card.name) }}</b>
          </span>
          <span class="build-loadout-slot__copy">
            <small>{{ card.label }}</small>
            <strong>{{ card.name || t('builder.loadout.emptySlot') }}</strong>
            <span v-if="card.details.length" class="build-loadout-slot__details">
              <span v-for="detail in card.details" :key="detail.key">
                <b>{{ detail.label }}</b> {{ detail.value }}
              </span>
            </span>
          </span>
        </component>
      </div>
    </div>

    <section v-if="equipmentSetCards.length" class="build-loadout-sets">
      <header>
        <h3>{{ t('builder.loadout.activeSets') }}</h3>
        <strong>{{ equipmentSetCards.length }}</strong>
      </header>
      <div>
        <article v-for="card in equipmentSetCards" :key="card.set.id">
          <header>
            <strong>{{ card.name }}</strong>
            <small>{{ t('builder.loadout.setId') }}: {{ card.set.id }}</small>
          </header>
          <p v-if="card.equipmentIds.length"><b>{{ t('builder.loadout.setPieces') }}</b> {{ card.equipmentIds.join(', ') }}</p>
          <ul v-if="card.effects.length">
            <li v-for="(effect, index) in card.effects" :key="`${card.set.id}:${effect.name}:${index}`">
              <b>{{ t('builder.loadout.setEffect') }}</b> {{ runtimeEffectText(effect) }}
            </li>
          </ul>
        </article>
      </div>
    </section>

    <section v-if="unresolvedEquipmentCards.length" class="build-loadout-unresolved">
      <header>
        <div>
          <h3>{{ t('builder.loadout.unspecifiedEquipment') }}</h3>
          <p>{{ t('builder.loadout.unspecifiedEquipmentHint') }}</p>
        </div>
        <strong>{{ unresolvedEquipmentCards.length }}</strong>
      </header>
      <div class="build-loadout-unresolved__items">
        <article v-for="card in unresolvedEquipmentCards" :key="`${card.selection.id}:${card.index}`">
          <span class="build-loadout-slot__icon">
            <img v-if="card.icon && !failedIcons.has(card.iconKey)" :src="card.icon" alt="" loading="lazy" @error="markIconFailed(card.iconKey)">
            <b v-else aria-hidden="true">{{ iconMarker(card.name) }}</b>
          </span>
          <span class="build-loadout-slot__copy">
            <small>{{ card.sourceSlot || t('builder.loadout.unspecifiedSlot') }}</small>
            <strong>{{ card.name }}</strong>
            <span v-if="card.details.length" class="build-loadout-slot__details">
              <span v-for="detail in card.details" :key="detail.key">
                <b>{{ detail.label }}</b> {{ detail.value }}
              </span>
            </span>
          </span>
          <button
            v-if="isEditable"
            type="button"
            class="build-loadout-unresolved__remove"
            :aria-label="`${t('builder.loadout.removeUnresolved')}: ${card.name}`"
            @click="emit('remove-unresolved-equipment', card.selection, card.index)"
          >×</button>
        </article>
      </div>
    </section>

    <div class="build-loadout-board__lower">
      <section class="build-loadout-panel build-loadout-panel--artifacts">
        <header>
          <h3>{{ t('builder.loadout.artifacts') }}</h3>
          <span>{{ t('builder.loadout.artifactCount', { count: artifactCount }) }}</span>
        </header>
        <div class="build-loadout-panel__slots build-loadout-panel__slots--four">
          <component
            :is="isEditable ? 'button' : 'article'"
            v-for="card in artifactCards"
            :key="card.slot"
            :type="isEditable ? 'button' : undefined"
            class="build-loadout-mini-slot"
            :class="{ 'is-filled': card.selection, 'is-editable': isEditable }"
            :aria-label="isEditable
              ? `${t('builder.loadout.selectSlot')}: ${card.label}: ${card.name || t('builder.loadout.emptySlot')}`
              : `${card.label}: ${card.name || t('builder.loadout.emptySlot')}`"
            @click="isEditable && emit('open-artifact', card.slot)"
          >
            <span>
              <img v-if="card.icon && !failedIcons.has(card.iconKey)" :src="card.icon" alt="" loading="lazy" @error="markIconFailed(card.iconKey)">
              <b v-else aria-hidden="true">{{ iconMarker(card.name) }}</b>
            </span>
            <small>{{ card.label }}</small>
            <strong>{{ card.name || t('builder.loadout.emptySlot') }}</strong>
            <span v-if="card.details.length" class="build-loadout-mini-slot__details">
              <span v-for="detail in card.details" :key="detail.key">
                <b>{{ detail.label }}</b> {{ detail.value }}
              </span>
            </span>
          </component>
        </div>
      </section>

      <section class="build-loadout-panel build-loadout-panel--grimoires">
        <header>
          <h3>{{ t('builder.loadout.grimoires') }}</h3>
          <span>{{ t('builder.loadout.grimoireCount', { count: grimoireCount }) }}</span>
        </header>
        <div class="build-loadout-panel__slots build-loadout-panel__slots--three">
          <component
            :is="isEditable ? 'button' : 'article'"
            v-for="card in grimoireCards"
            :key="card.index"
            :type="isEditable ? 'button' : undefined"
            class="build-loadout-mini-slot"
            :class="{ 'is-filled': card.selection, 'is-editable': isEditable }"
            :aria-label="isEditable
              ? `${t('builder.loadout.selectSlot')}: ${t('builder.loadout.grimoires')} ${card.index + 1}: ${card.name || t('builder.loadout.emptySlot')}`
              : `${t('builder.loadout.grimoires')} ${card.index + 1}: ${card.name || t('builder.loadout.emptySlot')}`"
            @click="isEditable && emit('open-grimoire', card.index)"
          >
            <span>
              <img v-if="card.icon && !failedIcons.has(card.iconKey)" :src="card.icon" alt="" loading="lazy" @error="markIconFailed(card.iconKey)">
              <b v-else aria-hidden="true">{{ iconMarker(card.name) }}</b>
            </span>
            <small>{{ t('builder.loadout.grimoires') }} {{ card.index + 1 }}</small>
            <strong>{{ card.name || t('builder.loadout.emptySlot') }}</strong>
            <span v-if="card.details.length" class="build-loadout-mini-slot__details">
              <span v-for="detail in card.details" :key="detail.key">
                <b>{{ detail.label }}</b> {{ detail.value }}
              </span>
            </span>
          </component>
        </div>
      </section>

      <section class="build-loadout-panel build-loadout-panel--character">
        <header>
          <h3>{{ t('builder.loadout.character') }}</h3>
          <button v-if="isEditable" type="button" class="build-loadout-panel__action" @click="emit('open-character')">
            {{ t('builder.loadout.configure') }}
          </button>
        </header>
        <div class="build-loadout-character__facts">
          <div v-if="character?.name"><span>{{ t('builder.loadout.characterName') }}</span><strong>{{ character.name }}</strong></div>
          <div><span>{{ t('builder.loadout.level') }}</span><strong>{{ character?.level ?? '—' }}</strong></div>
          <div><span>{{ t('builder.loadout.jobLevel') }}</span><strong>{{ character?.jobLevel ?? '—' }}</strong></div>
          <div><span>{{ t('builder.loadout.stance') }}</span><strong>{{ stanceLabel() }}</strong></div>
        </div>
        <div v-if="coreStats.length" class="build-loadout-character__stats">
          <div v-for="(stat, index) in coreStats" :key="`${stat.type}:${stat.subjectId || ''}:${index}`">
            <span>{{ statText(stat.type) }}</span>
            <strong>
              <span>{{ formatStatValue(stat.value, stat.unit) }}</span>
              <small v-if="stat.bonus">{{ formatBonus(stat.bonus, stat.unit) }}</small>
            </strong>
          </div>
        </div>
        <p v-else class="build-loadout-panel__empty">{{ t('builder.loadout.noStats') }}</p>
      </section>

      <section class="build-loadout-panel build-loadout-panel--skills">
        <header>
          <h3>{{ t('builder.loadout.skills') }}</h3>
          <button v-if="isEditable" type="button" class="build-loadout-panel__action" @click="emit('open-skills')">
            {{ t('builder.loadout.configure') }}
          </button>
        </header>
        <div class="build-loadout-skills__groups">
          <section v-for="group in skillGroups" :key="group.stage">
            <header>
              <span>{{ group.label }}</span>
              <strong>{{ group.cards.length }}</strong>
            </header>
            <div v-if="group.cards.length" class="build-loadout-skills__list">
              <article v-for="card in group.cards" :key="`${group.stage}:${card.skill.treeArchetype}:${card.skill.id}`">
                <span class="build-loadout-skills__icon">
                  <img v-if="card.icon && !failedIcons.has(card.iconKey)" :src="card.icon" alt="" loading="lazy" @error="markIconFailed(card.iconKey)">
                  <b v-else aria-hidden="true">{{ iconMarker(card.name) }}</b>
                </span>
                <span>
                  <strong>{{ card.name }}</strong>
                  <small v-if="card.skill.maxLevel === 0">{{ t('builder.loadout.confirmedNoLevel') }}</small>
                  <small v-else>{{ card.skill.level }} / {{ card.skill.maxLevel }}</small>
                </span>
              </article>
            </div>
            <p v-else class="build-loadout-panel__empty">{{ t('builder.loadout.noSkills') }}</p>
          </section>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.build-loadout-board {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(154, 208, 203, .16);
  border-radius: 28px;
  color: #f5fbfa;
  background:
    radial-gradient(circle at 50% 14%, rgba(48, 154, 145, .15), transparent 27%),
    linear-gradient(145deg, #111a2a 0%, #182237 55%, #101827 100%);
  box-shadow: 0 30px 70px rgba(9, 26, 35, .22);
}

.build-loadout-board__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 25px 28px 20px;
  border-bottom: 1px solid rgba(202, 235, 231, .1);
}

.build-loadout-board__header div { min-width: 0; }
.build-loadout-board__header div > span { display: block; color: #62d4c3; font-size: 13px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.build-loadout-board__header p { max-width: 720px; margin: 7px 0 0; color: #aebdc7; line-height: 1.65; }
.build-loadout-board__header > strong { flex: 0 0 auto; padding: 8px 12px; border: 1px solid rgba(98, 212, 195, .2); border-radius: 999px; color: #bcece5; background: rgba(32, 112, 105, .18); font-size: 12px; }

.build-loadout-board__stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, .82fr) minmax(0, 1fr);
  align-items: center;
  gap: clamp(14px, 2.4vw, 34px);
  padding: clamp(22px, 4vw, 48px) clamp(18px, 3vw, 38px);
}

.build-loadout-board__equipment { display: grid; min-width: 0; gap: 11px; }
.build-loadout-slot {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  min-height: 72px;
  padding: 7px 10px;
  border: 1px solid rgba(177, 205, 211, .13);
  border-radius: 17px;
  color: inherit;
  background: rgba(7, 14, 27, .44);
  font: inherit;
  text-align: left;
  cursor: default;
  transition: border-color .16s ease, background .16s ease, transform .16s ease;
}

.build-loadout-board__equipment--left .build-loadout-slot { grid-template-columns: minmax(0, 1fr) 58px; text-align: right; }
.build-loadout-board__equipment--left .build-loadout-slot__icon { grid-column: 2; grid-row: 1; }
.build-loadout-board__equipment--left .build-loadout-slot__copy { grid-column: 1; grid-row: 1; }
.build-loadout-slot.is-editable { cursor: pointer; }
.build-loadout-slot.is-editable:hover { transform: translateY(-1px); border-color: rgba(98, 212, 195, .42); background: rgba(18, 42, 54, .78); }
.build-loadout-slot:focus-visible, .build-loadout-mini-slot:focus-visible { outline: 3px solid rgba(100, 226, 207, .78); outline-offset: 2px; }
.build-loadout-slot.is-filled { border-color: rgba(113, 196, 188, .24); background: rgba(22, 49, 61, .7); }

.build-loadout-slot__icon, .build-loadout-mini-slot > span:first-child {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border: 1px solid rgba(213, 237, 234, .12);
  border-radius: 14px;
  color: #70ddcd;
  background: linear-gradient(145deg, rgba(42, 60, 79, .96), rgba(16, 25, 42, .96));
}

.build-loadout-slot__icon img, .build-loadout-mini-slot img { width: 100%; height: 100%; padding: 7%; object-fit: contain; filter: brightness(1.08) contrast(1.06) drop-shadow(0 3px 6px rgba(0, 0, 0, .45)); }
.build-loadout-slot__icon b, .build-loadout-mini-slot > span:first-child b { font: 800 15px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.build-loadout-slot__copy { display: block; min-width: 0; padding: 0 9px; }
.build-loadout-slot__copy small { display: block; margin-bottom: 4px; overflow: hidden; color: #7f999f; font-size: 11px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-slot__copy strong { display: block; overflow: hidden; color: #eaf4f2; font-size: 13px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-slot:not(.is-filled) .build-loadout-slot__copy strong { color: #71868f; font-weight: 600; }
.build-loadout-slot__details, .build-loadout-mini-slot__details { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.build-loadout-slot__details > span, .build-loadout-mini-slot__details > span { max-width: 100%; padding: 3px 6px; overflow-wrap: anywhere; border-radius: 7px; color: #b8ccc9; background: rgba(99, 145, 145, .12); font-size: 9px; line-height: 1.35; }
.build-loadout-slot__details b, .build-loadout-mini-slot__details b { color: #69d3c3; font-weight: 750; }

.build-loadout-board__class { display: grid; min-width: 0; place-items: center; text-align: center; }
.build-loadout-board__class > small { color: #74bdb5; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.build-loadout-board__portrait {
  display: grid;
  width: clamp(132px, 15vw, 178px);
  aspect-ratio: 1;
  margin: 14px 0;
  place-items: center;
  border: 1px solid rgba(119, 215, 201, .25);
  border-radius: 40%;
  background: radial-gradient(circle at 50% 34%, rgba(100, 216, 199, .2), rgba(7, 21, 35, .72) 70%);
  box-shadow: inset 0 0 38px rgba(82, 198, 183, .08), 0 25px 48px rgba(4, 13, 24, .36);
}

.build-loadout-board__portrait :deep(.class-data-icon--large) { width: 74%; height: 74%; border-radius: 29%; }
.build-loadout-board__portrait > b { color: #78cfc3; font-size: 58px; }
.build-loadout-board__class > strong { display: block; max-width: 100%; overflow: hidden; color: #fff; font-size: clamp(20px, 2.4vw, 29px); text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-board__lineage { display: flex; align-items: center; justify-content: center; max-width: 100%; gap: 7px; margin-top: 8px; color: #91aaaF; font-size: 12px; }
.build-loadout-board__lineage span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-board__lineage b { color: #52cdbd; }

.build-loadout-board__lower {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 0 clamp(18px, 3vw, 38px) clamp(20px, 3vw, 36px);
}

.build-loadout-sets { margin: 0 clamp(18px, 3vw, 38px) 14px; padding: 16px 18px; border: 1px solid rgba(98, 212, 195, .16); border-radius: 18px; background: rgba(18, 55, 58, .24); }
.build-loadout-sets > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.build-loadout-sets h3 { margin: 0; color: #bcece5; font-size: 14px; }
.build-loadout-sets > header > strong { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; color: #8ce2d4; background: rgba(53, 146, 136, .18); font-size: 12px; }
.build-loadout-sets > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 12px; }
.build-loadout-sets article { min-width: 0; padding: 12px; border: 1px solid rgba(128, 205, 195, .12); border-radius: 14px; background: rgba(7, 17, 30, .42); }
.build-loadout-sets article > header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; }
.build-loadout-sets article > header strong { color: #e9f6f3; font-size: 13px; }
.build-loadout-sets article > header small { color: #72aaa3; font-size: 9px; }
.build-loadout-sets p, .build-loadout-sets ul { margin: 8px 0 0; padding: 0; color: #b5c8c5; font-size: 10px; line-height: 1.55; overflow-wrap: anywhere; }
.build-loadout-sets ul { display: grid; gap: 5px; list-style: none; }
.build-loadout-sets p b, .build-loadout-sets li b { color: #68d6c6; }

.build-loadout-unresolved { margin: 0 clamp(18px, 3vw, 38px) 14px; padding: 16px 18px; border: 1px solid rgba(239, 194, 112, .18); border-radius: 18px; background: rgba(68, 48, 25, .2); }
.build-loadout-unresolved > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.build-loadout-unresolved h3 { margin: 0; color: #f1d49d; font-size: 14px; }
.build-loadout-unresolved p { margin: 5px 0 0; color: #a99d8a; font-size: 11px; line-height: 1.5; }
.build-loadout-unresolved > header > strong { display: grid; flex: 0 0 auto; width: 28px; height: 28px; place-items: center; border-radius: 9px; color: #f0c879; background: rgba(193, 136, 49, .16); font-size: 12px; }
.build-loadout-unresolved__items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 12px; }
.build-loadout-unresolved__items > article { position: relative; display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: center; min-width: 0; min-height: 72px; padding: 7px 42px 7px 10px; border: 1px solid rgba(233, 198, 132, .12); border-radius: 15px; background: rgba(16, 20, 29, .45); }
.build-loadout-unresolved__remove { position: absolute; top: 8px; right: 8px; display: grid; width: 28px; height: 28px; padding: 0; place-items: center; border: 1px solid rgba(238, 170, 117, .24); border-radius: 9px; color: #efbc91; background: rgba(127, 61, 37, .3); font: inherit; font-size: 16px; cursor: pointer; }
.build-loadout-unresolved__remove:hover { border-color: rgba(245, 180, 128, .5); background: rgba(143, 65, 38, .5); }
.build-loadout-unresolved__remove:focus-visible { outline: 3px solid rgba(245, 188, 137, .7); outline-offset: 2px; }

.build-loadout-panel { min-width: 0; padding: 18px; border: 1px solid rgba(177, 205, 211, .11); border-radius: 20px; background: rgba(6, 14, 27, .35); }
.build-loadout-panel > header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.build-loadout-panel h3 { margin: 0; color: #eef8f6; font-size: 15px; }
.build-loadout-panel > header span { color: #8099a0; font-size: 11px; }
.build-loadout-panel__action { flex: 0 0 auto; padding: 5px 9px; border: 1px solid rgba(98, 212, 195, .2); border-radius: 999px; color: #9de1d7; background: rgba(42, 119, 111, .14); font: inherit; font-size: 10px; font-weight: 700; line-height: 1.2; cursor: pointer; }
.build-loadout-panel__action:hover { border-color: rgba(98, 212, 195, .44); background: rgba(42, 119, 111, .28); }
.build-loadout-panel__action:focus-visible { outline: 3px solid rgba(100, 226, 207, .78); outline-offset: 2px; }
.build-loadout-panel__slots { display: grid; min-width: 0; gap: 9px; }
.build-loadout-panel__slots--four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.build-loadout-panel__slots--three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.build-loadout-mini-slot {
  display: grid;
  min-width: 0;
  place-items: center;
  padding: 10px 7px;
  border: 1px dashed rgba(172, 205, 209, .2);
  border-radius: 15px;
  color: inherit;
  background: rgba(17, 28, 45, .55);
  font: inherit;
  cursor: default;
  transition: border-color .16s ease, background .16s ease, transform .16s ease;
}

.build-loadout-mini-slot.is-editable { cursor: pointer; }
.build-loadout-mini-slot.is-editable:hover { transform: translateY(-1px); border-color: rgba(98, 212, 195, .4); background: rgba(24, 47, 58, .72); }
.build-loadout-mini-slot.is-filled { border-style: solid; border-color: rgba(104, 202, 188, .25); }
.build-loadout-mini-slot > span:first-child { width: 48px; height: 48px; margin-bottom: 8px; border-radius: 13px; }
.build-loadout-mini-slot small, .build-loadout-mini-slot strong { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-mini-slot small { color: #79aaa5; font-size: 10px; }
.build-loadout-mini-slot strong { margin-top: 3px; color: #e5f1ef; font-size: 11px; }
.build-loadout-mini-slot:not(.is-filled) strong { color: #6f858e; font-weight: 600; }
.build-loadout-mini-slot__details { justify-content: center; width: 100%; }
.build-loadout-panel--artifacts .build-loadout-panel__slots--four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.build-loadout-panel--grimoires .build-loadout-panel__slots--three { grid-template-columns: 1fr; }
.build-loadout-panel--grimoires .build-loadout-mini-slot { grid-template-columns: 48px minmax(0, 1fr); place-items: center start; column-gap: 10px; text-align: left; }
.build-loadout-panel--grimoires .build-loadout-mini-slot > span:first-child { grid-column: 1; grid-row: 1 / span 2; margin: 0; }
.build-loadout-panel--grimoires .build-loadout-mini-slot > small,
.build-loadout-panel--grimoires .build-loadout-mini-slot > strong { grid-column: 2; }
.build-loadout-panel--grimoires .build-loadout-mini-slot__details { grid-column: 1 / -1; justify-content: flex-start; margin-top: 9px; }

.build-loadout-character__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.build-loadout-character__facts > div, .build-loadout-character__stats > div { min-width: 0; padding: 10px; border-radius: 13px; background: rgba(26, 42, 59, .66); }
.build-loadout-character__facts > div > span, .build-loadout-character__stats > div > span { display: block; overflow: hidden; color: #839ba2; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-character__facts > div > strong, .build-loadout-character__stats > div > strong { display: block; margin-top: 5px; overflow: hidden; color: #f0f8f7; font-size: 16px; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-character__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 8px; }
.build-loadout-character__stats > div > strong { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; overflow: visible; color: #77dfcf; white-space: normal; }
.build-loadout-character__stats > div > strong > span { color: #f0f8f7; }
.build-loadout-character__stats > div > strong > small { color: #77dfcf; font-size: 11px; }
.build-loadout-skills__groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.build-loadout-skills__groups > section { min-width: 0; padding: 10px; border-radius: 14px; background: rgba(20, 35, 53, .68); }
.build-loadout-skills__groups > section > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.build-loadout-skills__groups > section > header span { min-width: 0; overflow: hidden; color: #8fa5ab; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-skills__groups > section > header strong { display: grid; flex: 0 0 auto; width: 25px; height: 25px; place-items: center; border-radius: 8px; color: #7ce2d3; background: rgba(53, 146, 136, .18); font-size: 12px; }
.build-loadout-skills__list { display: grid; gap: 6px; margin-top: 9px; }
.build-loadout-skills__list article { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; min-width: 0; gap: 8px; padding: 5px; border-radius: 10px; background: rgba(7, 17, 30, .48); }
.build-loadout-skills__icon { display: grid; width: 34px; height: 34px; overflow: hidden; place-items: center; border: 1px solid rgba(166, 210, 207, .14); border-radius: 9px; color: #71dccc; background: #142237; }
.build-loadout-skills__icon img { width: 100%; height: 100%; padding: 4%; object-fit: contain; filter: brightness(1.08) contrast(1.05); }
.build-loadout-skills__icon b { font: 800 10px/1 ui-monospace, SFMono-Regular, Consolas, monospace; }
.build-loadout-skills__list article > span:last-child { display: block; min-width: 0; }
.build-loadout-skills__list article strong, .build-loadout-skills__list article small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-loadout-skills__list article strong { color: #e9f4f2; font-size: 11px; }
.build-loadout-skills__list article small { margin-top: 3px; color: #72cdbf; font-size: 10px; }
.build-loadout-panel__empty { margin: 11px 0 0; color: #728991; font-size: 12px; }

@media (max-width: 900px) {
  .build-loadout-board__stage { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
  .build-loadout-board__class { grid-column: 1 / -1; grid-row: 1; }
  .build-loadout-board__equipment--left, .build-loadout-board__equipment--right { grid-row: 2; }
  .build-loadout-board__portrait { width: 144px; }
  .build-loadout-board__lower { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .build-loadout-board { border-radius: 20px; }
  .build-loadout-board__header { display: grid; gap: 12px; padding: 20px 17px 17px; }
  .build-loadout-board__header > strong { justify-self: start; }
  .build-loadout-board__stage { grid-template-columns: 1fr; padding: 22px 14px; }
  .build-loadout-board__class { grid-column: 1; }
  .build-loadout-board__equipment--left, .build-loadout-board__equipment--right { grid-row: auto; }
  .build-loadout-board__equipment--left .build-loadout-slot { grid-template-columns: 58px minmax(0, 1fr); text-align: left; }
  .build-loadout-board__equipment--left .build-loadout-slot__icon { grid-column: 1; }
  .build-loadout-board__equipment--left .build-loadout-slot__copy { grid-column: 2; }
  .build-loadout-board__lower { padding: 0 14px 18px; }
  .build-loadout-unresolved { margin: 0 14px 14px; padding: 14px; }
  .build-loadout-sets { margin: 0 14px 14px; padding: 14px; }
  .build-loadout-sets > div { grid-template-columns: 1fr; }
  .build-loadout-unresolved__items { grid-template-columns: 1fr; }
  .build-loadout-panel { padding: 14px; }
  .build-loadout-panel__slots--four, .build-loadout-panel__slots--three { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .build-loadout-character__facts, .build-loadout-character__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .build-loadout-skills__groups { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .build-loadout-slot, .build-loadout-mini-slot { transition: none; }
}
</style>
