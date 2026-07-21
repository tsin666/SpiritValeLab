<script setup lang="ts">
import type { CatalogKind } from '~/composables/useCatalog'
import { catalogKinds } from '~/composables/useCatalog'

const api = useApi()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { data: health } = await useFetch<Record<string, number>>(`${api}/api/health`, { default: () => ({}) })

const countKeys: Record<CatalogKind, string> = {
  archetypes: 'archetypeEntries',
  skills: 'skillEntries',
  skillPassives: 'skillPassiveEntries',
  equips: 'equipmentEntries',
  'equipment-sets': 'equipmentSetEntries',
  'substat-pools': 'substatPoolEntries',
  artifacts: 'artifactEntries',
  gems: 'gemEntries',
  cards: 'cardEntries',
  'monster-archetypes': 'monsterArchetypeEntries',
  monsters: 'monsterEntries',
  statuses: 'statusEntries',
  weapons: 'weaponEntries',
  'archetype-skill-relations': 'archetypeSkillRelationEntries'
}

const entries = computed(() => catalogKinds.map(kind => ({
  kind,
  label: t(`catalog.kinds.${kind}`),
  count: Number(health.value[countKeys[kind]] || 0)
})))

useSeoMeta({ title: () => t('catalog.overviewSeoTitle'), description: () => t('catalog.overviewSubtitle') })
</script>

<template>
  <main class="page catalog-overview-page">
    <div class="page-head catalog-overview-page__head">
      <span class="section-kicker">{{ t('catalog.kicker') }}</span>
      <h1>{{ t('catalog.overviewTitle') }}</h1>
      <p>{{ t('catalog.overviewSubtitle') }}</p>
    </div>

    <div class="catalog-overview-grid">
      <NuxtLink v-for="entry in entries" :key="entry.kind" :to="localePath(`/catalog/${entry.kind}`)">
        <CatalogIcon :entry="{ id: entry.label, name: entry.label }" :kind="entry.kind" size="medium"/>
        <div><h2>{{ entry.label }}</h2><p>{{ t('catalog.overviewDescription', { name: entry.label }) }}</p></div>
        <span>{{ t('catalog.overviewCount', { count: entry.count.toLocaleString(locale) }) }}</span>
        <b>{{ t('catalog.openKind') }} →</b>
      </NuxtLink>
    </div>
  </main>
</template>

<style scoped>
.catalog-overview-page { width:min(1280px,92%); }.catalog-overview-page__head { max-width:800px; }
.catalog-overview-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.catalog-overview-grid>a { display:grid; grid-template-columns:auto minmax(0,1fr); gap:14px; min-height:180px; padding:20px; border:1px solid #dce8e2; border-radius:18px; background:#fff; box-shadow:0 5px 18px rgba(24,65,61,.035); transition:transform .2s,border-color .2s,box-shadow .2s; }
.catalog-overview-grid>a:hover { transform:translateY(-3px); border-color:#b8d6cc; box-shadow:0 14px 30px rgba(23,70,65,.08); }.catalog-overview-grid h2 { margin:3px 0 6px; color:#173f3c; font-size:18px; }.catalog-overview-grid p { margin:0; color:#6e817d; font-size:11px; line-height:1.55; }
.catalog-overview-grid>a>span { align-self:end; color:#80908d; font-size:10px; }.catalog-overview-grid>a>b { align-self:end; color:#157c70; font-size:10px; text-align:right; }
@media (max-width:900px) { .catalog-overview-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media (max-width:560px) { .catalog-overview-grid { grid-template-columns:1fr; }.catalog-overview-grid>a { min-height:150px; } }
</style>
