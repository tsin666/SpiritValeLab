<script setup lang="ts">
import type { ApiHealth, Build } from '~/composables/useApi'

const api = useApi()
const search = ref('')
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { data: builds } = await useFetch<Build[]>(`${api}/api/builds`, {
  query: { sort: 'rank' },
  default: () => []
})
const { data: health } = await useFetch<ApiHealth>(`${api}/api/health`, { default: () => ({}) })

const featured = computed(() => builds.value.filter((build) => {
  if (!search.value.trim()) return true
  const haystack = [
    build.title,
    build.titleEn,
    build.summary,
    build.summaryEn,
    build.archetype,
    build.archetypeZh,
    ...(build.tags || []),
    ...(build.tagsEn || [])
  ].filter(Boolean).join(' ').toLocaleLowerCase(locale.value)
  return haystack.includes(search.value.trim().toLocaleLowerCase(locale.value))
}).slice(0, 4))

const databaseEntries = computed(() => [
  { key: 'classes', mark: 'CL', path: '/classes', count: Number(health.value.archetypeEntries || 0) },
  { key: 'equipment', mark: 'EQ', path: '/equipment', count: Number(health.value.equipmentEntries || 0) },
  { key: 'skills', mark: 'SK', path: '/catalog/skills', count: Number(health.value.skillEntries || 0) },
  { key: 'artifacts', mark: 'AR', path: '/catalog/artifacts', count: Number(health.value.artifactEntries || 0) },
  { key: 'gems', mark: 'GM', path: '/catalog/gems', count: Number(health.value.gemEntries || 0) },
  { key: 'sets', mark: 'ST', path: '/catalog/equipment-sets', count: Number(health.value.equipmentSetEntries || 0) }
])

useSeoMeta({ title: () => t('home.seoTitle'), description: () => t('home.seoDescription') })
</script>

<template>
  <main>
    <section class="hero">
      <img class="hero-art" src="/images/spiritvale-hero.jpg" :alt="t('home.heroAlt')">
      <div class="hero-wash"/>
      <div class="hero-content">
        <span class="eyebrow">{{ t('home.eyebrow') }}</span>
        <h1>{{ t('home.heroTitle') }}<br><em>{{ t('home.heroEmphasis') }}</em></h1>
        <p>{{ t('home.heroLine1') }}<br>{{ t('home.heroLine2') }}</p>
        <label class="search-box"><span>⌕</span><input v-model="search" type="search" :placeholder="t('home.searchPlaceholder')" :aria-label="t('home.searchAria')"><kbd>{{ t('home.communityOnly') }}</kbd></label>
        <div class="hero-actions"><NuxtLink :to="localePath('/builder')">{{ t('home.createBuild') }}</NuxtLink><NuxtLink :to="localePath('/equipment')">{{ t('home.browseEquipment') }}</NuxtLink></div>
        <div class="hero-stats">
          <div><strong>{{ builds.length.toLocaleString(locale) }}</strong><span>{{ t('home.communityBuilds') }}</span></div>
          <div><strong>{{ Number(health.runtimeCatalogEntries || 0).toLocaleString(locale) }}</strong><span>{{ t('home.dataEntries') }}</span></div>
          <div><strong>{{ Number(health.equipmentSetEntries || 0).toLocaleString(locale) }}</strong><span>{{ t('home.setEntries') }}</span></div>
        </div>
      </div>
    </section>

    <section class="content-section home-database-section">
      <div class="section-heading">
        <div><span class="section-kicker">{{ t('home.databaseKicker') }}</span><h2>{{ t('home.databaseTitle') }}</h2></div>
        <NuxtLink :to="localePath('/catalog')">{{ t('home.openDatabase') }} →</NuxtLink>
      </div>
      <p class="home-section-description">{{ t('home.databaseDescription') }}</p>
      <div class="home-database-grid">
        <NuxtLink v-for="entry in databaseEntries" :key="entry.key" :to="localePath(entry.path)">
          <span>{{ entry.mark }}</span>
          <div><h3>{{ t(`home.database.${entry.key}`) }}</h3><strong>{{ entry.count.toLocaleString(locale) }}</strong></div>
          <b aria-hidden="true">→</b>
        </NuxtLink>
      </div>
    </section>

    <section class="content-section home-build-section">
      <div class="section-heading">
        <div><span class="section-kicker">{{ t('home.communityKicker') }}</span><h2>{{ t('home.communityRanking') }}</h2></div>
        <NuxtLink :to="localePath('/builds')">{{ t('home.viewAll') }} →</NuxtLink>
      </div>
      <p class="home-section-description">{{ t('home.rankingDescription') }}</p>
      <div class="build-grid">
        <BuildCard v-for="build in featured" :key="build.slug" :build="build"/>
        <div v-if="!featured.length && !builds.length" class="build-empty home-build-empty">
          <span class="build-empty__mark">BD</span>
          <h2>{{ t('home.emptyBuildsTitle') }}</h2>
          <p>{{ t('home.emptyBuildsDescription') }}</p>
          <NuxtLink :to="localePath('/builder')">{{ t('home.createFirstBuild') }} →</NuxtLink>
        </div>
        <div v-else-if="!featured.length" class="build-empty home-build-empty">
          <span class="build-empty__mark">⌕</span>
          <h2>{{ t('home.noMatchingBuildsTitle') }}</h2>
          <p>{{ t('home.noMatchingBuildsDescription') }}</p>
          <button type="button" @click="search = ''">{{ t('common.clear') }}</button>
        </div>
      </div>
    </section>

    <section class="feature-strip">
      <img src="/images/spiritvale-logo.png" alt="SpiritVale">
      <div><span>{{ t('home.plannerKicker') }}</span><h2>{{ t('home.plannerTitle') }}</h2><p>{{ t('home.plannerDescription') }}</p></div>
      <NuxtLink class="light-button" :to="localePath('/builder')">{{ t('home.openBuilder') }} →</NuxtLink>
    </section>
  </main>
</template>
