<script setup lang="ts">
import type { Build, BuilderOption, BuilderOptions, Equipment, EquipmentListResponse, EquipmentValue } from '~/composables/useApi'
import { localizedText } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const { t, locale } = useI18n()
const { gameText, difficultyText, categoryText, slotText, typeText, statText } = useGameLocale()
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
const selectedEquipment = ref<string[]>([])
const skillSearch = ref('')
const equipmentSearchInput = ref('')
const equipmentSearch = ref('')
const equipmentCategory = ref('')
const selectedEquipmentDetails = ref<Record<string, Equipment>>({})
const submitting = ref(false)
const submitError = ref('')
const compatibilityNotice = ref('')

const optionName = (item?: BuilderOption | Equipment | null) => gameText(item?.name, item?.displayName || item?.id || t('builder.unnamedEntry'))
const selectedArchetype = computed(() => options.value.archetypes.find(item => item.id === archetype.value || item.slug === archetype.value))
const selectedSkillItems = computed(() => selectedSkills.value.map(id => options.value.skills.find(item => item.id === id)).filter(Boolean) as BuilderOption[])
const equipmentQuery = computed(() => ({
  ...(equipmentSearch.value.trim() ? { q: equipmentSearch.value.trim() } : {}),
  ...(equipmentCategory.value ? { category: equipmentCategory.value } : {}),
  ...(archetype.value ? { archetype: archetype.value, compatible: 'true' } : {}),
  pageSize: 80
}))
const emptyEquipmentResponse = (): EquipmentListResponse => ({
  items: [], total: 0, page: 1, pageSize: 80, totalPages: 0,
  facets: { categories: [], archetypes: [], slots: [], types: [], elements: [], levels: [], sets: [] }
})
const { data: equipmentResponse, status: equipmentStatus, error: equipmentError } = await useFetch<EquipmentListResponse>(`${api}/api/equipment`, {
  query: equipmentQuery,
  default: emptyEquipmentResponse,
  watch: [equipmentQuery]
})
const equipmentById = computed(() => {
  const entries = new Map<string, Equipment>()
  for (const item of options.value.equipment) entries.set(item.id, item as Equipment)
  for (const item of Object.values(selectedEquipmentDetails.value)) entries.set(item.id, item)
  for (const item of equipmentResponse.value.items) entries.set(item.id, item)
  return entries
})
const selectedEquipmentItems = computed(() => selectedEquipment.value.map(id => equipmentById.value.get(id)).filter(Boolean) as Equipment[])
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

const equipmentCategories = computed(() => {
  const source = equipmentResponse.value.facets.categories.map(item => item.value)
  const fallback = options.value.equipment.map(item => item.category).filter(Boolean) as string[]
  return [...new Set([...source, ...fallback])].sort((a, b) => a.localeCompare(b, locale.value))
})
const filteredSkills = computed(() => {
  const term = skillSearch.value.trim().toLowerCase()
  return options.value.skills
    .filter(item => matchesSkillArchetype(item) && (!term || `${item.id} ${item.slug} ${optionName(item)} ${localizedText(item.name,'zh')} ${localizedText(item.name,'en')}`.toLowerCase().includes(term)))
    .sort((left, right) => Number(isRecommended(right)) - Number(isRecommended(left)))
    .slice(0, 80)
})
const filteredEquipment = computed(() => equipmentResponse.value.items)
const equipmentResultCount = computed(() => equipmentResponse.value.total)

const validation = computed(() => ({
  title: title.value.trim().length >= 2,
  archetype: Boolean(archetype.value),
  difficulty: options.value.difficulties.includes(difficulty.value),
  summary: summary.value.trim().length >= 5,
  skills: selectedSkills.value.length > 0 && selectedSkills.value.length <= 8 && selectedSkillItems.value.every(item => matchesSkillArchetype(item)),
  equipment: selectedEquipment.value.length <= 12 && selectedEquipmentItems.value.every(item => matchesEquipmentArchetype(item)),
  tags: !tagsValidationError.value,
  guide: !guideValidationError.value
}))
const isValid = computed(() => Object.values(validation.value).every(Boolean))
const contentLimitError = computed(() => tagsValidationError.value || guideValidationError.value)
let equipmentSearchTimer: ReturnType<typeof setTimeout> | undefined

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
watch(equipmentSearchInput, value => {
  if (equipmentSearchTimer) clearTimeout(equipmentSearchTimer)
  equipmentSearchTimer = setTimeout(() => { equipmentSearch.value = value }, 280)
})
watch(() => equipmentResponse.value.items, items => {
  const remembered = { ...selectedEquipmentDetails.value }
  for (const item of items) {
    if (selectedEquipment.value.includes(item.id)) remembered[item.id] = item
  }
  selectedEquipmentDetails.value = remembered
}, { immediate: true })
onBeforeUnmount(() => {
  if (equipmentSearchTimer) clearTimeout(equipmentSearchTimer)
})
watch(archetype, (next, previous) => {
  compatibilityNotice.value = ''
  if (!next || next === previous) return
  const target = options.value.archetypes.find(item => item.id === next || item.slug === next)
  if (!target) return
  const incompatibleEquipment = new Set(selectedEquipmentItems.value.filter(item => !matchesEquipmentArchetype(item, target)).map(item => item.id))
  const incompatibleSkills = new Set(selectedSkillItems.value.filter(item => !matchesSkillArchetype(item, target)).map(item => item.id))
  if (!incompatibleEquipment.size && !incompatibleSkills.size) return
  selectedEquipment.value = selectedEquipment.value.filter(id => !incompatibleEquipment.has(id))
  selectedSkills.value = selectedSkills.value.filter(id => !incompatibleSkills.has(id))
  compatibilityNotice.value = t('builder.removedIncompatibleSelections', {
    count: incompatibleEquipment.size + incompatibleSkills.size,
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

function matchesSkillArchetype(item: BuilderOption, target = selectedArchetype.value) {
  const allowed = item.allowedArchetypes || []
  const restricted = item.hasArchetypeRestriction ?? allowed.length > 0
  if (!target || !restricted || !allowed.length) return true
  return relationMatches(allowed, target)
}

function matchesEquipmentArchetype(item: Equipment, target = selectedArchetype.value) {
  const allowed = item.allowedArchetypes || []
  const restricted = item.hasArchetypeRestriction ?? allowed.length > 0
  if (!target || !restricted || !allowed.length) return true
  return archetypeLineage(target).some(candidate => relationMatches(allowed, candidate))
}

function isRecommended(item: BuilderOption) {
  const recommended = item.recommendedArchetypes || []
  return Boolean(selectedArchetype.value && recommended.length && archetypeLineage(selectedArchetype.value).some(candidate => relationMatches(recommended, candidate)))
}

function toggle(kind: 'skills' | 'equipment', id: string, limit: number) {
  const list = kind === 'skills' ? selectedSkills : selectedEquipment
  if (list.value.includes(id)) {
    list.value = list.value.filter(value => value !== id)
    return
  }
  if (list.value.length >= limit) {
    submitError.value = t('builder.selectionLimit', { item: t(`builder.${kind}`), limit })
    return
  }
  submitError.value = ''
  list.value = [...list.value, id]
}

function toggleEquipment(item: Equipment) {
  if (!selectedEquipment.value.includes(item.id)) {
    selectedEquipmentDetails.value = { ...selectedEquipmentDetails.value, [item.id]: item }
  }
  toggle('equipment', item.id, 12)
}

function equipmentBaseStats(item: Equipment) {
  const separated = [...(item.primaryStats || []), ...(item.secondaryStats || [])]
  return separated.length ? separated : (item.stats || [])
}

function equipmentAffixes(item: Equipment) {
  return item.availableAffixes || item.affixes || []
}

function attributeValue(entry: EquipmentValue) {
  const value = entry.value ?? entry.description
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'object') return String(value)
  const record = value as Record<string, unknown>
  return [
    record.base != null ? t('equipment.baseValue', { value: record.base }) : '',
    record.perLevel != null && Number(record.perLevel) !== 0 ? t('equipment.perLevelValue', { value: record.perLevel }) : '',
    typeof record.string === 'string' ? record.string : '',
    typeof record.string2 === 'string' ? record.string2 : ''
  ].filter(Boolean).join(' · ')
}

function entryLabel(entry: EquipmentValue) {
  return statText(entry.type || entry.label || entry.name) || entry.label || entry.name || ''
}

function matchingAffixes(item: Equipment) {
  const token = equipmentSearch.value.trim().toLocaleLowerCase('en-US')
  if (!token) return []
  return equipmentAffixes(item).filter(entry => JSON.stringify(entry).toLocaleLowerCase('en-US').includes(token))
}

function equipmentAffixPreview(item: Equipment) {
  const matches = matchingAffixes(item)
  return matches.length ? matches.slice(0, 2) : equipmentAffixes(item).slice(0, 1)
}

function equipmentSetName(item: Equipment) {
  return gameText(item.set?.name, item.set?.displayName || '')
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
        skills: selectedSkills.value.map(id => ({ id })),
        equipment: selectedEquipmentItems.value.map(item => ({ id: item.id, ...(item.slot ? { slot: item.slot } : {}) }))
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
          <header><span>02</span><div><h2>{{ t('builder.chooseSkills') }} <b>*</b></h2><p>{{ t('builder.skillsSelected', { count: selectedSkills.length, max: 8 }) }}</p></div><button v-if="selectedSkills.length" type="button" @click="selectedSkills = []">{{ t('common.clear') }}</button></header>
          <label class="builder-option-search"><span aria-hidden="true">⌕</span><input v-model="skillSearch" type="search" :placeholder="t('builder.skillSearchPlaceholder')"></label>
          <div v-if="filteredSkills.length" class="builder-option-grid">
            <button v-for="item in filteredSkills" :key="item.id" type="button" :class="{ selected: selectedSkills.includes(item.id), recommended: isRecommended(item) }" :aria-pressed="selectedSkills.includes(item.id)" @click="toggle('skills',item.id,8)"><ClassIcon :item="item" kind="skill" size="small"/><span><strong>{{ optionName(item) }} <em v-if="isRecommended(item)">{{ t('builder.recommended') }}</em></strong><small>{{ item.id }}</small></span><b>{{ selectedSkills.includes(item.id) ? '✓' : '+' }}</b></button>
          </div>
          <p v-else class="builder-no-options">{{ t('builder.noSkills') }}</p>
          <p v-if="options.skills.length > filteredSkills.length && !skillSearch" class="builder-limit-note">{{ t('builder.skillLimitNote') }}</p>
        </section>

        <section class="builder-step">
          <header><span>03</span><div><h2>{{ t('builder.chooseEquipment') }}</h2><p>{{ t('builder.equipmentSelected', { count: selectedEquipment.length, max: 12 }) }}</p></div><button v-if="selectedEquipment.length" type="button" @click="selectedEquipment = []">{{ t('common.clear') }}</button></header>
          <p v-if="compatibilityNotice" class="builder-compatibility-notice" role="status">{{ compatibilityNotice }}</p>
          <div class="builder-equipment-tools"><label class="builder-option-search"><span aria-hidden="true">⌕</span><input v-model="equipmentSearchInput" type="search" :aria-label="t('builder.equipmentSearchAria')" :placeholder="t('builder.equipmentSearchPlaceholder')"></label><select v-model="equipmentCategory" :aria-label="t('builder.equipmentCategory')"><option value="">{{ t('builder.allCategories') }}</option><option v-for="value in equipmentCategories" :key="value" :value="value">{{ categoryText(value) }}</option></select></div>
          <p class="builder-limit-note" role="status"><template v-if="equipmentStatus === 'pending'">{{ t('builder.equipmentLoading') }}</template><template v-else-if="equipmentError">{{ t('builder.equipmentLoadError') }}</template><template v-else>{{ t('builder.equipmentResultCount', { count: equipmentResultCount }) }}<template v-if="selectedArchetype"> · {{ t('builder.compatibleWithClass', { class: optionName(selectedArchetype) }) }}</template></template></p>
          <div v-if="filteredEquipment.length" class="builder-option-grid builder-option-grid--equipment">
            <button v-for="item in filteredEquipment" :key="item.id" type="button" :class="{ selected: selectedEquipment.includes(item.id) }" :aria-pressed="selectedEquipment.includes(item.id)" @click="toggleEquipment(item)"><EquipmentIcon :item="item" size="small"/><span><strong>{{ optionName(item) }}</strong><small>{{ [slotText(item.slot),typeText(item.type)].filter(Boolean).join(' · ') || item.id }}</small><small v-for="entry in equipmentBaseStats(item).slice(0, 2)" :key="`${item.id}-stat-${entryLabel(entry)}`" class="builder-equipment-fact"><b>{{ entryLabel(entry) }}</b><em v-if="attributeValue(entry)"> {{ attributeValue(entry) }}</em></small><small v-for="entry in equipmentAffixPreview(item)" :key="`${item.id}-affix-${entryLabel(entry)}`" class="builder-equipment-fact builder-equipment-fact--candidate" :class="{ 'builder-equipment-fact--matched': matchingAffixes(item).includes(entry) }"><i>{{ t('builder.possibleAffix') }}</i><b>{{ entryLabel(entry) }}</b><em v-if="attributeValue(entry)"> {{ attributeValue(entry) }}</em></small><small v-if="equipmentSetName(item)" class="builder-equipment-fact builder-equipment-fact--set"><i>{{ t('builder.equipmentSet') }}</i><b>{{ equipmentSetName(item) }}</b></small></span><b>{{ selectedEquipment.includes(item.id) ? '✓' : '+' }}</b></button>
          </div>
          <p v-else class="builder-no-options">{{ t('builder.noEquipment') }}</p>
          <p v-if="equipmentResultCount > filteredEquipment.length" class="builder-limit-note">{{ t('builder.equipmentLimitNote', { count: filteredEquipment.length, total: equipmentResultCount }) }}</p>
        </section>
      </div>

      <aside class="builder-preview-wrap">
        <section class="builder-preview">
          <header><span>{{ t('builder.livePreview') }}</span><b>{{ t('builder.community') }}</b></header>
          <div class="builder-preview__class"><ClassIcon v-if="selectedArchetype" :item="selectedArchetype" size="medium"/><span v-else class="builder-preview__empty-icon">?</span><div><small>{{ selectedArchetype ? optionName(selectedArchetype) : t('builder.noClassSelected') }}</small><h2>{{ title.trim() || t('builder.untitled') }}</h2><p>{{ t('builder.difficultyValue', { value: difficultyText(difficulty) }) }}</p></div></div>
          <p class="builder-preview__summary">{{ summary.trim() || t('builder.previewSummary') }}</p>
          <div class="builder-preview__section"><span>{{ t('builder.skillsCount', { count: selectedSkillItems.length }) }}</span><div v-if="selectedSkillItems.length" class="builder-preview__tokens"><i v-for="item in selectedSkillItems" :key="item.id">{{ optionName(item) }}</i></div><p v-else>{{ t('builder.selectOneSkill') }}</p></div>
          <div class="builder-preview__section"><span>{{ t('builder.equipmentCount', { count: selectedEquipmentItems.length }) }}</span><div v-if="selectedEquipmentItems.length" class="builder-preview__gear"><div v-for="item in selectedEquipmentItems" :key="item.id"><EquipmentIcon :item="item" size="small"/><b>{{ optionName(item) }}</b></div></div><p v-else>{{ t('builder.noEquipmentSelected') }}</p></div>
          <div v-if="tags.length" class="builder-preview__tags"><span v-for="tag in tags" :key="tag"># {{ tag }}</span></div>
          <ul class="builder-checklist"><li :class="{ done:validation.title }">{{ t('builder.checkTitle') }}</li><li :class="{ done:validation.archetype }">{{ t('builder.checkClass') }}</li><li :class="{ done:validation.summary }">{{ t('builder.checkSummary') }}</li><li :class="{ done:validation.skills }">{{ t('builder.checkSkills') }}</li></ul>
          <p v-if="contentLimitError" class="builder-submit-error" role="alert">{{ contentLimitError }}</p>
          <p v-if="submitError" class="builder-submit-error" role="alert">{{ submitError }}</p>
          <button class="builder-submit" type="submit" :disabled="submitting || !isValid"><span v-if="submitting">{{ t('builder.saving') }}</span><span v-else>{{ t('builder.publish') }}</span></button>
          <small class="builder-submit-note">{{ t('builder.publishNote') }}</small>
        </section>
      </aside>
    </form>
  </main>
</template>
