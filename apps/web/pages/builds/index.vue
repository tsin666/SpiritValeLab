<script setup lang="ts">
import type { Build } from '~/composables/useApi'

type BuildSort = 'rank' | 'newest' | 'likes' | 'views'
type BuildOrigin = 'all' | 'user' | 'external'

const api = useApi()
const q = ref('')
const archetype = ref('')
const origin = ref<BuildOrigin>('all')
const sort = ref<BuildSort>('rank')
const { t, locale } = useI18n()
const localePath = useLocalePath()

const { data: directory } = await useFetch<Build[]>(`${api}/api/builds`, {
  query: { sort: 'newest' },
  default: () => []
})
const { data: builds, status, error, refresh } = await useFetch<Build[]>(`${api}/api/builds`, {
  query: { q, archetype, origin, sort },
  default: () => []
})

const classes = computed(() => [...new Map(directory.value.map(build => [build.archetype, {
  value: build.archetype,
  label: locale.value.startsWith('en') ? build.archetype : (build.archetypeZh || build.archetype)
}])).values()].sort((left, right) => left.label.localeCompare(right.label, locale.value)))
const hasFilters = computed(() => Boolean(q.value.trim() || archetype.value || origin.value !== 'all'))
const clearFilters = () => {
  q.value = ''
  archetype.value = ''
  origin.value = 'all'
}

useSeoMeta({ title: () => t('builds.seoTitle'), description: () => t('builds.seoDescription') })
</script>

<template>
  <main class="page builds-page">
    <div class="page-head builds-page__head">
      <span class="section-kicker">{{ t('builds.kicker') }}</span>
      <h1>{{ t('builds.title') }}</h1>
      <p>{{ t('builds.subtitle') }}</p>
    </div>

    <div class="toolbar builds-toolbar" role="search" :aria-label="t('builds.filtersAria')">
      <input v-model="q" type="search" :placeholder="t('builds.searchPlaceholder')" :aria-label="t('builds.searchAria')">
      <select v-model="archetype" :aria-label="t('builds.classFilter')">
        <option value="">{{ t('builds.allClasses') }}</option>
        <option v-for="entry in classes" :key="entry.value" :value="entry.value">{{ entry.label }}</option>
      </select>
      <select v-model="origin" :aria-label="t('builds.originFilter')">
        <option value="all">{{ t('builds.originAll') }}</option>
        <option value="user">{{ t('builds.originUser') }}</option>
        <option value="external">{{ t('builds.originExternal') }}</option>
      </select>
      <select v-model="sort" :aria-label="t('builds.sortLabel')">
        <option value="rank">{{ t('builds.sortRank') }}</option>
        <option value="newest">{{ t('builds.sortNewest') }}</option>
        <option value="likes">{{ t('builds.sortLikes') }}</option>
        <option value="views">{{ t('builds.sortViews') }}</option>
      </select>
    </div>

    <aside class="build-rank-note">
      <span aria-hidden="true">↗</span>
      <div><strong>{{ t('builds.rankTitle') }}</strong><p>{{ t('builds.rankExplanation') }}</p></div>
    </aside>

    <div v-if="status === 'pending'" class="empty-state">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="database-state database-state--error">
      <span class="database-state__mark">!</span>
      <h2>{{ t('builds.loadError') }}</h2>
      <p>{{ t('common.tryAgainLater') }}</p>
      <button type="button" @click="refresh()">{{ t('common.retry') }}</button>
    </div>
    <template v-else>
      <div v-if="builds.length" class="build-result-summary">
        <span>{{ t('builds.resultCount', { count: builds.length }) }}</span>
        <small>{{ t(`builds.sort.${sort}`) }}</small>
      </div>
      <div class="build-grid">
        <BuildCard v-for="build in builds" :key="build.slug" :build="build"/>
        <div v-if="!builds.length && !directory.length" class="build-empty">
          <span class="build-empty__mark">BD</span>
          <h2>{{ t('builds.emptyTitle') }}</h2>
          <p>{{ t('builds.emptyDescription') }}</p>
          <NuxtLink :to="localePath('/builder')">{{ t('builds.createFirst') }} →</NuxtLink>
        </div>
        <div v-else-if="!builds.length && hasFilters" class="build-empty">
          <span class="build-empty__mark">⌕</span>
          <h2>{{ t('builds.noResultsTitle') }}</h2>
          <p>{{ t('builds.noResultsDescription') }}</p>
          <button type="button" @click="clearFilters">{{ t('common.clear') }}</button>
        </div>
      </div>
    </template>
  </main>
</template>
