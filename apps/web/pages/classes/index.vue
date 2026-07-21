<script setup lang="ts">
import type { Archetype, ArchetypeLink, ArchetypeListResponse } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const router = useRouter()
const { t, te } = useI18n()
const { gameText } = useGameLocale()
const localePath = useLocalePath()
const queryText = (value: unknown) => typeof value === 'string' ? value : ''
const pageFromQuery = () => {
  const value = Number(queryText(route.query.page))
  return Number.isInteger(value) && value > 0 ? value : 1
}
const searchInput = ref(queryText(route.query.q).trim())
const q = ref(searchInput.value)
const role = ref(queryText(route.query.role))
const stage = ref(queryText(route.query.stage))
const page = ref(pageFromQuery())
const pageSize = ref(24)
const routeQueryKeys = ['q', 'role', 'stage', 'page'] as const
let restoringRouteQuery = false

const stateRouteQuery = computed<Record<string, string>>(() => ({
  ...(q.value ? { q: q.value } : {}),
  ...(role.value ? { role: role.value } : {}),
  ...(stage.value ? { stage: stage.value } : {}),
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
  const nextQ = queryText(query.q).trim()
  const nextRole = queryText(query.role)
  const nextStage = queryText(query.stage)
  const parsedPage = Number(queryText(query.page))
  const nextPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  if (q.value === nextQ && role.value === nextRole && stage.value === nextStage && page.value === nextPage && searchInput.value === nextQ) return

  restoringRouteQuery = true
  if (timer) clearTimeout(timer)
  searchInput.value = nextQ
  q.value = nextQ
  role.value = nextRole
  stage.value = nextStage
  page.value = nextPage
  restoringRouteQuery = false
}, { deep: true, flush: 'sync' })

const archetypeQuery = computed(() => ({
  ...(q.value ? { q: q.value } : {}),
  ...(role.value ? { role: role.value } : {}),
  ...(stage.value ? { stage: stage.value } : {}),
  page: page.value,
  pageSize: pageSize.value
}))
const { data, status, error, refresh } = await useFetch<ArchetypeListResponse>(`${api}/api/archetypes`, {
  query: archetypeQuery,
  default: () => ({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 0, facets: { roles: [], stages: [] } })
})
const { data: allClassData } = await useFetch<ArchetypeListResponse>(`${api}/api/archetypes`, {
  query: { page: 1, pageSize: 100 },
  default: () => ({ items: [], total: 0, page: 1, pageSize: 100, totalPages: 0, facets: { roles: [], stages: [] } })
})
const allClassesById = computed(() => new Map(allClassData.value.items.map(item => [item.id, item])))
const humanizeId = (id: string) => id.replace(/([a-z\d])([A-Z])/g, '$1 $2')
const lineageGroups = computed(() => allClassData.value.items
  .filter(item => item.stage === 'base')
  .map(base => ({
    base,
    advancesTo: (base.advancesToIds || []).map((id): ArchetypeLink => {
      const configured = allClassesById.value.get(id)
      return configured
        ? { ...configured, configPresent: true }
        : { id, slug: '', name: { en: humanizeId(id) }, displayName: humanizeId(id), icon: null, stage: 'advanced', configPresent: false }
    })
  })))
const className = (item: Partial<ArchetypeLink>) => gameText(item.name, item.displayName || item.id || '')

let timer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, value => {
  if (restoringRouteQuery) return
  if (timer) clearTimeout(timer)
  if (value.trim() === q.value) return
  timer = setTimeout(() => { q.value = value.trim(); page.value = 1 }, 260)
}, { flush: 'sync' })
watch([role, stage], () => {
  if (!restoringRouteQuery) page.value = 1
}, { flush: 'sync' })
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

const totalPages = computed(() => data.value.totalPages || Math.ceil(data.value.total / pageSize.value))
watch(totalPages, (value) => {
  if (value > 0 && page.value > value) page.value = value
})
const pageNumbers = computed(() => {
  if (!totalPages.value) return []
  let start = Math.max(1, page.value - 2)
  const end = Math.min(totalPages.value, start + 4)
  start = Math.max(1, end - 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
function clearFilters() { searchInput.value = ''; q.value = ''; role.value = ''; stage.value = ''; page.value = 1 }
function setPage(value: number) {
  page.value = Math.min(Math.max(1, value), totalPages.value || 1)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}
const facetLabel = (value: string, fallback: string) => te(`classes.roles.${value}`) ? t(`classes.roles.${value}`) : fallback
const stageFacetLabel = (value: string, fallback: string) => te(`classes.stages.${value}`) ? t(`classes.stages.${value}`) : fallback

useSeoMeta({ title: () => t('classes.seoTitle'), description: () => t('classes.seoDescription') })
</script>

<template>
  <main class="page classes-page">
    <div class="page-head classes-page__head"><span class="section-kicker">{{ t('classes.kicker') }}</span><h1>{{ t('classes.title') }}</h1><p>{{ t('classes.subtitle') }}</p></div>
    <section class="class-lineage" aria-labelledby="class-lineage-title">
      <div class="section-heading"><div><span class="section-kicker">{{ t('classes.lineageKicker') }}</span><h2 id="class-lineage-title">{{ t('classes.lineageTitle') }}</h2></div><p>{{ t('classes.lineageSource') }}</p></div>
      <div class="class-lineage-grid">
        <article v-for="group in lineageGroups" :key="group.base.id">
          <NuxtLink class="class-lineage__base" :to="localePath(`/classes/${encodeURIComponent(group.base.slug)}`)"><ClassIcon :item="group.base" size="small"/><span><small>{{ t('classes.stages.base') }}</small><strong>{{ className(group.base) }}</strong></span></NuxtLink>
          <span class="class-lineage__arrow" aria-hidden="true">→</span>
          <div class="class-lineage__branches"><template v-for="advanced in group.advancesTo" :key="advanced.id"><NuxtLink v-if="advanced.configPresent" :to="localePath(`/classes/${encodeURIComponent(advanced.slug)}`)"><ClassIcon :item="advanced" size="small"/><span><strong>{{ className(advanced) }}</strong><small>{{ t('classes.jobLevelRequirement', { level: group.base.lineageSource?.advancementJobLevel || 50 }) }}</small></span></NuxtLink><div v-else class="class-lineage__unavailable"><ClassIcon :item="advanced" size="small"/><span><strong>{{ className(advanced) }}</strong><small>{{ t('classes.configNotPresent') }}</small></span></div></template></div>
        </article>
      </div>
      <p class="class-lineage__note">{{ t('classes.specialLineageNote') }}</p>
    </section>
    <section class="class-toolbar" :aria-label="t('classes.filtersAria')">
      <label class="equipment-search"><span aria-hidden="true">⌕</span><input v-model="searchInput" type="search" :placeholder="t('classes.searchPlaceholder')" :aria-label="t('classes.searchAria')"></label>
      <label><span>{{ t('classes.role') }}</span><select v-model="role"><option value="">{{ t('classes.allRoles') }}</option><option v-for="option in data.facets?.roles || []" :key="option.value" :value="option.value">{{ facetLabel(option.value, option.label) }} ({{ option.count }})</option></select></label>
      <label><span>{{ t('classes.stage') }}</span><select v-model="stage"><option value="">{{ t('classes.allStages') }}</option><option v-for="option in data.facets?.stages || []" :key="option.value" :value="option.value">{{ stageFacetLabel(option.value, option.label) }} ({{ option.count }})</option></select></label>
      <button v-if="q || role || stage" type="button" class="filter-reset" @click="clearFilters">{{ t('common.clear') }}</button>
    </section>
    <div class="result-summary" aria-live="polite"><span v-if="status === 'pending'">{{ t('classes.querying') }}</span><span v-else>{{ t('classes.foundPrefix') }} <strong>{{ data.total }}</strong> {{ t('classes.foundSuffix') }}</span><small v-if="data.total">{{ t('common.page', { page: data.page, pages: totalPages }) }}</small></div>
    <section v-if="status === 'pending' && !data.items.length" class="database-state database-state--loading"><span class="database-state__mark">…</span><h2>{{ t('classes.loading') }}</h2></section>
    <section v-else-if="error" class="database-state database-state--error"><span class="database-state__mark">!</span><h2>{{ t('classes.loadError') }}</h2><p>{{ t('common.tryAgainLater') }}</p><button type="button" @click="refresh">{{ t('common.reload') }}</button></section>
    <section v-else-if="!data.items.length" class="database-state"><span class="database-state__mark">0</span><h2>{{ t('classes.noResults') }}</h2><p>{{ t('classes.noResultsHint') }}</p><button type="button" @click="clearFilters">{{ t('classes.viewAll') }}</button></section>
    <div v-else class="class-grid" :class="{ 'is-refreshing': status === 'pending' }"><ClassCard v-for="item in data.items" :key="item.slug" :item="item"/></div>
    <nav v-if="totalPages > 1" class="pagination" :aria-label="t('classes.paginationAria')"><button type="button" :disabled="page <= 1" :aria-label="t('common.previous')" @click="setPage(page - 1)">←</button><button v-for="number in pageNumbers" :key="number" type="button" :class="{ active:number === page }" :aria-current="number === page ? 'page' : undefined" @click="setPage(number)">{{ number }}</button><button type="button" :disabled="page >= totalPages" :aria-label="t('common.next')" @click="setPage(page + 1)">→</button></nav>
  </main>
</template>
