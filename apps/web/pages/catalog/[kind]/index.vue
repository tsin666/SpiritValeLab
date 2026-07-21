<script setup lang="ts">
import type { CatalogKind, CatalogListResponse } from '~/composables/useCatalog'
import { catalogKinds, isCatalogKind, sanitizeCatalogEntry } from '~/composables/useCatalog'

const route = useRoute()
const router = useRouter()
const api = useApi()
const { t, locale } = useI18n()
const localePath = useLocalePath()

const initialKind = String(route.params.kind)
if (!isCatalogKind(initialKind)) throw createError({ statusCode: 404, statusMessage: t('catalog.invalidKind') })
const kind = computed(() => String(route.params.kind) as CatalogKind)
const labels = computed(() => Object.fromEntries(catalogKinds.map(key => [key, t(`catalog.kinds.${key}`)])) as Record<CatalogKind, string>)

const limit = 48
const queryText = (value: unknown) => typeof value === 'string' ? value : ''
const pageFromQuery = () => {
  const value = Number(queryText(route.query.page))
  return Number.isInteger(value) && value > 0 ? value : 1
}
const searchInput = ref(queryText(route.query.q).trim())
const q = ref(searchInput.value)
const offset = ref((pageFromQuery() - 1) * limit)
const routeQueryKeys = ['q', 'page'] as const
let restoringRouteQuery = false

const stateRouteQuery = computed<Record<string, string>>(() => {
  const page = Math.floor(offset.value / limit) + 1
  return {
    ...(q.value ? { q: q.value } : {}),
    ...(page > 1 ? { page: String(page) } : {})
  }
})

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
  const parsedPage = Number(queryText(query.page))
  const nextPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const nextOffset = (nextPage - 1) * limit
  if (q.value === nextQ && offset.value === nextOffset && searchInput.value === nextQ) return

  restoringRouteQuery = true
  if (searchTimer) clearTimeout(searchTimer)
  searchInput.value = nextQ
  q.value = nextQ
  offset.value = nextOffset
  restoringRouteQuery = false
}, { deep: true, flush: 'sync' })

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchInput, value => {
  if (restoringRouteQuery) return
  if (searchTimer) clearTimeout(searchTimer)
  if (value.trim() === q.value) return
  searchTimer = setTimeout(() => { q.value = value.trim(); offset.value = 0 }, 260)
}, { flush: 'sync' })
onBeforeUnmount(() => { if (searchTimer) clearTimeout(searchTimer) })

const query = computed(() => ({ ...(q.value ? { q: q.value } : {}), limit, offset: offset.value }))
const { data, status, error, refresh } = await useFetch<CatalogListResponse>(() => `${api}/api/catalog/${kind.value}`, {
  query,
  transform: response => ({ items: response.items.map(sanitizeCatalogEntry), total: response.total, limit: response.limit, offset: response.offset }),
  default: () => ({ items: [], total: 0, limit, offset: 0 })
})

const totalPages = computed(() => Math.max(1, Math.ceil(data.value.total / limit)))
const currentPage = computed(() => Math.floor(offset.value / limit) + 1)
watch(totalPages, (value) => {
  if (currentPage.value > value) offset.value = (value - 1) * limit
})
const pageNumbers = computed(() => {
  let start = Math.max(1, currentPage.value - 2)
  const end = Math.min(totalPages.value, start + 4)
  start = Math.max(1, end - 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})
function setPage(page: number) {
  const next = Math.min(Math.max(1, page), totalPages.value)
  offset.value = (next - 1) * limit
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

useSeoMeta({
  title: () => t('catalog.seoTitle', { kind: labels.value[kind.value] }),
  description: () => t('catalog.seoDescription', { kind: labels.value[kind.value] })
})
</script>

<template>
  <main class="page catalog-page">
    <div class="page-head catalog-page__head">
      <span class="section-kicker">{{ t('catalog.kicker') }}</span>
      <h1>{{ t('catalog.title', { kind: labels[kind] }) }}</h1>
      <p>{{ t('catalog.subtitle', { kind: labels[kind] }) }}</p>
    </div>

    <nav class="catalog-tabs" :aria-label="t('catalog.kindNavigation')">
      <NuxtLink v-for="catalogKind in catalogKinds" :key="catalogKind" :to="localePath(`/catalog/${catalogKind}`)">{{ labels[catalogKind] }}</NuxtLink>
    </nav>

    <section class="toolbar catalog-search" :aria-label="t('catalog.searchAria')">
      <input v-model="searchInput" type="search" :placeholder="t('catalog.searchPlaceholder')" :aria-label="t('catalog.searchAria')">
      <button v-if="q" type="button" @click="searchInput = ''; q = ''; offset = 0">{{ t('common.clear') }}</button>
    </section>

    <div class="catalog-result-summary" aria-live="polite">
      <span v-if="status === 'pending'">{{ t('catalog.querying') }}</span>
      <span v-else>{{ t('catalog.indexed', { count: data.total.toLocaleString(locale) }) }}</span>
      <small v-if="data.total">{{ t('common.page', { page: currentPage, pages: totalPages }) }}</small>
    </div>

    <div v-if="status === 'pending' && !data.items.length" class="catalog-database-grid" :aria-label="t('common.loading')">
      <div v-for="number in 8" :key="number" class="catalog-skeleton"><i/><b/><span/><span/></div>
    </div>

    <section v-else-if="error" class="database-state database-state--error">
      <span class="database-state__mark">!</span><h2>{{ t('catalog.loadError') }}</h2><p>{{ t('catalog.loadErrorHint') }}</p><button type="button" @click="refresh">{{ t('common.reload') }}</button>
    </section>

    <section v-else-if="!data.items.length" class="database-state">
      <span class="database-state__mark">0</span><h2>{{ t('catalog.noResults') }}</h2><p>{{ t('catalog.noResultsHint') }}</p><button type="button" @click="searchInput = ''; q = ''; offset = 0">{{ t('catalog.viewAll') }}</button>
    </section>

    <div v-else class="catalog-database-grid" :class="{ 'is-refreshing': status === 'pending' }">
      <CatalogCard v-for="item in data.items" :key="item.slug" :item="item" :kind="kind"/>
    </div>

    <nav v-if="totalPages > 1" class="pagination" :aria-label="t('catalog.paginationAria')">
      <button type="button" :disabled="currentPage <= 1 || status === 'pending'" :aria-label="t('common.previous')" @click="setPage(currentPage - 1)">←</button>
      <button v-for="number in pageNumbers" :key="number" type="button" :class="{ active: number === currentPage }" :aria-current="number === currentPage ? 'page' : undefined" :disabled="status === 'pending'" @click="setPage(number)">{{ number }}</button>
      <button type="button" :disabled="currentPage >= totalPages || status === 'pending'" :aria-label="t('common.next')" @click="setPage(currentPage + 1)">→</button>
    </nav>
  </main>
</template>

<style scoped>
.catalog-page { width:min(1320px,92%); }
.catalog-page__head { max-width:790px; }
.catalog-search { margin-bottom:13px; }
.catalog-search button { flex:0 0 auto; border:1px solid #cfded7; border-radius:10px; padding:0 15px; color:#296e67; background:#f5faf7; cursor:pointer; font-size:11px; font-weight:700; }
.catalog-result-summary { min-height:30px; display:flex; align-items:center; justify-content:space-between; margin-bottom:13px; color:#71847f; font-size:12px; }
.catalog-result-summary small { color:#8a9995; }
.catalog-database-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:15px; transition:opacity .18s; }
.catalog-database-grid.is-refreshing { opacity:.52; pointer-events:none; }
.catalog-skeleton { min-height:315px; padding:19px; border:1px solid #e1e9e3; border-radius:18px; background:#fff; }
.catalog-skeleton>* { display:block; border-radius:8px; background:linear-gradient(90deg,#eef3ef 25%,#f7f9f7 45%,#eef3ef 65%); background-size:260% 100%; animation:catalog-shimmer 1.35s ease infinite; }
.catalog-skeleton i { width:58px; height:58px; border-radius:15px; }.catalog-skeleton b { width:55%; height:19px; margin-top:35px; }.catalog-skeleton span { width:100%; height:11px; margin-top:14px; }.catalog-skeleton span:last-child { width:72%; }
@keyframes catalog-shimmer { to { background-position:-180% 0; } }
@media (max-width:1050px) { .catalog-database-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
@media (max-width:760px) { .catalog-database-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:520px) { .catalog-database-grid { grid-template-columns:1fr; }.catalog-result-summary { align-items:flex-start; flex-direction:column; gap:4px; } }
</style>
