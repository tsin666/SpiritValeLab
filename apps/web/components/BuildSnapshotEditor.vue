<script setup lang="ts">
import type {
  BuildArtifact,
  BuildArtifactSlot,
  BuildCharacterSnapshot,
  BuildEquipment,
  BuildEquipmentCard,
  BuildEquipmentSlot,
  BuildGrimoire,
  BuildGrimoirePassive,
  BuilderOption,
  BuilderOptions,
  BuildSkillAllocation,
  RuntimeEffect
} from '~/composables/useApi'
import { localizedText } from '~/composables/useApi'
import type {
  BuildCatalogOcrParseResult,
  BuildCatalogOcrParsedLine
} from '~/types/ocr'
import { equipmentOcrMatchLines, parseEquipmentOcrText } from '~/utils/ocr-equipment'
import { artifactOcrMatchLines, parseArtifactOcrText } from '~/utils/ocr-artifact'
import { grimoireOcrMatchLines, parseGrimoireOcrText } from '~/utils/ocr-grimoire'

const props = defineProps<{
  options: BuilderOptions
  archetype?: BuilderOption
  equipmentSelections: BuildEquipment[]
  artifactSelections: BuildArtifact[]
  grimoireSelections: BuildGrimoire[]
  character?: BuildCharacterSnapshot
  skillTree: BuildSkillAllocation[]
}>()

const emit = defineEmits<{
  'update:equipmentSelections': [value: BuildEquipment[]]
  'update:artifactSelections': [value: BuildArtifact[]]
  'update:grimoireSelections': [value: BuildGrimoire[]]
  'update:character': [value: BuildCharacterSnapshot | undefined]
  'update:skillTree': [value: BuildSkillAllocation[]]
}>()

const { t, locale } = useI18n()
const { gameText, categoryText, slotText, typeText } = useGameLocale()
const equipmentSlot = ref<BuildEquipmentSlot>()
const artifactSlot = ref<BuildArtifactSlot>()
const grimoireIndex = ref<number>()
const pickerSearch = ref('')
const pickerBrowsing = ref(true)
const skillSearch = ref('')
const skillKind = ref<'active' | 'passive'>('active')
const showFullTreeCatalog = ref(false)
const skillTreeArchetype = ref('')
const pickerSection = ref<HTMLElement>()
const characterSection = ref<HTMLElement>()
const skillSection = ref<HTMLElement>()

const archetypeCatalog = computed(() => new Map(props.options.archetypes.map(item => [canonical(item.id), item])))
const selectedLineage = computed(() => {
  const lineage: BuilderOption[] = []
  const seen = new Set<string>()
  let current = props.archetype
  while (current && !seen.has(canonical(current.id))) {
    lineage.push(current)
    seen.add(canonical(current.id))
    current = current.requiredClassId ? archetypeCatalog.value.get(canonical(current.requiredClassId)) : undefined
  }
  return lineage
})
const treeTargets = computed(() => [...selectedLineage.value].reverse())
const activeEquipment = computed(() => equipmentSlot.value
  ? props.equipmentSelections.find(item => item.slotKey === equipmentSlot.value)
  : undefined)
const activeArtifact = computed(() => artifactSlot.value
  ? props.artifactSelections.find(item => item.slot === artifactSlot.value)
  : undefined)
const activeGrimoire = computed(() => Number.isInteger(grimoireIndex.value)
  ? props.grimoireSelections.find(item => item.slotIndex === grimoireIndex.value)
  : undefined)
const activeArtifactOption = computed(() => props.options.artifacts.find(item => item.id === activeArtifact.value?.id))
const activeEquipmentOption = computed(() => props.options.equipment.find(item => item.id === activeEquipment.value?.id))
const activeGrimoireOption = computed(() => props.options.grimoires.find(item => item.id === activeGrimoire.value?.id))
const characterEnabled = computed(() => props.character !== undefined)
const characterJobLevelMax = computed(() => {
  const value = Number(props.archetype?.maxJobLevel)
  return Number.isFinite(value) && value >= 0 ? Math.min(1000, Math.trunc(value)) : 1000
})
const legacyEquipmentEntries = computed(() => props.equipmentSelections
  .map((selection, index) => ({ selection, index }))
  .filter(({ selection }) => !selection.slotKey))
const weaponEquipmentTypes = new Set([
  'sword', 'dagger', 'wand', 'spear', 'axe', 'mace', 'book', 'pistol', 'bow',
  'scythe', 'instrument', 'twinblade', 'mace2h', 'sword2h', 'axe2h', 'spear2h',
  'wand2h', 'rifle', 'shotgun', 'launcher', 'gatlinggun', 'katar'
])
const activeEquipmentClass = computed(() => {
  const type = canonical(activeEquipmentOption.value?.type)
  if (weaponEquipmentTypes.has(type)) return 'weapon'
  return ['shield', 'head', 'legs', 'feet', 'chest', 'accessory', 'eyewear', 'back'].includes(type) ? type : ''
})
const compatibleCards = computed(() => props.options.cards.filter(item => activeEquipmentClass.value
  && canonical(item.equipClass) === activeEquipmentClass.value))

watch(() => props.archetype?.id, () => {
  const targets = treeTargets.value
  skillTreeArchetype.value = targets.at(-1)?.id || ''
}, { immediate: true })


function canonical(value?: string | null) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLocaleLowerCase('en-US')
}

function optionName(item?: BuilderOption | null) {
  return gameText(item?.name, item?.displayName || item?.id || t('builder.unnamedEntry'))
}

function optionSearchText(item: BuilderOption) {
  return [
    item.id,
    item.slug,
    localizedText(item.name, 'zh'),
    localizedText(item.name, 'en'),
    item.category,
    item.slot,
    item.type
  ].filter(Boolean).join(' ').toLocaleLowerCase('en-US')
}

function matchesSearch(item: BuilderOption, value = pickerSearch.value) {
  const term = value.trim().toLocaleLowerCase('en-US')
  return !term || optionSearchText(item).includes(term)
}

function optionNames(item: BuilderOption) {
  const nameZh = localizedText(item.name, 'zh') || item.displayName || item.id
  const nameEn = localizedText(item.name, 'en') || item.displayName || item.id
  return {
    name: locale.value === 'en' ? nameEn : nameZh,
    nameZh,
    nameEn
  }
}

function allowedArchetypeTokens(item: BuilderOption) {
  return (item.allowedArchetypes || []).map(value => canonical(typeof value === 'string' ? value : (value.value || value.label)))
}

function matchesSelectedArchetype(item: BuilderOption) {
  const allowed = allowedArchetypeTokens(item)
  if (!props.archetype || !allowed.length) return true
  const lineageTokens = new Set(selectedLineage.value.flatMap(value => [
    canonical(value.id),
    canonical(value.slug),
    canonical(value.displayName),
    canonical(localizedText(value.name, 'zh')),
    canonical(localizedText(value.name, 'en'))
  ]))
  return allowed.some(value => lineageTokens.has(value))
}

function isGrimoire(item: BuilderOption) {
  return canonical(item.type) === 'grimoire'
}

function matchesEquipmentSlot(item: BuilderOption, target: BuildEquipmentSlot) {
  const source = canonical(item.slot)
  if (target === 'accessory-left' || target === 'accessory-right') return source === 'accessory'
  if (target === 'off-hand') return source === 'offhand' || source === 'mainhand'
  return source === canonical(target)
}

function equipmentOption(id: string) {
  return props.options.equipment.find(item => item.id === id)
}

function legacyEquipmentName(selection: BuildEquipment) {
  const item = equipmentOption(selection.id)
  if (item) return optionName(item)
  return locale.value === 'en'
    ? (selection.nameEn || selection.name || selection.nameZh || selection.id)
    : (selection.nameZh || selection.name || selection.nameEn || selection.id)
}

function migrationSlots(selection: BuildEquipment, selectionIndex: number) {
  const item = equipmentOption(selection.id)
  if (!item || isGrimoire(item) || !matchesSelectedArchetype(item)) return []
  const occupied = new Set(props.equipmentSelections
    .filter((_, index) => index !== selectionIndex)
    .map(candidate => candidate.slotKey)
    .filter(Boolean))
  return props.options.equipmentSlots
    .map(slot => slot.value)
    .filter(slot => !occupied.has(slot) && matchesEquipmentSlot(item, slot))
}

function migrateLegacyEquipment(index: number, event: Event) {
  const slotKey = (event.target as HTMLSelectElement).value as BuildEquipmentSlot
  const current = props.equipmentSelections[index]
  if (!current || !slotKey || !migrationSlots(current, index).includes(slotKey)) return
  emit('update:equipmentSelections', props.equipmentSelections.map((item, itemIndex) => itemIndex === index
    ? { ...item, slotKey }
    : item))
}

function removeLegacyEquipment(index: number) {
  emit('update:equipmentSelections', props.equipmentSelections.filter((_, itemIndex) => itemIndex !== index))
}

function removeUnresolvedEquipment(selection: BuildEquipment) {
  const index = props.equipmentSelections.findIndex(item => item === selection)
  if (index < 0) return
  removeLegacyEquipment(index)
}

const equipmentChoiceTotal = computed(() => {
  if (!equipmentSlot.value) return 0
  return props.options.equipment.filter(item => !isGrimoire(item)
    && matchesSelectedArchetype(item)
    && matchesEquipmentSlot(item, equipmentSlot.value! )
    && matchesSearch(item)).length
})
const equipmentChoices = computed(() => {
  if (!equipmentSlot.value) return []
  return props.options.equipment.filter(item => !isGrimoire(item)
    && matchesSelectedArchetype(item)
    && matchesEquipmentSlot(item, equipmentSlot.value! )
    && matchesSearch(item)).slice(0, 120)
})
const artifactChoiceTotal = computed(() => props.options.artifacts.filter(item => matchesSearch(item)).length)
const artifactChoices = computed(() => props.options.artifacts.filter(item => matchesSearch(item)).slice(0, 100))
const grimoireChoiceTotal = computed(() => props.options.grimoires.filter(item => matchesSelectedArchetype(item) && matchesSearch(item)).length)
const grimoireChoices = computed(() => props.options.grimoires.filter(item => matchesSelectedArchetype(item) && matchesSearch(item)).slice(0, 100))
const equipmentOcrOptions = computed(() => equipmentSlot.value
  ? props.options.equipment.filter(item => !isGrimoire(item)
    && matchesSelectedArchetype(item)
    && matchesEquipmentSlot(item, equipmentSlot.value!))
  : [])
const artifactOcrOptions = computed(() => props.options.artifacts)
const grimoireOcrOptions = computed(() => props.options.grimoires.filter(item => matchesSelectedArchetype(item) && !grimoireSelectedElsewhere(item)))
const equipmentOcrKindLabels = computed(() => ({
  singular: t('builder.loadout.editor.ocr.kinds.equipment'),
  plural: t('builder.loadout.editor.ocr.kinds.equipmentPlural'),
  screenshot: t('builder.loadout.editor.ocr.kindScreenshots.equipment')
}))
const artifactOcrKindLabels = computed(() => ({
  singular: t('builder.loadout.editor.ocr.kinds.artifact'),
  plural: t('builder.loadout.editor.ocr.kinds.artifactPlural'),
  screenshot: t('builder.loadout.editor.ocr.kindScreenshots.artifact')
}))
const grimoireOcrKindLabels = computed(() => ({
  singular: t('builder.loadout.editor.ocr.kinds.grimoire'),
  plural: t('builder.loadout.editor.ocr.kinds.grimoirePlural'),
  screenshot: t('builder.loadout.editor.ocr.kindScreenshots.grimoire')
}))

function parseEquipmentCatalogOcr(text: string): BuildCatalogOcrParseResult {
  const parsed = parseEquipmentOcrText(text)
  return {
    lines: equipmentOcrMatchLines(parsed).map(line => ({
      id: line.id,
      text: line.text,
      refineLevel: parsed.refineLevel,
      potential: parsed.potential
    }))
  }
}

function parseGrimoireCatalogOcr(text: string): BuildCatalogOcrParseResult {
  const parsed = parseGrimoireOcrText(text)
  const ignoredLabels = [
    props.character?.name,
    ...selectedLineage.value.flatMap(item => [
      item.id,
      item.slug,
      item.displayName,
      localizedText(item.name, 'zh'),
      localizedText(item.name, 'en')
    ])
  ]
  return {
    lines: grimoireOcrMatchLines(parsed, ignoredLabels).map(line => ({ id: line.id, text: line.text }))
  }
}

const artifactOcrPartIndex: Record<BuildArtifactSlot, 0 | 1 | 2 | 3> = {
  Rune: 0,
  Jewel: 1,
  Scroll: 2,
  Relic: 3
}

function parseArtifactCatalogOcr(text: string): BuildCatalogOcrParseResult {
  if (!artifactSlot.value) return { lines: [] }
  const part = parseArtifactOcrText(text).parts.find(item => item.slot === artifactSlot.value)
  if (!part) return { lines: [] }
  const line = artifactOcrMatchLines({ parts: [part] })[0]
  return {
    lines: line ? [{
      id: line.id,
      text: line.text,
      refineLevel: part.refineLevel,
      partIndex: artifactOcrPartIndex[part.slot],
      sourceSlot: t(`builder.loadout.artifactSlots.${part.slot}`),
      suffixText: part.suffixText
    }] : []
  }
}

function showManualCatalogPicker() {
  pickerBrowsing.value = true
  void nextTick(() => pickerSection.value?.querySelector<HTMLInputElement>('.build-snapshot-picker__search input')?.focus())
}

function applyEquipmentCatalogOcr(option: BuilderOption, source: BuildCatalogOcrParsedLine) {
  if (!equipmentOcrOptions.value.some(item => item.id === option.id)) return
  chooseEquipment(option, source)
}

function applyArtifactCatalogOcr(option: BuilderOption, source: BuildCatalogOcrParsedLine) {
  if (!artifactOcrOptions.value.some(item => item.id === option.id)) return
  chooseArtifact(option, source)
}

function applyGrimoireCatalogOcr(option: BuilderOption) {
  if (!grimoireOcrOptions.value.some(item => item.id === option.id)) return
  chooseGrimoire(option)
}

function openEquipment(slot: BuildEquipmentSlot) {
  equipmentSlot.value = slot
  artifactSlot.value = undefined
  grimoireIndex.value = undefined
  pickerSearch.value = ''
  pickerBrowsing.value = !props.equipmentSelections.some(item => item.slotKey === slot)
  void revealPicker()
}

function openArtifact(slot: BuildArtifactSlot) {
  artifactSlot.value = slot
  equipmentSlot.value = undefined
  grimoireIndex.value = undefined
  pickerSearch.value = ''
  pickerBrowsing.value = !props.artifactSelections.some(item => item.slot === slot)
  void revealPicker()
}

function openGrimoire(index: number) {
  grimoireIndex.value = index
  equipmentSlot.value = undefined
  artifactSlot.value = undefined
  pickerSearch.value = ''
  pickerBrowsing.value = !props.grimoireSelections.some(item => item.slotIndex === index)
  void revealPicker()
}

async function revealPicker() {
  await nextTick()
  pickerSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  pickerSection.value?.querySelector<HTMLElement>('.build-snapshot-picker__search input, .build-snapshot-config input, .build-snapshot-config select')
    ?.focus({ preventScroll: true })
}

function closePicker() {
  equipmentSlot.value = undefined
  artifactSlot.value = undefined
  grimoireIndex.value = undefined
  pickerSearch.value = ''
  pickerBrowsing.value = true
}

function chooseEquipment(item: BuilderOption, recognized?: BuildCatalogOcrParsedLine) {
  if (!equipmentSlot.value) return
  const previous = activeEquipment.value?.id === item.id ? activeEquipment.value : undefined
  const next: BuildEquipment = {
    id: item.id,
    slug: item.slug,
    ...optionNames(item),
    slot: item.slot || equipmentSlot.value,
    slotKey: equipmentSlot.value,
    icon: item.icon || undefined,
    refineLevel: recognized?.refineLevel ?? previous?.refineLevel,
    potential: recognized?.potential ?? previous?.potential,
    actualAffixes: previous?.actualAffixes || [],
    cards: previous?.cards || []
  }
  emit('update:equipmentSelections', [
    ...props.equipmentSelections.filter(selection => selection.slotKey !== equipmentSlot.value),
    next
  ])
  pickerBrowsing.value = false
}

function patchEquipment(patch: Partial<BuildEquipment>) {
  if (!equipmentSlot.value || !activeEquipment.value) return
  emit('update:equipmentSelections', props.equipmentSelections.map(item => item.slotKey === equipmentSlot.value ? { ...item, ...patch } : item))
}

function equipmentCardAt(slotIndex: number) {
  return activeEquipment.value?.cards?.find(card => card.slotIndex === slotIndex)
}

function equipmentCardName(card: BuildEquipmentCard) {
  const option = props.options.cards.find(item => item.id === card.id)
  if (option) return optionName(option)
  return locale.value === 'en'
    ? (card.nameEn || card.name || card.nameZh || card.id)
    : (card.nameZh || card.name || card.nameEn || card.id)
}

function setEquipmentCard(slotIndex: number, event: Event) {
  if (!activeEquipment.value) return
  const id = (event.target as HTMLSelectElement).value
  const without = (activeEquipment.value.cards || []).filter(card => card.slotIndex !== slotIndex)
  if (!id) {
    patchEquipment({ cards: without })
    return
  }
  const item = compatibleCards.value.find(card => card.id === id)
  if (!item) return
  const next: BuildEquipmentCard = {
    slotIndex,
    id: item.id,
    slug: item.slug,
    ...optionNames(item),
    icon: item.icon || undefined,
    equipClass: item.equipClass || activeEquipmentClass.value
  }
  patchEquipment({ cards: [...without, next].sort((left, right) => left.slotIndex - right.slotIndex) })
}

function removeEquipment() {
  if (!equipmentSlot.value) return
  emit('update:equipmentSelections', props.equipmentSelections.filter(item => item.slotKey !== equipmentSlot.value))
  pickerBrowsing.value = true
}

function defaultPartIndex(item: BuilderOption) {
  // ArtifactSlot and the serialized part arrays are independent game-data
  // sources. Start from the first available part and keep the selector visible;
  // never derive a part index from Rune/Jewel/Scroll/Relic.
  return item.parts?.[0]?.index || 0
}

function chooseArtifact(item: BuilderOption, recognized?: BuildCatalogOcrParsedLine) {
  if (!artifactSlot.value) return
  const previous = activeArtifact.value?.id === item.id ? activeArtifact.value : undefined
  const partIndex = recognized?.partIndex ?? previous?.partIndex ?? defaultPartIndex(item)
  const next: BuildArtifact = {
    slot: artifactSlot.value,
    partIndex: Math.min(3, Math.max(0, partIndex)) as 0 | 1 | 2 | 3,
    id: item.id,
    slug: item.slug,
    ...optionNames(item),
    partIcon: item.parts?.find(part => part.index === partIndex)?.icon || item.icon || undefined,
    refineLevel: recognized?.refineLevel ?? previous?.refineLevel,
    actualAffixes: previous?.actualAffixes || [],
    gem: previous?.gem
  }
  emit('update:artifactSelections', [
    ...props.artifactSelections.filter(selection => selection.slot !== artifactSlot.value),
    next
  ])
  pickerBrowsing.value = false
}

function patchArtifact(patch: Partial<BuildArtifact>) {
  if (!artifactSlot.value || !activeArtifact.value) return
  emit('update:artifactSelections', props.artifactSelections.map(item => item.slot === artifactSlot.value ? { ...item, ...patch } : item))
}

function setArtifactPart(event: Event) {
  const partIndex = Number((event.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3
  const partIcon = activeArtifactOption.value?.parts?.find(part => part.index === partIndex)?.icon || activeArtifactOption.value?.icon || undefined
  patchArtifact({ partIndex, partIcon })
}

function setArtifactGem(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  if (!id) {
    patchArtifact({ gem: undefined })
    return
  }
  const item = props.options.gems.find(option => option.id === id)
  if (!item) return
  const affix = typeof item.affix === 'string' ? item.affix : localizedText(item.affix, locale.value === 'en' ? 'en' : 'zh')
  patchArtifact({ gem: { id: item.id, slug: item.slug, ...optionNames(item), icon: item.icon || undefined, affix: affix || undefined } })
}

function removeArtifact() {
  if (!artifactSlot.value) return
  emit('update:artifactSelections', props.artifactSelections.filter(item => item.slot !== artifactSlot.value))
  pickerBrowsing.value = true
}

function grimoireSelectedElsewhere(item: BuilderOption) {
  return props.grimoireSelections.some(selection => selection.id === item.id && selection.slotIndex !== grimoireIndex.value)
}

function chooseGrimoire(item: BuilderOption) {
  if (!Number.isInteger(grimoireIndex.value) || grimoireSelectedElsewhere(item)) return
  const slotIndex = grimoireIndex.value as 0 | 1 | 2
  const next: BuildGrimoire = {
    slotIndex,
    id: item.id,
    slug: item.slug,
    ...optionNames(item),
    icon: item.icon || undefined
  }
  emit('update:grimoireSelections', [
    ...props.grimoireSelections.filter(selection => selection.slotIndex !== slotIndex),
    next
  ])
  pickerBrowsing.value = false
}

function removeGrimoire() {
  if (!Number.isInteger(grimoireIndex.value)) return
  emit('update:grimoireSelections', props.grimoireSelections.filter(item => item.slotIndex !== grimoireIndex.value))
  pickerBrowsing.value = true
}

function optionalInteger(event: Event, min: number, max: number) {
  const value = (event.target as HTMLInputElement).value
  if (!value.trim()) return undefined
  const numeric = Number(value)
  return Number.isInteger(numeric) ? Math.min(max, Math.max(min, numeric)) : undefined
}

function optionalText(event: Event) {
  const value = (event.target as HTMLInputElement).value.trim()
  return value || undefined
}

function patchCharacter(patch: Partial<BuildCharacterSnapshot>) {
  emit('update:character', { ...(props.character || {}), ...patch })
}

function setCharacterEnabled(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  emit('update:character', checked ? (props.character || {}) : undefined)
}

async function scrollToSection(target: Ref<HTMLElement | undefined>) {
  await nextTick()
  target.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  target.value?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true })
}

function openCharacterEditor() {
  void scrollToSection(characterSection)
}

function openSkillEditor() {
  void scrollToSection(skillSection)
}

type SkillChoice = { item: BuilderOption; kind: 'active' | 'passive' }

function skillRelationValues(item: BuilderOption) {
  const previewed = (item as BuilderOption & { previewedByArchetypes?: string[] }).previewedByArchetypes || []
  return [...(item.allowedArchetypes || []), ...(item.recommendedArchetypes || []), ...previewed]
}

function skillHasVerifiedTree(item: BuilderOption, treeId: string) {
  const target = archetypeCatalog.value.get(canonical(treeId))
  if (!target) return false
  const targetTokens = new Set([
    target.id,
    target.slug,
    target.displayName,
    localizedText(target.name, 'zh'),
    localizedText(target.name, 'en')
  ].map(canonical).filter(Boolean))
  const relations = allowedArchetypeTokens({ ...item, allowedArchetypes: skillRelationValues(item) })
  if (relations.some(value => targetTokens.has(value))) return true
  const prefix = item.id.split('_')[0]
  const prefixedArchetype = archetypeCatalog.value.get(canonical(prefix))
  return Boolean(prefixedArchetype && canonical(prefixedArchetype.id) === canonical(target.id))
}

function isPlayerSkillCandidate(item: BuilderOption) {
  if (skillRelationValues(item).length) return true
  return !/^(npc|enemy|monster|mob|boss)[_.-]/i.test(item.id)
    && !/(enemy|summon)$/i.test(item.id)
    && !/^gamemaster/i.test(item.id)
    && !['gamemaster', 'bothunter', 'bossprotocol'].includes(canonical(item.id))
}

const skillChoiceCandidates = computed<SkillChoice[]>(() => {
  const source = skillKind.value === 'active' ? props.options.skills : props.options.skillPassives
  const term = skillSearch.value.trim().toLocaleLowerCase('en-US')
  if (!skillTreeArchetype.value) return []
  return source
    .filter(item => isPlayerSkillCandidate(item)
      && (showFullTreeCatalog.value
        ? Boolean(term) || allocationFor(item, skillKind.value)?.treeArchetype === skillTreeArchetype.value
        : skillHasVerifiedTree(item, skillTreeArchetype.value))
      && (!term || optionSearchText(item).includes(term)))
    .map(item => ({ item, kind: skillKind.value }))
})
const visibleSkillChoices = computed(() => skillChoiceCandidates.value.slice(0, 100))

function allocationFor(item: BuilderOption, kind: 'active' | 'passive') {
  return props.skillTree.find(skill => skill.kind === kind && skill.id === item.id)
}

function displayedSkillLevel(item: BuilderOption, kind: 'active' | 'passive') {
  const allocation = allocationFor(item, kind)
  return allocation?.treeArchetype === skillTreeArchetype.value ? allocation.level : 0
}

function skillMaximum(item: BuilderOption) {
  const value = Number(item.maxLevel)
  return Number.isInteger(value) && value >= 0 ? Math.min(10, value) : 0
}

function skillAllocation(item: BuilderOption, kind: 'active' | 'passive', level: number) {
  return {
    id: item.id,
    slug: item.slug,
    ...optionNames(item),
    icon: item.icon || undefined,
    kind,
    level,
    maxLevel: skillMaximum(item),
    treeArchetype: skillTreeArchetype.value,
    treeArchetypeSource: 'user-confirmed' as const
  }
}

function setSkillLevel(item: BuilderOption, kind: 'active' | 'passive', event: Event) {
  if (!skillTreeArchetype.value) return
  const maximum = skillMaximum(item)
  if (maximum === 0) return
  const input = Number((event.target as HTMLInputElement).value)
  const level = Number.isFinite(input) ? Math.min(maximum, Math.max(0, Math.trunc(input))) : 0
  const without = props.skillTree.filter(skill => !(skill.kind === kind && skill.id === item.id))
  if (level <= 0) {
    emit('update:skillTree', without)
    return
  }
  emit('update:skillTree', [...without, skillAllocation(item, kind, level)])
}

function zeroLevelSkillChecked(item: BuilderOption, kind: 'active' | 'passive') {
  return allocationFor(item, kind)?.treeArchetype === skillTreeArchetype.value
}

function setZeroLevelSkill(item: BuilderOption, kind: 'active' | 'passive', event: Event) {
  if (!skillTreeArchetype.value || skillMaximum(item) !== 0) return
  const without = props.skillTree.filter(skill => !(skill.kind === kind && skill.id === item.id))
  const checked = (event.target as HTMLInputElement).checked
  emit('update:skillTree', checked ? [...without, skillAllocation(item, kind, 0)] : without)
}

function treeName(id: string) {
  return optionName(treeTargets.value.find(item => item.id === id)) || id
}

function treeStageLabel(target: BuilderOption, index: number) {
  return target.stage
    ? t(`classes.stages.${target.stage}`)
    : index === 0 ? t('builder.loadout.baseTree') : t('builder.loadout.advancedTree')
}

function passiveDescription(passive?: BuildGrimoirePassive) {
  if (!passive) return ''
  return locale.value === 'en'
    ? (passive.descriptionEn || passive.descriptionZh || '')
    : (passive.descriptionZh || passive.descriptionEn || '')
}

function passiveName(passive?: BuildGrimoirePassive) {
  if (!passive) return ''
  return locale.value === 'en'
    ? (passive.nameEn || passive.name || passive.nameZh || passive.id)
    : (passive.nameZh || passive.name || passive.nameEn || passive.id)
}

function runtimeEffectSummary(effect: RuntimeEffect) {
  const values = [
    Number.isFinite(effect.value?.base) ? String(effect.value.base) : '',
    Number.isFinite(effect.value?.perLevel) && effect.value.perLevel !== 0 ? `+${effect.value.perLevel}/Lv` : '',
    effect.value?.string,
    effect.value?.string2,
    Number.isFinite(effect.chance) && effect.chance > 0 && effect.chance < 1 ? `${Math.round(effect.chance * 100)}%` : ''
  ].filter(Boolean)
  return [effect.name || effect.type, values.join(' · ')].filter(Boolean).join(': ')
}

</script>

<template>
  <div class="build-snapshot-editor">
    <BuildLoadoutBoard
      :options="options"
      :archetype="archetype"
      :equipment-selections="equipmentSelections"
      :artifact-selections="artifactSelections"
      :grimoire-selections="grimoireSelections"
      :character="character"
      :skill-tree="skillTree"
      @open-equipment="openEquipment"
      @open-artifact="openArtifact"
      @open-grimoire="openGrimoire"
      @open-character="openCharacterEditor"
      @open-skills="openSkillEditor"
      @remove-unresolved-equipment="removeUnresolvedEquipment"
    />

    <section v-if="legacyEquipmentEntries.length" class="build-snapshot-legacy" role="region" :aria-label="t('builder.loadout.unspecifiedEquipment')">
      <header>
        <div><h3>{{ t('builder.loadout.unspecifiedEquipment') }}</h3><p>{{ t('builder.loadout.unspecifiedEquipmentHint') }}</p></div>
        <strong>{{ legacyEquipmentEntries.length }}</strong>
      </header>
      <div class="build-snapshot-legacy__items">
        <article v-for="entry in legacyEquipmentEntries" :key="`${entry.selection.id}:${entry.index}`">
          <div><small>{{ entry.selection.slot || t('builder.loadout.unspecifiedSlot') }}</small><strong>{{ legacyEquipmentName(entry.selection) }}</strong></div>
          <select :aria-label="`${t('builder.loadout.selectSlot')}: ${legacyEquipmentName(entry.selection)}`" value="" :disabled="!migrationSlots(entry.selection, entry.index).length" @change="migrateLegacyEquipment(entry.index, $event)">
            <option value="">{{ t('builder.loadout.selectSlot') }}</option>
            <option v-for="slot in migrationSlots(entry.selection, entry.index)" :key="slot" :value="slot">{{ t(`builder.loadout.equipmentSlots.${slot}`) }}</option>
          </select>
          <button type="button" @click="removeLegacyEquipment(entry.index)">{{ t('builder.loadout.editor.removeSelection') }}</button>
        </article>
      </div>
    </section>

    <section v-if="equipmentSlot" ref="pickerSection" class="build-snapshot-picker">
      <header>
        <div><span>{{ t('builder.loadout.editor.equipmentSlot') }}</span><h3>{{ t(`builder.loadout.equipmentSlots.${equipmentSlot}`) }}</h3></div>
        <button type="button" :aria-label="t('builder.loadout.editor.close')" @click="closePicker">×</button>
      </header>
      <p class="build-snapshot-picker__notice">{{ t('builder.loadout.editor.equipmentSlotNotice') }}</p>
      <BuildCatalogOcrPanel
        :key="`equipment:${equipmentSlot}`"
        kind="equipment"
        :options="equipmentOcrOptions"
        layout="document"
        :kind-labels="equipmentOcrKindLabels"
        :parse-text="parseEquipmentCatalogOcr"
        @apply="applyEquipmentCatalogOcr"
        @manual="showManualCatalogPicker"
      />
      <div v-if="activeEquipment" class="build-snapshot-config">
        <header><h4>{{ optionName(activeEquipmentOption) }}</h4><div class="build-snapshot-config__actions"><button type="button" @click="pickerBrowsing = true">{{ t('builder.loadout.editor.changeSelection') }}</button><button type="button" class="danger" @click="removeEquipment">{{ t('builder.loadout.editor.removeSelection') }}</button></div></header>
        <div class="build-snapshot-config__fields">
          <label><span>{{ t('builder.loadout.editor.refineLevel') }}</span><input type="number" min="0" max="100" :value="activeEquipment.refineLevel ?? ''" :placeholder="t('builder.loadout.editor.optional')" @input="patchEquipment({ refineLevel: optionalInteger($event, 0, 100) })"></label>
          <label><span>{{ t('builder.loadout.editor.potential') }}</span><input type="number" min="0" max="100" :value="activeEquipment.potential ?? ''" :placeholder="t('builder.loadout.editor.optional')" @input="patchEquipment({ potential: optionalInteger($event, 0, 100) })"></label>
        </div>
        <h5>{{ t('builder.loadout.editor.actualAffixes') }}</h5>
        <BuildStatEditor :model-value="activeEquipment.actualAffixes || []" :stat-types="options.statTypes" :max="8" @update:model-value="patchEquipment({ actualAffixes: $event })" />
        <h5>{{ t('builder.loadout.editor.cardTitle') }}</h5>
        <p class="build-snapshot-picker__notice">{{ t('builder.loadout.editor.cardNotice') }}</p>
        <div class="build-snapshot-card-grid">
          <label v-for="slotIndex in 4" :key="slotIndex"><span>{{ t('builder.loadout.editor.cardSlot') }} {{ slotIndex }}</span><select :value="equipmentCardAt(slotIndex - 1)?.id || ''" @change="setEquipmentCard(slotIndex - 1, $event)">
            <option value="">{{ t('builder.loadout.editor.noCard') }}</option>
            <option v-if="equipmentCardAt(slotIndex - 1) && !compatibleCards.some(card => card.id === equipmentCardAt(slotIndex - 1)?.id)" :value="equipmentCardAt(slotIndex - 1)?.id">{{ equipmentCardName(equipmentCardAt(slotIndex - 1)!) }} · {{ t('common.unknown') }}</option>
            <option v-for="card in compatibleCards" :key="card.id" :value="card.id">{{ optionName(card) }}</option>
          </select></label>
        </div>
      </div>
      <template v-if="pickerBrowsing || !activeEquipment">
        <label class="build-snapshot-picker__search"><span aria-hidden="true">⌕</span><input v-model="pickerSearch" type="search" :aria-label="t('builder.loadout.editor.searchEquipment')" :placeholder="t('builder.loadout.editor.searchEquipment')"></label>
        <p class="build-snapshot-picker__count">{{ t('builder.loadout.editor.results', { count: equipmentChoiceTotal }) }}</p>
        <div class="build-snapshot-picker__choices">
          <button v-for="item in equipmentChoices" :key="item.id" type="button" :class="{ selected: activeEquipment?.id === item.id }" :aria-pressed="activeEquipment?.id === item.id" @click="chooseEquipment(item)">
            <img v-if="item.icon" :src="item.icon" alt="" loading="lazy"><b v-else>{{ optionName(item).slice(0, 2) }}</b>
            <span><strong>{{ optionName(item) }}</strong><small>{{ [slotText(item.slot), typeText(item.type), categoryText(item.category)].filter(Boolean).join(' · ') }}</small></span>
            <i>{{ activeEquipment?.id === item.id ? '✓' : '+' }}</i>
          </button>
        </div>
        <p v-if="equipmentChoiceTotal > equipmentChoices.length" class="build-snapshot-picker__limit">{{ t('builder.loadout.editor.firstResults', { count: equipmentChoices.length }) }}</p>
      </template>
    </section>

    <section v-else-if="artifactSlot" ref="pickerSection" class="build-snapshot-picker">
      <header>
        <div><span>{{ t('builder.loadout.editor.artifactSlot') }}</span><h3>{{ t(`builder.loadout.artifactSlots.${artifactSlot}`) }}</h3></div>
        <button type="button" :aria-label="t('builder.loadout.editor.close')" @click="closePicker">×</button>
      </header>
      <p class="build-snapshot-picker__notice">{{ t('builder.loadout.editor.artifactPartNotice') }}</p>
      <BuildCatalogOcrPanel
        :key="`artifact:${artifactSlot}`"
        kind="artifact"
        :options="artifactOcrOptions"
        layout="sparse"
        :kind-labels="artifactOcrKindLabels"
        :parse-text="parseArtifactCatalogOcr"
        @apply="applyArtifactCatalogOcr"
        @manual="showManualCatalogPicker"
      />
      <div v-if="activeArtifact" class="build-snapshot-config">
        <header><h4>{{ optionName(activeArtifactOption) }}</h4><div class="build-snapshot-config__actions"><button type="button" @click="pickerBrowsing = true">{{ t('builder.loadout.editor.changeSelection') }}</button><button type="button" class="danger" @click="removeArtifact">{{ t('builder.loadout.editor.removeSelection') }}</button></div></header>
        <div class="build-snapshot-config__fields">
          <label><span>{{ t('builder.loadout.editor.partIndex') }}</span><select :value="activeArtifact.partIndex" @change="setArtifactPart"><option v-for="part in activeArtifactOption?.parts || []" :key="part.index" :value="part.index">{{ t('builder.loadout.editor.partNumber', { number: part.index + 1 }) }} · {{ part.index }}</option></select></label>
          <label><span>{{ t('builder.loadout.editor.refineLevel') }}</span><input type="number" min="0" max="100" :value="activeArtifact.refineLevel ?? ''" :placeholder="t('builder.loadout.editor.optional')" @input="patchArtifact({ refineLevel: optionalInteger($event, 0, 100) })"></label>
          <label class="build-snapshot-config__wide"><span>{{ t('builder.loadout.editor.gem') }}</span><select :value="activeArtifact.gem?.id || ''" @change="setArtifactGem"><option value="">{{ t('builder.loadout.editor.noGem') }}</option><option v-for="item in options.gems" :key="item.id" :value="item.id">{{ optionName(item) }}</option></select></label>
        </div>
        <h5>{{ t('builder.loadout.editor.actualAffixes') }}</h5>
        <BuildStatEditor :model-value="activeArtifact.actualAffixes || []" :stat-types="options.statTypes" :max="8" @update:model-value="patchArtifact({ actualAffixes: $event })" />
      </div>
      <template v-if="pickerBrowsing || !activeArtifact">
        <label class="build-snapshot-picker__search"><span aria-hidden="true">⌕</span><input v-model="pickerSearch" type="search" :aria-label="t('builder.loadout.editor.searchArtifact')" :placeholder="t('builder.loadout.editor.searchArtifact')"></label>
        <p class="build-snapshot-picker__count">{{ t('builder.loadout.editor.results', { count: artifactChoiceTotal }) }}</p>
        <div class="build-snapshot-picker__choices">
          <button v-for="item in artifactChoices" :key="item.id" type="button" :class="{ selected: activeArtifact?.id === item.id }" :aria-pressed="activeArtifact?.id === item.id" @click="chooseArtifact(item)">
            <img v-if="item.icon" :src="item.icon" alt="" loading="lazy"><b v-else>{{ optionName(item).slice(0, 2) }}</b>
            <span><strong>{{ optionName(item) }}</strong><small>{{ t('builder.loadout.editor.artifactParts', { count: item.partCount || item.parts?.length || 0 }) }}</small></span>
            <i>{{ activeArtifact?.id === item.id ? '✓' : '+' }}</i>
          </button>
        </div>
      </template>
    </section>

    <section v-else-if="Number.isInteger(grimoireIndex)" ref="pickerSection" class="build-snapshot-picker">
      <header>
        <div><span>{{ t('builder.loadout.editor.grimoireSlot') }}</span><h3>{{ t('builder.loadout.editor.slotNumber', { number: Number(grimoireIndex) + 1 }) }}</h3></div>
        <button type="button" :aria-label="t('builder.loadout.editor.close')" @click="closePicker">×</button>
      </header>
      <BuildCatalogOcrPanel
        :key="`grimoire:${grimoireIndex}`"
        kind="grimoire"
        :options="grimoireOcrOptions"
        layout="sparse"
        :kind-labels="grimoireOcrKindLabels"
        :parse-text="parseGrimoireCatalogOcr"
        @apply="applyGrimoireCatalogOcr"
        @manual="showManualCatalogPicker"
      />
      <div v-if="activeGrimoire" class="build-snapshot-config build-snapshot-grimoire-detail">
        <header><h4>{{ optionName(activeGrimoireOption) }}</h4><div class="build-snapshot-config__actions"><button type="button" @click="pickerBrowsing = true">{{ t('builder.loadout.editor.changeSelection') }}</button><button type="button" class="danger" @click="removeGrimoire">{{ t('builder.loadout.editor.removeSelection') }}</button></div></header>
        <template v-if="activeGrimoireOption?.passive">
          <h5>{{ t('builder.loadout.editor.grimoirePassive') }} · {{ passiveName(activeGrimoireOption.passive) }}</h5>
          <p v-if="passiveDescription(activeGrimoireOption.passive)" class="build-snapshot-grimoire-detail__description">{{ passiveDescription(activeGrimoireOption.passive) }}</p>
          <dl class="build-snapshot-grimoire-detail__restrictions">
            <div v-if="activeGrimoireOption.passive.weaponTypes?.length"><dt>{{ t('builder.loadout.weaponRestriction') }}</dt><dd>{{ activeGrimoireOption.passive.weaponTypes.join(' · ') }}</dd></div>
            <div v-if="activeGrimoireOption.passive.stanceTypes?.length"><dt>{{ t('builder.loadout.stanceRestriction') }}</dt><dd>{{ activeGrimoireOption.passive.stanceTypes.join(' · ') }}</dd></div>
          </dl>
          <div v-if="activeGrimoireOption.passive.effects?.length" class="build-snapshot-grimoire-detail__effects"><strong>{{ t('builder.loadout.editor.effects') }}</strong><ul><li v-for="(effect, index) in activeGrimoireOption.passive.effects" :key="`${effect.name}:${index}`">{{ runtimeEffectSummary(effect) }}</li></ul></div>
        </template>
      </div>
      <template v-if="pickerBrowsing || !activeGrimoire">
        <label class="build-snapshot-picker__search"><span aria-hidden="true">⌕</span><input v-model="pickerSearch" type="search" :aria-label="t('builder.loadout.editor.searchGrimoire')" :placeholder="t('builder.loadout.editor.searchGrimoire')"></label>
        <p class="build-snapshot-picker__count">{{ t('builder.loadout.editor.results', { count: grimoireChoiceTotal }) }}</p>
        <div class="build-snapshot-picker__choices">
          <button v-for="item in grimoireChoices" :key="item.id" type="button" :disabled="grimoireSelectedElsewhere(item)" :class="{ selected: activeGrimoire?.id === item.id }" :aria-pressed="activeGrimoire?.id === item.id" @click="chooseGrimoire(item)">
            <img v-if="item.icon" :src="item.icon" alt="" loading="lazy"><b v-else>{{ optionName(item).slice(0, 2) }}</b>
            <span><strong>{{ optionName(item) }}</strong><small>{{ grimoireSelectedElsewhere(item) ? t('builder.loadout.editor.usedInAnotherSlot') : item.id }}</small></span>
            <i>{{ activeGrimoire?.id === item.id ? '✓' : '+' }}</i>
          </button>
        </div>
      </template>
    </section>

    <section ref="characterSection" class="build-snapshot-form">
      <header><div><span>{{ t('builder.loadout.editor.characterKicker') }}</span><h3>{{ t('builder.loadout.editor.characterTitle') }}</h3></div><p>{{ t('builder.loadout.editor.characterHint') }}</p></header>
      <label class="build-snapshot-character-toggle"><input type="checkbox" :checked="characterEnabled" @change="setCharacterEnabled"><span>{{ t('builder.loadout.configure') }}</span></label>
      <template v-if="characterEnabled">
        <div class="build-snapshot-form__fields">
          <label><span>{{ t('builder.loadout.editor.characterName') }}</span><input :value="character?.name || ''" maxlength="50" :placeholder="t('builder.loadout.editor.optional')" @input="patchCharacter({ name: optionalText($event) })"></label>
          <label><span>{{ t('builder.loadout.level') }}</span><input type="number" min="1" max="1000" :value="character?.level ?? ''" :placeholder="t('builder.loadout.editor.optional')" @input="patchCharacter({ level: optionalInteger($event, 1, 1000) })"></label>
          <label><span>{{ t('builder.loadout.jobLevel') }}</span><input type="number" min="0" :max="characterJobLevelMax" :value="character?.jobLevel ?? ''" :placeholder="t('builder.loadout.editor.optional')" @input="patchCharacter({ jobLevel: optionalInteger($event, 0, characterJobLevelMax) })"></label>
          <label><span>{{ t('builder.loadout.stance') }}</span><select :value="character?.stance || ''" @change="patchCharacter({ stance: (($event.target as HTMLSelectElement).value || undefined) as BuildCharacterSnapshot['stance'] })"><option value="">{{ t('builder.loadout.editor.optional') }}</option><option v-for="stance in options.stances" :key="stance" :value="stance">{{ t(`builder.loadout.stances.${stance}`) }}</option></select></label>
        </div>
        <h4>{{ t('builder.loadout.editor.characterStats') }}</h4>
        <BuildStatEditor :model-value="character?.stats || []" :stat-types="options.statTypes" :max="64" unique-type :allow-subject="false" @update:model-value="patchCharacter({ stats: $event })" />
      </template>
    </section>

    <section ref="skillSection" class="build-snapshot-form build-snapshot-form--skills">
      <header><div><span>{{ t('builder.loadout.editor.skillTreeKicker') }}</span><h3>{{ t('builder.loadout.editor.skillTreeTitle') }}</h3></div><p>{{ t('builder.loadout.editor.skillTreeNotice') }}</p></header>
      <div v-if="treeTargets.length" class="build-snapshot-tree-tabs" :aria-label="t('builder.loadout.editor.skillTreeTitle')">
        <button v-for="(target, index) in treeTargets" :key="target.id" type="button" :class="{ selected: skillTreeArchetype === target.id }" :aria-pressed="skillTreeArchetype === target.id" @click="skillTreeArchetype = target.id">
          <small>{{ treeStageLabel(target, index) }}</small><strong>{{ optionName(target) }}</strong>
        </button>
      </div>
      <p v-else class="build-snapshot-picker__notice">{{ t('builder.loadout.editor.chooseClassFirst') }}</p>
      <template v-if="treeTargets.length">
        <div class="build-snapshot-tree-mode" :aria-label="t('builder.loadout.editor.skillTreeTitle')">
          <button type="button" :class="{ selected: !showFullTreeCatalog }" :aria-pressed="!showFullTreeCatalog" @click="showFullTreeCatalog = false">{{ t('builder.loadout.editor.verifiedTreeSkills') }}</button>
          <button type="button" :class="{ selected: showFullTreeCatalog }" :aria-pressed="showFullTreeCatalog" @click="showFullTreeCatalog = true">{{ t('builder.loadout.editor.fullTreeCatalog') }}</button>
        </div>
        <p class="build-snapshot-tree-mode__hint">{{ showFullTreeCatalog ? t('builder.loadout.editor.fullTreeCatalogHint') : t('builder.loadout.editor.verifiedTreeSkillsHint') }}</p>
        <div class="build-snapshot-skill-tools">
          <div><button type="button" :class="{ selected: skillKind === 'active' }" :aria-pressed="skillKind === 'active'" @click="skillKind = 'active'">{{ t('builder.loadout.editor.activeSkills') }}</button><button type="button" :class="{ selected: skillKind === 'passive' }" :aria-pressed="skillKind === 'passive'" @click="skillKind = 'passive'">{{ t('builder.loadout.editor.passiveSkills') }}</button></div>
          <label><span aria-hidden="true">⌕</span><input v-model="skillSearch" type="search" :aria-label="t('builder.loadout.editor.searchSkills')" :placeholder="t('builder.loadout.editor.searchSkills')"></label>
        </div>
        <div class="build-snapshot-skills">
          <article v-for="choice in visibleSkillChoices" :key="`${choice.kind}:${choice.item.id}`" :class="{ allocated: allocationFor(choice.item, choice.kind)?.treeArchetype === skillTreeArchetype }">
            <ClassIcon :item="choice.item" kind="skill" size="small" />
            <span><strong>{{ optionName(choice.item) }}</strong><small v-if="allocationFor(choice.item, choice.kind) && allocationFor(choice.item, choice.kind)?.treeArchetype !== skillTreeArchetype">{{ t('builder.loadout.editor.allocatedTo', { tree: treeName(allocationFor(choice.item, choice.kind)?.treeArchetype || '') }) }}</small><small v-else>{{ choice.item.id }}</small></span>
            <label v-if="skillMaximum(choice.item) > 0"><span>{{ t('builder.loadout.editor.skillLevel') }}</span><input type="number" min="0" :max="skillMaximum(choice.item)" :value="displayedSkillLevel(choice.item, choice.kind)" @change="setSkillLevel(choice.item, choice.kind, $event)"><small>/ {{ skillMaximum(choice.item) }}</small></label>
            <label v-else class="build-snapshot-zero-skill"><span>{{ t('builder.loadout.editor.skillLevel') }}</span><input type="checkbox" :checked="zeroLevelSkillChecked(choice.item, choice.kind)" @change="setZeroLevelSkill(choice.item, choice.kind, $event)"><small>0 / 0</small></label>
          </article>
        </div>
        <p v-if="!visibleSkillChoices.length" class="build-snapshot-picker__notice">{{ showFullTreeCatalog && !skillSearch.trim() ? t('builder.loadout.editor.fullTreeCatalogSearch') : t('builder.noSkills') }}</p>
        <p v-if="skillChoiceCandidates.length > visibleSkillChoices.length" class="build-snapshot-picker__limit">{{ t('builder.loadout.editor.firstResults', { count: visibleSkillChoices.length }) }}</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.build-snapshot-editor { display: grid; gap: 14px; }
.build-snapshot-picker, .build-snapshot-form, .build-snapshot-legacy { padding: 17px; border: 1px solid #d8e6e1; border-radius: 17px; background: #fbfdfc; scroll-margin-top: 90px; }
.build-snapshot-picker > header, .build-snapshot-form > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.build-snapshot-picker > header span, .build-snapshot-form > header span { display: block; color: #158677; font-size: 8px; font-weight: 850; letter-spacing: .14em; text-transform: uppercase; }
.build-snapshot-picker h3, .build-snapshot-form h3 { margin: 3px 0 0; color: #173d38; font-size: 17px; }
.build-snapshot-picker > header > button { width: 44px; height: 44px; border: 0; border-radius: 10px; color: #52716b; background: #eaf3f0; cursor: pointer; font-size: 20px; }
.build-snapshot-picker__notice { margin: 0 0 11px; padding: 9px 11px; border-radius: 9px; color: #5c716c; background: #edf5f2; font-size: 9px; line-height: 1.5; }
.build-snapshot-picker__search { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 11px; border: 1px solid #cbdcd6; border-radius: 10px; background: #fff; }
.build-snapshot-picker__search span { color: #168d7e; font-size: 17px; }
.build-snapshot-picker__search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-size: 11px; }
.build-snapshot-picker__count, .build-snapshot-picker__limit { margin: 8px 0; color: #778b86; font-size: 9px; }
.build-snapshot-picker__choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; max-height: 310px; overflow: auto; }
.build-snapshot-picker__choices > button { min-width: 0; display: grid; grid-template-columns: 38px minmax(0, 1fr) 19px; align-items: center; gap: 8px; padding: 8px; border: 1px solid #dce7e3; border-radius: 11px; color: #173b37; background: #fff; cursor: pointer; text-align: left; }
.build-snapshot-picker__choices > button:hover, .build-snapshot-picker__choices > button.selected { border-color: #65b8aa; background: #eef8f5; }
.build-snapshot-picker__choices > button:disabled { cursor: not-allowed; filter: grayscale(.5); opacity: .48; }
.build-snapshot-picker__choices img, .build-snapshot-picker__choices > button > b { width: 38px; height: 38px; object-fit: contain; border-radius: 9px; background: #eef4f1; }
.build-snapshot-picker__choices > button > b { display: grid; place-items: center; color: #218b7d; font-size: 10px; }
.build-snapshot-picker__choices span { min-width: 0; }
.build-snapshot-picker__choices strong, .build-snapshot-picker__choices small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-snapshot-picker__choices strong { font-size: 10px; }
.build-snapshot-picker__choices small { margin-top: 3px; color: #7f928d; font-size: 8px; }
.build-snapshot-picker__choices i { width: 19px; height: 19px; display: grid; place-items: center; border-radius: 6px; color: #fff; background: #168d7e; font-size: 10px; font-style: normal; }
.build-snapshot-picker__remove { min-height: 44px; margin-top: 10px; padding: 8px 13px; border: 0; border-radius: 9px; color: #9c4242; background: #fbe9e7; cursor: pointer; font-size: 10px; font-weight: 750; }
.build-snapshot-config { margin-top: 13px; padding-top: 13px; border-top: 1px solid #dce8e3; }
.build-snapshot-config + .build-snapshot-picker__search { margin-top: 13px; }
.build-snapshot-config > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.build-snapshot-config h4 { margin: 0; font-size: 14px; }
.build-snapshot-config__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.build-snapshot-config > header button { min-height: 44px; padding: 8px 12px; border: 0; border-radius: 8px; color: #176f64; background: #e8f5f1; cursor: pointer; font-size: 9px; font-weight: 750; }
.build-snapshot-config > header button.danger { color: #9b4040; background: #fbe9e7; }
.build-snapshot-config h5 { margin: 15px 0 8px; color: #385d57; font-size: 11px; }
.build-snapshot-config__fields, .build-snapshot-form__fields { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin-top: 11px; }
.build-snapshot-config__fields { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.build-snapshot-config__wide { grid-column: span 2; }
.build-snapshot-config label > span, .build-snapshot-form label > span { display: block; margin-bottom: 5px; color: #617671; font-size: 9px; font-weight: 700; }
.build-snapshot-config input, .build-snapshot-config select, .build-snapshot-form input, .build-snapshot-form select { width: 100%; height: 44px; padding: 0 9px; border: 1px solid #ceddd8; border-radius: 9px; color: #183b37; background: #fff; font: inherit; font-size: 10px; }
.build-snapshot-form > header p { max-width: 520px; margin: 0; color: #778b86; font-size: 9px; line-height: 1.55; }
.build-snapshot-form > h4 { margin: 15px 0 9px; color: #365b55; font-size: 12px; }
.build-snapshot-character-toggle { width: fit-content; min-height: 44px; display: inline-flex; align-items: center; gap: 9px; padding: 0 12px; border: 1px solid #c7ddd6; border-radius: 10px; color: #176f64; background: #eef8f5; cursor: pointer; font-size: 10px; font-weight: 800; }
.build-snapshot-character-toggle input { width: 18px; height: 18px; margin: 0; accent-color: #168d7e; }
.build-snapshot-card-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.build-snapshot-card-grid label { min-width: 0; }
.build-snapshot-tree-mode { width: fit-content; display: flex; gap: 4px; margin-top: 12px; padding: 4px; border-radius: 10px; background: #eaf1ee; }
.build-snapshot-tree-mode button { min-height: 40px; padding: 8px 11px; border: 0; border-radius: 7px; color: #657a75; background: transparent; cursor: pointer; font-size: 9px; font-weight: 750; }
.build-snapshot-tree-mode button.selected { color: #fff; background: #168d7e; }
.build-snapshot-tree-mode__hint { margin: 7px 0 0; color: #6d827d; font-size: 9px; line-height: 1.55; }
.build-snapshot-tree-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.build-snapshot-tree-tabs > button { min-width: 0; min-height: 52px; padding: 10px; border: 1px solid #d8e5e0; border-radius: 11px; color: #42605b; background: #fff; cursor: pointer; text-align: left; }
.build-snapshot-tree-tabs > button.selected { border-color: #58b4a5; background: #eaf7f3; box-shadow: inset 0 0 0 1px rgba(22, 141, 126, .12); }
.build-snapshot-tree-tabs small, .build-snapshot-tree-tabs strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-snapshot-tree-tabs small { color: #7a8f89; font-size: 8px; }
.build-snapshot-tree-tabs strong { margin-top: 4px; font-size: 11px; }
.build-snapshot-skill-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 12px 0 9px; }
.build-snapshot-skill-tools > div { display: flex; padding: 3px; border-radius: 9px; background: #eaf1ee; }
.build-snapshot-skill-tools button { min-height: 40px; padding: 8px 11px; border: 0; border-radius: 7px; color: #657a75; background: transparent; cursor: pointer; font-size: 9px; font-weight: 750; }
.build-snapshot-skill-tools button.selected { color: #fff; background: #168d7e; }
.build-snapshot-skill-tools label { min-width: min(280px, 50%); display: flex; align-items: center; gap: 7px; height: 44px; padding: 0 9px; border: 1px solid #cfddd8; border-radius: 9px; background: #fff; }
.build-snapshot-skill-tools label input { height: auto; padding: 0; border: 0; outline: 0; }
.build-snapshot-skills { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; max-height: 410px; overflow: auto; }
.build-snapshot-skills article { min-width: 0; display: grid; grid-template-columns: 42px minmax(0, 1fr) 72px; align-items: center; gap: 7px; padding: 8px; border: 1px solid #dce7e3; border-radius: 11px; background: #fff; }
.build-snapshot-skills article.allocated { border-color: #65b8aa; background: #eef8f5; }
.build-snapshot-skills article > span { min-width: 0; }
.build-snapshot-skills article > span strong, .build-snapshot-skills article > span small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-snapshot-skills article > span strong { font-size: 10px; }
.build-snapshot-skills article > span small { margin-top: 3px; color: #7d918c; font-size: 7px; }
.build-snapshot-skills article > label { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px; }
.build-snapshot-skills article > label > span { grid-column: 1 / -1; margin: 0; font-size: 7px; }
.build-snapshot-skills article > label input { width: 48px; height: 40px; padding: 0 6px; }
.build-snapshot-skills article > label small { color: #6e827d; font-size: 8px; }
.build-snapshot-zero-skill input { width: 20px !important; height: 20px !important; margin: 10px auto; accent-color: #168d7e; }
.build-snapshot-grimoire-detail__description { margin: 0; color: #526c66; font-size: 10px; line-height: 1.65; }
.build-snapshot-grimoire-detail__restrictions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 10px 0 0; }
.build-snapshot-grimoire-detail__restrictions > div { padding: 9px 11px; border-radius: 10px; background: #edf5f2; }
.build-snapshot-grimoire-detail__restrictions dt { color: #748984; font-size: 8px; font-weight: 750; }
.build-snapshot-grimoire-detail__restrictions dd { margin: 4px 0 0; color: #274b45; font-size: 10px; }
.build-snapshot-grimoire-detail__effects { margin-top: 10px; }
.build-snapshot-grimoire-detail__effects > strong { color: #385d57; font-size: 10px; }
.build-snapshot-grimoire-detail__effects ul { display: grid; gap: 5px; margin: 7px 0 0; padding: 0; list-style: none; }
.build-snapshot-grimoire-detail__effects li { padding: 8px 10px; border-radius: 9px; color: #425f59; background: #f0f6f4; font-size: 9px; line-height: 1.45; }
.build-snapshot-legacy { border-color: #e1c99b; background: #fffaf0; }
.build-snapshot-legacy > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.build-snapshot-legacy h3 { margin: 0; color: #704f20; font-size: 14px; }
.build-snapshot-legacy p { margin: 5px 0 0; color: #826c4a; font-size: 9px; line-height: 1.5; }
.build-snapshot-legacy > header > strong { min-width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; color: #76551f; background: #f4e4c5; }
.build-snapshot-legacy__items { display: grid; gap: 8px; margin-top: 12px; }
.build-snapshot-legacy__items article { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(180px, .8fr) auto; align-items: center; gap: 9px; padding: 9px; border: 1px solid #ead9b8; border-radius: 11px; background: #fff; }
.build-snapshot-legacy__items article > div { min-width: 0; }
.build-snapshot-legacy__items small, .build-snapshot-legacy__items strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.build-snapshot-legacy__items small { color: #8c795a; font-size: 8px; }
.build-snapshot-legacy__items strong { margin-top: 4px; color: #473a27; font-size: 11px; }
.build-snapshot-legacy__items select, .build-snapshot-legacy__items button { min-height: 44px; border-radius: 9px; font: inherit; font-size: 10px; }
.build-snapshot-legacy__items select { width: 100%; padding: 0 9px; border: 1px solid #decba8; color: #483a25; background: #fff; }
.build-snapshot-legacy__items button { padding: 8px 12px; border: 0; color: #9b4040; background: #fbe9e7; cursor: pointer; }
.build-snapshot-editor :is(button, input, select):focus-visible { outline: 3px solid rgba(22, 141, 126, .28); outline-offset: 2px; }
@media (max-width: 920px) {
  .build-snapshot-picker__choices, .build-snapshot-skills { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .build-snapshot-form__fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 620px) {
  .build-snapshot-picker__choices, .build-snapshot-skills, .build-snapshot-config__fields, .build-snapshot-form__fields { grid-template-columns: 1fr; }
  .build-snapshot-config__wide { grid-column: auto; }
  .build-snapshot-form > header, .build-snapshot-skill-tools { display: grid; }
  .build-snapshot-skill-tools label { width: 100%; min-width: 0; }
  .build-snapshot-card-grid, .build-snapshot-grimoire-detail__restrictions { grid-template-columns: 1fr; }
  .build-snapshot-config > header { align-items: flex-start; }
  .build-snapshot-config__actions { justify-content: flex-start; }
  .build-snapshot-legacy__items article { grid-template-columns: 1fr; }
  .build-snapshot-legacy__items button { width: 100%; }
}
</style>
