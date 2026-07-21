<script setup lang="ts">
import type {
  Build,
  BuildArtifact,
  BuildCharacterSnapshot,
  BuildEquipment,
  BuildGrimoire,
  BuilderOption,
  BuilderOptions,
  BuildSkillAllocation,
  BuildStatValue
} from '~/composables/useApi'
import { localizedText } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const { t, locale } = useI18n()
const { gameText, difficultyText } = useGameLocale()
const localePath = useLocalePath()
const maxTags = 10
const maxTagLength = 30
const maxGuideLength = 10_000

const { data: options, status, error, refresh } = await useFetch<BuilderOptions>(`${api}/api/builder/options`, {
  default: () => ({
    archetypes: [], skills: [], skillPassives: [], equipment: [], grimoires: [], artifacts: [], gems: [], cards: [],
    equipmentSlots: [], artifactSlots: [], stances: [], statTypes: [],
    difficulties: ['入门', '进阶', '专家'],
    metadata: {
      skillTreeOwnership: 'user-confirmed',
      equipmentRuntimeSlotsMeaning: 'unverified',
      artifactPartSlotMapping: 'user-confirmed'
    }
  })
})

const title = ref('')
const archetype = ref('')
const difficulty = ref('入门')
const summary = ref('')
const tagsInput = ref('')
const guideHtml = ref('')
const guideTextLength = ref(0)
const selectedSkills = ref<string[]>([])
const equipmentSelections = ref<BuildEquipment[]>([])
const artifactSelections = ref<BuildArtifact[]>([])
const grimoireSelections = ref<BuildGrimoire[]>([])
// A character snapshot is evidence supplied by the player, not a required
// build default. Keep it absent until the user explicitly enables the editor
// so a new build never publishes invented levels, stance, or zero-valued stats.
const character = ref<BuildCharacterSnapshot>()
const skillTree = ref<BuildSkillAllocation[]>([])
const skillSearch = ref('')
const showFullSkillCatalog = ref(false)
const manuallyConfirmedSkills = ref(new Set<string>())
const submitting = ref(false)
const submitError = ref('')
const compatibilityNotice = ref('')

const optionName = (item?: BuilderOption | null) => gameText(item?.name, item?.displayName || item?.id || t('builder.unnamedEntry'))
const selectedArchetype = computed(() => options.value.archetypes.find(item => item.id === archetype.value || item.slug === archetype.value))
const selectedSkillItems = computed(() => selectedSkills.value.map(id => options.value.skills.find(item => item.id === id)).filter(Boolean) as BuilderOption[])
const selectedEquipmentItems = computed(() => equipmentSelections.value)
const tags = computed(() => [...new Set(tagsInput.value.split(/[,，\n]/).map(value => value.trim()).filter(Boolean))])
const tagsValidationError = computed(() => {
  if (tags.value.length > maxTags) return t('builder.tagsTooMany', { max: maxTags })
  if (tags.value.some(value => value.length > maxTagLength)) return t('builder.tagTooLong', { max: maxTagLength })
  return ''
})
const guideValidationError = computed(() => {
  if (guideTextLength.value > maxGuideLength) return t('builder.guideContentTooLong', { max: maxGuideLength })
  return ''
})
const filteredSkills = computed(() => {
  const term = skillSearch.value.trim().toLowerCase()
  if (!selectedArchetype.value) return []
  return options.value.skills
    .filter(item => isPlayerSkillCandidate(item)
      && (showFullSkillCatalog.value
        ? (Boolean(term) && (matchesSkillLineage(item) || canManuallyConfirmSkill(item))) || selectedSkills.value.includes(item.id)
        : matchesSkillLineage(item))
      && (!term || `${item.id} ${item.slug} ${optionName(item)} ${localizedText(item.name,'zh')} ${localizedText(item.name,'en')}`.toLowerCase().includes(term)))
    .sort((left, right) => Number(isRecommended(right)) - Number(isRecommended(left)))
    .slice(0, 80)
})

function finiteStatValues(items: BuildStatValue[], uniqueType = false) {
  if (!items.every(item => item.type
    && item.type !== 'None'
    && options.value.statTypes.includes(item.type)
    && Number.isFinite(item.value)
    && Math.abs(item.value) <= 1_000_000_000
    && (item.bonus === undefined || (Number.isFinite(item.bonus) && Math.abs(item.bonus) <= 1_000_000_000))
    && (!item.unit || item.unit === 'flat' || item.unit === 'percent')
    && (!item.subjectId || item.subjectId.length <= 120))) return false
  const keys = items.map(item => uniqueType ? item.type : `${item.type}:${item.subjectId || ''}`)
  return keys.length === new Set(keys).size
}

function canonicalSlot(value?: string | null) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toLocaleLowerCase('en-US')
}

function equipmentFitsSlot(item: BuilderOption, slotKey: NonNullable<BuildEquipment['slotKey']>) {
  const sourceSlot = canonicalSlot(item.slot)
  if (slotKey === 'accessory-left' || slotKey === 'accessory-right') return sourceSlot === 'accessory'
  // Source weapons are all recorded as MainHand. The runtime/API contract
  // explicitly permits them in either hand, while shields remain off-hand.
  if (slotKey === 'off-hand') return sourceSlot === 'offhand' || sourceSlot === 'mainhand'
  return sourceSlot === canonicalSlot(slotKey)
}

function catalogSkillMaximum(item?: BuilderOption) {
  const value = Number(item?.maxLevel)
  return Number.isInteger(value) && value >= 0 ? Math.min(10, value) : 0
}

function expectedCardEquipClass(item: BuilderOption) {
  const itemType = canonicalSlot(item.type)
  const weaponTypes = new Set([
    'sword', 'dagger', 'wand', 'spear', 'axe', 'mace', 'book', 'pistol', 'bow',
    'scythe', 'instrument', 'twinblade', 'mace2h', 'sword2h', 'axe2h', 'spear2h',
    'wand2h', 'rifle', 'shotgun', 'launcher', 'gatlinggun', 'katar'
  ])
  if (weaponTypes.has(itemType)) return 'weapon'
  return ['shield', 'head', 'legs', 'feet', 'chest', 'accessory', 'eyewear', 'back'].includes(itemType)
    ? itemType
    : ''
}

const selectedLineageIds = computed(() => new Set(archetypeLineage(selectedArchetype.value).map(item => item.id)))
const characterJobLevelMax = computed(() => {
  const value = Number(selectedArchetype.value?.maxJobLevel)
  return Number.isFinite(value) && value >= 0 ? Math.min(1000, Math.trunc(value)) : 1000
})
const equipmentSelectionsValid = computed(() => {
  const slots = equipmentSelections.value.map(item => item.slotKey).filter(Boolean)
  return equipmentSelections.value.length <= 10
    && slots.length === equipmentSelections.value.length
    && new Set(slots).size === slots.length
    && equipmentSelections.value.every(item => {
      const option = options.value.equipment.find(candidate => candidate.id === item.id)
      return Boolean(item.slotKey && options.value.equipmentSlots.some(slot => slot.value === item.slotKey)
        && option && String(option.type || '').toLocaleLowerCase('en-US') !== 'grimoire' && matchesEquipmentArchetype(option)
        && equipmentFitsSlot(option, item.slotKey)
        && (item.refineLevel === undefined || (Number.isInteger(item.refineLevel) && item.refineLevel >= 0 && item.refineLevel <= 100))
        && (item.potential === undefined || (Number.isInteger(item.potential) && item.potential >= 0 && item.potential <= 100)))
        && finiteStatValues(item.actualAffixes || [])
        && (item.cards || []).length <= 4
        && new Set((item.cards || []).map(card => card.slotIndex)).size === (item.cards || []).length
        && (item.cards || []).every(card => Number.isInteger(card.slotIndex)
          && card.slotIndex >= 0 && card.slotIndex <= 3
          && options.value.cards.some(candidate => candidate.id === card.id
            && (!expectedCardEquipClass(option) || canonicalSlot(candidate.equipClass) === expectedCardEquipClass(option))))
    })
})
const artifactSelectionsValid = computed(() => artifactSelections.value.length <= 4
  && new Set(artifactSelections.value.map(item => item.slot)).size === artifactSelections.value.length
  && artifactSelections.value.every(item => {
    const option = options.value.artifacts.find(candidate => candidate.id === item.id)
    return Boolean(option?.parts?.some(part => part.index === item.partIndex)
      && (item.refineLevel === undefined || (Number.isInteger(item.refineLevel) && item.refineLevel >= 0 && item.refineLevel <= 100))
      && (!item.gem || options.value.gems.some(gem => gem.id === item.gem?.id)))
      && finiteStatValues(item.actualAffixes || [])
  }))
const grimoireSelectionsValid = computed(() => grimoireSelections.value.length <= 3
  && new Set(grimoireSelections.value.map(item => item.slotIndex)).size === grimoireSelections.value.length
  && new Set(grimoireSelections.value.map(item => item.id)).size === grimoireSelections.value.length
  && grimoireSelections.value.every(item => {
    const option = options.value.grimoires.find(candidate => candidate.id === item.id)
    return Boolean(Number.isInteger(item.slotIndex) && item.slotIndex >= 0 && item.slotIndex <= 2
      && option && matchesEquipmentArchetype(option))
  }))
const characterValid = computed(() => {
  const snapshot = character.value
  if (!snapshot) return true
  return (snapshot.level === undefined || (Number.isInteger(snapshot.level) && snapshot.level >= 1 && snapshot.level <= 1000))
    && (snapshot.jobLevel === undefined || (Number.isInteger(snapshot.jobLevel) && snapshot.jobLevel >= 0 && snapshot.jobLevel <= characterJobLevelMax.value))
    && (!snapshot.name || snapshot.name.trim().length <= 50)
    && (!snapshot.stance || options.value.stances.includes(snapshot.stance))
    && finiteStatValues(snapshot.stats || [], true)
})
const skillTreeValid = computed(() => skillTree.value.length <= 128
  && new Set(skillTree.value.map(item => `${item.kind}:${item.id}`)).size === skillTree.value.length
  && skillTree.value.every(item => {
    const catalog = item.kind === 'active' ? options.value.skills : options.value.skillPassives
    const option = catalog.find(candidate => candidate.id === item.id)
    const maximum = catalogSkillMaximum(option)
    const levelIsValid = maximum === 0
      ? item.level === 0
      : item.level > 0 && item.level <= maximum
    return Boolean(option && selectedLineageIds.value.has(item.treeArchetype)
      && item.treeArchetypeSource === 'user-confirmed'
      && Number.isInteger(item.level)
      && levelIsValid)
  }))

const validation = computed(() => ({
  title: title.value.trim().length >= 2,
  archetype: Boolean(archetype.value),
  difficulty: options.value.difficulties.includes(difficulty.value),
  summary: summary.value.trim().length >= 5,
  skills: selectedSkills.value.length > 0
    && selectedSkills.value.length <= 8
    && selectedSkillItems.value.length === selectedSkills.value.length
    && selectedSkillItems.value.every(item => isPlayerSkillCandidate(item)
      && (matchesSkillLineage(item) || (manuallyConfirmedSkills.value.has(item.id) && canManuallyConfirmSkill(item)))),
  equipment: equipmentSelectionsValid.value,
  artifacts: artifactSelectionsValid.value,
  grimoires: grimoireSelectionsValid.value,
  character: characterValid.value,
  skillTree: skillTreeValid.value,
  tags: !tagsValidationError.value,
  guide: !guideValidationError.value
}))
const isValid = computed(() => Object.values(validation.value).every(Boolean))
const contentLimitError = computed(() => tagsValidationError.value || guideValidationError.value)

function applyInitialArchetype() {
  if (archetype.value || !options.value.archetypes.length) return
  const requested = typeof route.query.archetype === 'string' ? route.query.archetype : ''
  const match = options.value.archetypes.find(item => item.id === requested || item.slug === requested)
  archetype.value = match?.id || ''
}
watch(() => options.value.archetypes, applyInitialArchetype, { immediate: true })
watch(() => options.value.difficulties, values => {
  if (values.length && !values.includes(difficulty.value)) difficulty.value = values[0]
}, { immediate: true })
watch(archetype, (next, previous) => {
  compatibilityNotice.value = ''
  if (!next || next === previous) return
  const target = options.value.archetypes.find(item => item.id === next || item.slug === next)
  if (!target) return
  const incompatibleEquipment = new Set(equipmentSelections.value.filter(item => {
    const option = options.value.equipment.find(candidate => candidate.id === item.id)
    return !option || !matchesEquipmentArchetype(option, target)
  }).map(item => item.slotKey))
  const incompatibleSkills = new Set(selectedSkillItems.value
    .filter(item => manuallyConfirmedSkills.value.has(item.id) || !matchesSkillLineage(item, target))
    .map(item => item.id))
  const incompatibleGrimoires = new Set(grimoireSelections.value.filter(item => {
    const option = options.value.grimoires.find(candidate => candidate.id === item.id)
    return !option || !matchesEquipmentArchetype(option, target)
  }).map(item => item.slotIndex))
  const nextLineage = new Set(archetypeLineage(target).map(item => item.id))
  const incompatibleTree = new Set(skillTree.value.filter(item => !nextLineage.has(item.treeArchetype)).map(item => `${item.kind}:${item.id}`))
  if (!incompatibleEquipment.size && !incompatibleSkills.size && !incompatibleGrimoires.size && !incompatibleTree.size) return
  equipmentSelections.value = equipmentSelections.value.filter(item => !incompatibleEquipment.has(item.slotKey))
  selectedSkills.value = selectedSkills.value.filter(id => !incompatibleSkills.has(id))
  manuallyConfirmedSkills.value = new Set()
  grimoireSelections.value = grimoireSelections.value.filter(item => !incompatibleGrimoires.has(item.slotIndex))
  skillTree.value = skillTree.value.filter(item => !incompatibleTree.has(`${item.kind}:${item.id}`))
  compatibilityNotice.value = t('builder.removedIncompatibleSelections', {
    count: incompatibleEquipment.size + incompatibleSkills.size + incompatibleGrimoires.size + incompatibleTree.size,
    class: optionName(target)
  })
}, { flush: 'post' })

function archetypeIdentifiers(target?: BuilderOption) {
  if (!target) return []
  return [...new Set([
    target.id,
    target.slug,
    target.displayName,
    optionName(target),
    localizedText(target.name, 'zh'),
    localizedText(target.name, 'en')
  ].filter(Boolean).map(value => value.toLocaleLowerCase('en-US')))]
}

function findArchetype(reference?: string | null) {
  if (!reference) return undefined
  const wanted = reference.toLocaleLowerCase('en-US')
  return options.value.archetypes.find(item => archetypeIdentifiers(item).includes(wanted))
}

function archetypeLineage(target?: BuilderOption) {
  const lineage: BuilderOption[] = []
  const seen = new Set<string>()
  let current = target
  while (current) {
    const currentKey = current.id.toLocaleLowerCase('en-US')
    if (seen.has(currentKey)) break
    lineage.push(current)
    seen.add(currentKey)
    current = findArchetype(current.requiredClassId)
  }
  return lineage
}

function relationMatches(values: NonNullable<BuilderOption['allowedArchetypes']> | string[], target?: BuilderOption) {
  const wanted = new Set(archetypeIdentifiers(target))
  if (!wanted.size) return false
  return values.some(value => {
    const token = typeof value === 'string' ? value : (value.value || value.label || '')
    return wanted.has(token.toLocaleLowerCase('en-US'))
  })
}

function skillRelationValues(item: BuilderOption) {
  const previewed = (item as BuilderOption & { previewedByArchetypes?: string[] }).previewedByArchetypes || []
  return [...(item.allowedArchetypes || []), ...(item.recommendedArchetypes || []), ...previewed]
}

function idPrefixArchetype(item: BuilderOption) {
  const prefix = item.id.split('_')[0]
  return findArchetype(prefix)
}

function isPlayerSkillCandidate(item: BuilderOption) {
  if (skillRelationValues(item).length) return true
  return !/^(npc|enemy|monster|mob|boss)[_.-]/i.test(item.id)
    && !/(enemy|summon)$/i.test(item.id)
    && !/^gamemaster/i.test(item.id)
    && !['gamemaster', 'bothunter', 'bossprotocol'].includes(canonicalSlot(item.id))
}

function matchesSkillArchetype(item: BuilderOption, target = selectedArchetype.value) {
  if (!target || !isPlayerSkillCandidate(item)) return false
  const relations = skillRelationValues(item)
  if (relations.length && relationMatches(relations, target)) return true
  const prefixed = idPrefixArchetype(item)
  return Boolean(prefixed && canonicalSlot(prefixed.id) === canonicalSlot(target.id))
}

function matchesSkillLineage(item: BuilderOption, target = selectedArchetype.value) {
  return archetypeLineage(target).some(candidate => matchesSkillArchetype(item, candidate))
}

function canManuallyConfirmSkill(item: BuilderOption) {
  // Manual confirmation exists for source skills with no extracted ownership
  // relation. A skill already linked (or ID-prefixed) to another known class is
  // not "unlinked" and must not be silently reassigned to this build.
  return skillRelationValues(item).length === 0 && !idPrefixArchetype(item)
}

function matchesEquipmentArchetype(item: BuilderOption, target = selectedArchetype.value) {
  const allowed = item.allowedArchetypes || []
  const restricted = item.hasArchetypeRestriction ?? allowed.length > 0
  if (!target || !restricted || !allowed.length) return true
  return archetypeLineage(target).some(candidate => relationMatches(allowed, candidate))
}

function isRecommended(item: BuilderOption) {
  const recommended = item.recommendedArchetypes || []
  return Boolean(selectedArchetype.value && recommended.length && archetypeLineage(selectedArchetype.value).some(candidate => relationMatches(recommended, candidate)))
}

function toggleSkill(id: string) {
  if (selectedSkills.value.includes(id)) {
    selectedSkills.value = selectedSkills.value.filter(value => value !== id)
    const nextManual = new Set(manuallyConfirmedSkills.value)
    nextManual.delete(id)
    manuallyConfirmedSkills.value = nextManual
    return
  }
  if (selectedSkills.value.length >= 8) {
    submitError.value = t('builder.selectionLimit', { item: t('builder.skills'), limit: 8 })
    return
  }
  submitError.value = ''
  const item = options.value.skills.find(candidate => candidate.id === id)
  if (item && !matchesSkillLineage(item)) {
    if (!canManuallyConfirmSkill(item)) {
      submitError.value = t('builder.incompatibleSelectionError')
      return
    }
    const nextManual = new Set(manuallyConfirmedSkills.value)
    nextManual.add(id)
    manuallyConfirmedSkills.value = nextManual
  }
  selectedSkills.value = [...selectedSkills.value, id]
}

function clearSelectedSkills() {
  selectedSkills.value = []
  manuallyConfirmedSkills.value = new Set()
}

function strictStat(item: BuildStatValue) {
  return {
    type: item.type,
    value: item.value,
    ...(item.bonus !== undefined ? { bonus: item.bonus } : {}),
    ...(item.unit ? { unit: item.unit } : {}),
    ...(item.subjectId ? { subjectId: item.subjectId } : {})
  }
}

function strictCharacter(snapshot: BuildCharacterSnapshot) {
  return {
    ...(snapshot.name ? { name: snapshot.name.trim() } : {}),
    ...(snapshot.level !== undefined ? { level: snapshot.level } : {}),
    ...(snapshot.jobLevel !== undefined ? { jobLevel: snapshot.jobLevel } : {}),
    ...(snapshot.stance ? { stance: snapshot.stance } : {}),
    stats: (snapshot.stats || []).map(strictStat)
  }
}

function equipmentPreviewName(item: BuildEquipment) {
  return locale.value === 'en' ? (item.nameEn || item.name || item.nameZh) : (item.nameZh || item.name || item.nameEn)
}

async function submitBuild() {
  submitError.value = ''
  if (contentLimitError.value) {
    submitError.value = contentLimitError.value
    return
  }
  if (!isValid.value || submitting.value) {
    submitError.value = t('builder.validationError')
    return
  }
  submitting.value = true
  try {
    const created = await $fetch<Build>(`${api}/api/builds`, {
      method: 'POST',
      body: {
        title: title.value.trim(),
        archetype: selectedArchetype.value?.id || archetype.value,
        difficulty: difficulty.value,
        summary: summary.value.trim(),
        guide: [],
        ...(guideTextLength.value ? { guideHtml: guideHtml.value } : {}),
        tags: tags.value,
        snapshotVersion: 1,
        ...(character.value ? { character: strictCharacter(character.value) } : {}),
        skills: selectedSkills.value.map(id => ({ id })),
        skillTree: skillTree.value.map(item => ({
          kind: item.kind,
          id: item.id,
          level: item.level,
          treeArchetype: item.treeArchetype
        })),
        equipment: equipmentSelections.value.map(item => ({
          id: item.id,
          ...(item.slot ? { slot: item.slot } : {}),
          slotKey: item.slotKey,
          ...(item.refineLevel !== undefined ? { refineLevel: item.refineLevel } : {}),
          ...(item.potential !== undefined ? { potential: item.potential } : {}),
          actualAffixes: (item.actualAffixes || []).map(strictStat),
          cards: (item.cards || []).map(card => ({ slotIndex: card.slotIndex, id: card.id }))
        })),
        artifacts: artifactSelections.value.map(item => ({
          slot: item.slot,
          partIndex: item.partIndex,
          id: item.id,
          ...(item.refineLevel !== undefined ? { refineLevel: item.refineLevel } : {}),
          actualAffixes: (item.actualAffixes || []).map(strictStat),
          ...(item.gem ? { gem: { id: item.gem.id } } : {})
        })),
        grimoires: grimoireSelections.value.map(item => ({ slotIndex: item.slotIndex, id: item.id }))
      }
    })
    await navigateTo(localePath(`/builds/${encodeURIComponent(created.slug)}`))
  } catch (caught: any) {
    const statusCode = caught?.statusCode || caught?.response?.status
    const errorCode = caught?.data?.code || caught?.response?._data?.code
    submitError.value = statusCode === 409
      ? t('builder.duplicateTitle')
      : errorCode === 'EQUIPMENT_ARCHETYPE_MISMATCH' || errorCode === 'SKILL_ARCHETYPE_MISMATCH'
        ? t('builder.incompatibleSelectionError')
        : t('builder.saveFailed')
  } finally {
    submitting.value = false
  }
}

useSeoMeta({ title: () => t('builder.seoTitle'), description: () => t('builder.seoDescription') })
</script>

<template>
  <main class="page builder-page">
    <div class="page-head builder-page__head"><span class="section-kicker">{{ t('builder.kicker') }}</span><h1>{{ t('builder.title') }}</h1><p>{{ t('builder.subtitle') }}</p></div>

    <section v-if="status === 'pending'" class="database-state"><span class="database-state__mark">…</span><h2>{{ t('builder.loadingTitle') }}</h2><p>{{ t('builder.loadingDescription') }}</p></section>
    <section v-else-if="error" class="database-state database-state--error"><span class="database-state__mark">!</span><h2>{{ t('builder.loadErrorTitle') }}</h2><p>{{ t('builder.loadErrorDescription') }}</p><button type="button" @click="refresh">{{ t('common.reload') }}</button></section>

    <form v-else class="builder-layout" @submit.prevent="submitBuild">
      <div class="builder-editor">
        <section class="builder-step">
          <header><span>01</span><div><h2>{{ t('builder.basicsTitle') }}</h2><p>{{ t('builder.basicsDescription') }}</p></div></header>
          <div class="builder-fields">
            <label class="builder-field builder-field--wide"><span>{{ t('builder.name') }} <b>*</b></span><input v-model="title" maxlength="100" :placeholder="t('builder.namePlaceholder')"><small :class="{ valid: validation.title }">{{ t('builder.minChars', { min: 2, count: title.length, max: 100 }) }}</small></label>
            <label class="builder-field"><span>{{ t('builder.class') }} <b>*</b></span><select v-model="archetype"><option value="">{{ t('builder.chooseClass') }}</option><option v-for="item in options.archetypes" :key="item.id" :value="item.id">{{ optionName(item) }}</option></select></label>
            <label class="builder-field"><span>{{ t('builder.difficulty') }} <b>*</b></span><select v-model="difficulty"><option v-for="level in options.difficulties" :key="level" :value="level">{{ difficultyText(level) }}</option></select></label>
            <label class="builder-field builder-field--wide"><span>{{ t('builder.summary') }} <b>*</b></span><textarea v-model="summary" maxlength="600" rows="4" :placeholder="t('builder.summaryPlaceholder')"></textarea><small :class="{ valid: validation.summary }">{{ t('builder.minChars', { min: 5, count: summary.length, max: 600 }) }}</small></label>
            <label class="builder-field"><span>{{ t('builder.tags') }}</span><input v-model="tagsInput" :placeholder="t('builder.tagsPlaceholder')"><small :class="{ valid: validation.tags, invalid: !validation.tags }">{{ t('builder.tagCount', { count: tags.length, max: maxTags }) }}<template v-if="tagsValidationError"> · {{ tagsValidationError }}</template></small></label>
            <div class="builder-field builder-field--wide"><span>{{ t('builder.guideSteps') }}</span><RichTextEditor v-model="guideHtml" :max-length="maxGuideLength" :aria-label="t('builder.guideSteps')" :placeholder="t('builder.guidePlaceholder')" @update:text-length="guideTextLength = $event"/><small :class="{ valid: validation.guide, invalid: !validation.guide }"><template v-if="guideValidationError">{{ guideValidationError }}</template></small></div>
          </div>
        </section>

        <section class="builder-step">
          <header><span>02</span><div><h2>{{ t('builder.chooseSkills') }} <b>*</b></h2><p>{{ t('builder.skillsSelected', { count: selectedSkills.length, max: 8 }) }}</p></div><button v-if="selectedSkills.length" type="button" @click="clearSelectedSkills">{{ t('common.clear') }}</button></header>
          <div class="builder-skill-catalog-mode" :aria-label="t('builder.chooseSkills')">
            <button type="button" :class="{ selected: !showFullSkillCatalog }" :aria-pressed="!showFullSkillCatalog" @click="showFullSkillCatalog = false">{{ t('builder.verifiedSkillCatalog') }}</button>
            <button type="button" :class="{ selected: showFullSkillCatalog }" :aria-pressed="showFullSkillCatalog" @click="showFullSkillCatalog = true">{{ t('builder.fullSkillCatalog') }}</button>
          </div>
          <p class="builder-skill-catalog-hint">{{ showFullSkillCatalog ? t('builder.fullSkillCatalogHint') : t('builder.verifiedSkillCatalogHint') }}</p>
          <label class="builder-option-search"><span aria-hidden="true">⌕</span><input v-model="skillSearch" type="search" :aria-label="t('builder.skillSearchPlaceholder')" :placeholder="t('builder.skillSearchPlaceholder')"></label>
          <div v-if="filteredSkills.length" class="builder-option-grid">
            <button v-for="item in filteredSkills" :key="item.id" type="button" :class="{ selected: selectedSkills.includes(item.id), recommended: isRecommended(item) }" :aria-pressed="selectedSkills.includes(item.id)" @click="toggleSkill(item.id)"><ClassIcon :item="item" kind="skill" size="small"/><span><strong>{{ optionName(item) }} <em v-if="isRecommended(item)">{{ t('builder.recommended') }}</em></strong><small>{{ item.id }}</small></span><b>{{ selectedSkills.includes(item.id) ? '✓' : '+' }}</b></button>
          </div>
          <p v-else class="builder-no-options">{{ showFullSkillCatalog && !skillSearch.trim() ? t('builder.fullSkillCatalogSearch') : t('builder.noSkills') }}</p>
          <p v-if="filteredSkills.length === 80" class="builder-limit-note">{{ t('builder.skillLimitNote') }}</p>
        </section>

        <section class="builder-step builder-step--snapshot">
          <header><span>03</span><div><h2>{{ t('builder.loadout.editor.completeSnapshot') }}</h2><p>{{ t('builder.loadout.editor.completeSnapshotHint') }}</p></div></header>
          <p v-if="compatibilityNotice" class="builder-compatibility-notice" role="status">{{ compatibilityNotice }}</p>
          <BuildSnapshotEditor
            :options="options"
            :archetype="selectedArchetype"
            :equipment-selections="equipmentSelections"
            :artifact-selections="artifactSelections"
            :grimoire-selections="grimoireSelections"
            :character="character"
            :skill-tree="skillTree"
            @update:equipment-selections="equipmentSelections = $event"
            @update:artifact-selections="artifactSelections = $event"
            @update:grimoire-selections="grimoireSelections = $event"
            @update:character="character = $event"
            @update:skill-tree="skillTree = $event"
          />
        </section>
      </div>

      <aside class="builder-preview-wrap">
        <section class="builder-preview">
          <header><span>{{ t('builder.livePreview') }}</span><b>{{ t('builder.community') }}</b></header>
          <div class="builder-preview__class"><ClassIcon v-if="selectedArchetype" :item="selectedArchetype" size="medium"/><span v-else class="builder-preview__empty-icon">?</span><div><small>{{ selectedArchetype ? optionName(selectedArchetype) : t('builder.noClassSelected') }}</small><h2>{{ title.trim() || t('builder.untitled') }}</h2><p>{{ t('builder.difficultyValue', { value: difficultyText(difficulty) }) }}</p></div></div>
          <p class="builder-preview__summary">{{ summary.trim() || t('builder.previewSummary') }}</p>
          <div class="builder-preview__section"><span>{{ t('builder.skillsCount', { count: selectedSkillItems.length }) }}</span><div v-if="selectedSkillItems.length" class="builder-preview__tokens"><i v-for="item in selectedSkillItems" :key="item.id">{{ optionName(item) }}</i></div><p v-else>{{ t('builder.selectOneSkill') }}</p></div>
          <div class="builder-preview__section"><span>{{ t('builder.equipmentCount', { count: selectedEquipmentItems.length }) }}</span><div v-if="selectedEquipmentItems.length" class="builder-preview__gear"><div v-for="item in selectedEquipmentItems" :key="item.slotKey"><img v-if="item.icon" :src="item.icon" alt=""><span v-else aria-hidden="true">+</span><b>{{ equipmentPreviewName(item) }}</b></div></div><p v-else>{{ t('builder.noEquipmentSelected') }}</p></div>
          <div v-if="tags.length" class="builder-preview__tags"><span v-for="tag in tags" :key="tag"># {{ tag }}</span></div>
          <ul class="builder-checklist"><li :class="{ done:validation.title }">{{ t('builder.checkTitle') }}</li><li :class="{ done:validation.archetype }">{{ t('builder.checkClass') }}</li><li :class="{ done:validation.summary }">{{ t('builder.checkSummary') }}</li><li :class="{ done:validation.skills }">{{ t('builder.checkSkills') }}</li><li :class="{ done: validation.equipment && validation.artifacts && validation.grimoires && validation.character && validation.skillTree }">{{ t('builder.checkSnapshot') }}</li></ul>
          <p v-if="contentLimitError" class="builder-submit-error" role="alert">{{ contentLimitError }}</p>
          <p v-if="submitError" class="builder-submit-error" role="alert">{{ submitError }}</p>
          <button class="builder-submit" type="submit" :disabled="submitting || !isValid"><span v-if="submitting">{{ t('builder.saving') }}</span><span v-else>{{ t('builder.publish') }}</span></button>
          <small class="builder-submit-note">{{ t('builder.publishNote') }}</small>
        </section>
      </aside>
    </form>
  </main>
</template>

<style scoped>
.builder-skill-catalog-mode { width: fit-content; display: flex; gap: 4px; margin-bottom: 8px; padding: 4px; border-radius: 11px; background: #eaf1ee; }
.builder-skill-catalog-mode button { min-height: 40px; padding: 8px 12px; border: 0; border-radius: 8px; color: #60746f; background: transparent; cursor: pointer; font-size: 11px; font-weight: 800; }
.builder-skill-catalog-mode button.selected { color: #fff; background: #168d7e; }
.builder-skill-catalog-hint { margin: 0 0 10px; color: #667c77; font-size: 11px; line-height: 1.55; }
.builder-skill-catalog-mode button:focus-visible { outline: 3px solid rgba(22, 141, 126, .28); outline-offset: 2px; }
.builder-preview__gear img,
.builder-preview__gear > div > span {
  width: 30px;
  height: 30px;
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  object-fit: contain;
  border-radius: 8px;
  color: #238a7d;
  background: #e5f2ee;
  font-size: 12px;
  font-weight: 800;
}
</style>
