<script setup lang="ts">
import type { EquipmentListResponse, EquipmentFacets, FacetOption } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()
const { slotText, typeText, elementText } = useGameLocale()

const queryText = (value: unknown) => typeof value === 'string' ? value : ''
const textFromQuery = (key: string) => queryText(route.query[key])
const numberFromQuery = (key: string, fallback: number) => {
  const value = Number(queryText(route.query[key]))
  return Number.isInteger(value) && value > 0 ? value : fallback
}

const searchInput = ref(textFromQuery('q').trim())
const q = ref(searchInput.value)
const archetype = ref(textFromQuery('archetype'))
const slot = ref(textFromQuery('slot'))
const type = ref(textFromQuery('type'))
const element = ref(textFromQuery('element'))
const level = ref(textFromQuery('level'))
const setId = ref(textFromQuery('setId'))
const page = ref(numberFromQuery('page', 1))
const pageSize = ref(24)
const routeQueryKeys = ['q', 'archetype', 'slot', 'type', 'element', 'level', 'setId', 'page'] as const
let restoringRouteQuery = false

const stateRouteQuery = computed<Record<string, string>>(() => ({
  ...(q.value ? { q: q.value } : {}),
  ...(archetype.value ? { archetype: archetype.value } : {}),
  ...(slot.value ? { slot: slot.value } : {}),
  ...(type.value ? { type: type.value } : {}),
  ...(element.value ? { element: element.value } : {}),
  ...(level.value ? { level: level.value } : {}),
  ...(setId.value ? { setId: setId.value } : {}),
  ...(page.value > 1 ? { page: String(page.value) } : {})
}))

function routeQueryMatches(next: Record<string, string>) {
  return routeQueryKeys.every((key) => {
    const expected = next[key]
    const current = route.query[key]
    return expected === undefined ? current === undefined : typeof current === 'string' && current === expected
  })
}

function syncRouteQuery(next: Record<string, string>) {
  if (!import.meta.client || restoringRouteQuery || routeQueryMatches(next)) return
  const nextQuery = { ...route.query }
  for (const key of routeQueryKeys) delete nextQuery[key]
  Object.assign(nextQuery, next)
  void router.replace({ path: route.path, query: nextQuery, hash: route.hash })
}

watch(stateRouteQuery, syncRouteQuery, { flush: 'post' })
onMounted(() => syncRouteQuery(stateRouteQuery.value))

watch(() => route.query, (query) => {
  const next = {
    q: queryText(query.q).trim(),
    archetype: queryText(query.archetype),
    slot: queryText(query.slot),
    type: queryText(query.type),
    element: queryText(query.element),
    level: queryText(query.level),
    setId: queryText(query.setId),
    page: (() => {
      const value = Number(queryText(query.page))
      return Number.isInteger(value) && value > 0 ? value : 1
    })()
  }
  if (q.value === next.q && archetype.value === next.archetype && slot.value === next.slot
    && type.value === next.type && element.value === next.element && level.value === next.level
    && setId.value === next.setId && page.value === next.page && searchInput.value === next.q) return

  restoringRouteQuery = true
  if (searchTimer) clearTimeout(searchTimer)
  searchInput.value = next.q
  q.value = next.q
  archetype.value = next.archetype
  slot.value = next.slot
  type.value = next.type
  element.value = next.element
  level.value = next.level
  setId.value = next.setId
  page.value = next.page
  restoringRouteQuery = false
}, { deep: true, flush: 'sync' })

const emptyFacets = (): EquipmentFacets => ({
  categories: [], archetypes: [], slots: [], types: [], elements: [], levels: [], sets: []
})

const equipmentQuery = computed(() => ({
  ...(q.value ? { q: q.value } : {}),
  ...(archetype.value ? { archetype: archetype.value } : {}),
  ...(slot.value ? { slot: slot.value } : {}),
  ...(type.value ? { type: type.value } : {}),
  ...(element.value ? { element: element.value } : {}),
  ...(level.value ? { level: level.value } : {}),
  ...(setId.value ? { setId: setId.value } : {}),
  page: page.value,
  pageSize: pageSize.value
}))

const { data, status, error, refresh } = await useFetch<EquipmentListResponse>(`${api}/api/equipment`, {
  query: equipmentQuery,
  default: () => ({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 0, facets: emptyFacets() })
})

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (value) => {
  if (restoringRouteQuery) return
  if (searchTimer) clearTimeout(searchTimer)
  if (value.trim() === q.value) return
  searchTimer = setTimeout(() => {
    q.value = value.trim()
    page.value = 1
  }, 280)
}, { flush: 'sync' })
onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer) })

watch([archetype, slot, type, element, level, setId], () => {
  if (!restoringRouteQuery) page.value = 1
}, { flush: 'sync' })

const totalPages = computed(() => data.value.totalPages || Math.ceil(data.value.total / pageSize.value))
watch(totalPages, (value) => {
  if (value > 0 && page.value > value) page.value = value
})

const pageNumbers = computed(() => {
  const total = totalPages.value
  if (!total) return []
  let start = Math.max(1, page.value - 2)
  const end = Math.min(total, start + 4)
  start = Math.max(1, end - 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const facetGroups = computed(() => [
  { key: 'archetype', label: t('equipment.archetype'), model: archetype, options: data.value.facets?.archetypes || [] },
  { key: 'slot', label: t('equipment.slot'), model: slot, options: data.value.facets?.slots || [] },
  { key: 'type', label: t('equipment.type'), model: type, options: data.value.facets?.types || [] },
  { key: 'element', label: t('equipment.element'), model: element, options: data.value.facets?.elements || [] },
  { key: 'level', label: t('equipment.levelRequired'), model: level, options: data.value.facets?.levels || [] },
  { key: 'setId', label: t('equipment.set'), model: setId, options: data.value.facets?.sets || [] }
] as Array<{ key: string; label: string; model: Ref<string>; options: FacetOption[] }>)

const activeFilters = computed(() => facetGroups.value.filter(group => group.model.value))
function facetOptionLabel(group: typeof facetGroups.value[number], option: FacetOption) {
  if (group.key === 'slot') return slotText(option.value)
  if (group.key === 'type') return typeText(option.value)
  if (group.key === 'element') return elementText(option.value)
  return option.label || option.value
}
const selectedLabel = (group: typeof facetGroups.value[number]) => {
  const selected = group.options.find(option => option.value === group.model.value)
  return selected ? facetOptionLabel(group, selected) : group.model.value
}

function resetFilters() {
  searchInput.value = ''
  q.value = ''
  for (const group of facetGroups.value) group.model.value = ''
  page.value = 1
}

function setPage(value: number) {
  page.value = Math.min(Math.max(value, 1), totalPages.value || 1)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

useSeoMeta({
  title: () => t('equipment.seoTitle'),
  description: () => t('equipment.seoDescription')
})
</script>

<template>
  <main class="page equipment-page">
    <div class="page-head equipment-page__head">
      <span class="section-kicker">{{ t('equipment.kicker') }}</span>
      <h1>{{ t('equipment.title') }}</h1>
      <p>{{ t('equipment.subtitle') }}</p>
    </div>

    <section class="equipment-toolbar" :aria-label="t('equipment.filtersAria')">
      <div class="equipment-search-row">
        <label class="equipment-search">
          <span aria-hidden="true">⌕</span>
          <input v-model="searchInput" type="search" :placeholder="t('equipment.searchPlaceholder')" :aria-label="t('equipment.searchAria')" autocomplete="off">
        </label>
        <button v-if="q || activeFilters.length" class="filter-reset" type="button" @click="resetFilters">{{ t('common.clear') }}</button>
      </div>
      <div class="equipment-filters">
        <label v-for="group in facetGroups" :key="group.key">
          <span>{{ group.label }}</span>
          <select v-model="group.model.value">
            <option value="">{{ t('equipment.allFacet', { facet: group.label }) }}</option>
            <option v-for="option in group.options" :key="option.value" :value="option.value">
              {{ facetOptionLabel(group, option) }} ({{ option.count }})
            </option>
          </select>
        </label>
      </div>
      <div v-if="activeFilters.length" class="active-filter-row" :aria-label="t('equipment.activeFilters')">
        <span>{{ t('equipment.activeFilters') }}</span>
        <button v-for="group in activeFilters" :key="group.key" type="button" @click="group.model.value = ''">
          {{ group.label }}: {{ selectedLabel(group) }} <b aria-hidden="true">×</b>
        </button>
      </div>
    </section>

    <div class="result-summary" aria-live="polite">
      <span v-if="status === 'pending'">{{ t('equipment.querying') }}</span>
      <span v-else>{{ t('equipment.foundPrefix') }} <strong>{{ data.total.toLocaleString(locale) }}</strong> {{ t('equipment.foundSuffix') }}</span>
      <small v-if="data.total">{{ t('common.page', { page: data.page, pages: totalPages }) }}</small>
    </div>

    <div v-if="status === 'pending' && !data.items.length" class="equipment-grid" :aria-label="t('common.loading')">
      <div v-for="index in 8" :key="index" class="equipment-card equipment-card--skeleton"><i/><b/><span/><span/></div>
    </div>

    <section v-else-if="error" class="database-state database-state--error">
      <span class="database-state__mark">!</span>
      <h2>{{ t('equipment.loadError') }}</h2>
      <p>{{ error.statusCode === 404 ? t('equipment.apiUnavailable') : t('equipment.loadErrorHint') }}</p>
      <button type="button" @click="refresh">{{ t('common.reload') }}</button>
    </section>

    <section v-else-if="!data.items.length" class="database-state">
      <span class="database-state__mark">0</span>
      <h2>{{ t('equipment.noResults') }}</h2>
      <p>{{ t('equipment.noResultsHint') }}</p>
      <button type="button" @click="resetFilters">{{ t('equipment.viewAll') }}</button>
    </section>

    <div v-else class="equipment-grid" :class="{ 'is-refreshing': status === 'pending' }">
      <EquipmentCard v-for="item in data.items" :key="item.slug" :item="item" :search-term="q" />
    </div>

    <nav v-if="totalPages > 1" class="pagination" :aria-label="t('equipment.paginationAria')">
      <button type="button" :disabled="page <= 1 || status === 'pending'" :aria-label="t('common.previous')" @click="setPage(page - 1)">←</button>
      <button v-for="number in pageNumbers" :key="number" type="button" :class="{ active: number === page }" :aria-current="number === page ? 'page' : undefined" :disabled="status === 'pending'" @click="setPage(number)">{{ number }}</button>
      <button type="button" :disabled="page >= totalPages || status === 'pending'" :aria-label="t('common.next')" @click="setPage(page + 1)">→</button>
    </nav>
  </main>
</template>
