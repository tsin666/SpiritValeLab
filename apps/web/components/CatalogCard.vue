<script setup lang="ts">
import type { CatalogEntry, CatalogKind } from '~/composables/useCatalog'

const props = defineProps<{ item: CatalogEntry; kind: CatalogKind }>()
const { t } = useI18n()
const localePath = useLocalePath()
const { entryName, alternateName, description, highlights } = useCatalogPresentation()
const name = computed(() => entryName(props.item))
const alternate = computed(() => alternateName(props.item))
const summary = computed(() => description(props.item))
const facts = computed(() => highlights(props.item))
</script>

<template>
  <NuxtLink class="catalog-entry-card" :to="localePath(`/catalog/${kind}/${encodeURIComponent(item.slug)}`)">
    <header><CatalogIcon :entry="item" :kind="kind" size="medium"/><span>{{ t(`catalog.kinds.${kind}`) }}</span></header>
    <small class="catalog-entry-card__id">{{ item.id }}</small>
    <h2>{{ name }}</h2>
    <p v-if="alternate" class="catalog-entry-card__alternate">{{ alternate }}</p>
    <p class="catalog-entry-card__summary">{{ summary }}</p>
    <dl v-if="facts.length" class="catalog-entry-card__facts">
      <div v-for="fact in facts" :key="fact.key"><dt>{{ fact.label }}</dt><dd>{{ fact.displayValue }}</dd></div>
    </dl>
    <footer><span>{{ facts.length ? t('catalog.structuredData') : t('catalog.descriptionOnly') }}</span><b>{{ t('common.viewDetails') }} →</b></footer>
  </NuxtLink>
</template>

<style scoped>
.catalog-entry-card { display:flex; min-width:0; min-height:315px; flex-direction:column; padding:19px; border:1px solid #dfe9e3; border-radius:18px; background:#fff; box-shadow:0 5px 17px rgba(24,65,61,.035); transition:transform .2s,border-color .2s,box-shadow .2s; }
.catalog-entry-card:hover { transform:translateY(-4px); border-color:#b9d6cd; box-shadow:0 15px 34px rgba(23,70,65,.095); }
.catalog-entry-card:focus-visible { outline:3px solid rgba(15,185,157,.28); outline-offset:2px; }
.catalog-entry-card header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:14px; }
.catalog-entry-card header>span { padding:5px 8px; border-radius:7px; color:#167c70; background:#e9f5f1; font-size:9px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.catalog-entry-card__id { overflow:hidden; color:#15907f; font:700 9px/1.4 monospace; text-overflow:ellipsis; white-space:nowrap; }
.catalog-entry-card h2 { margin:5px 0 2px; overflow:hidden; color:#173f3c; font-size:19px; line-height:1.25; letter-spacing:-.025em; text-overflow:ellipsis; white-space:nowrap; }
.catalog-entry-card__alternate { min-height:15px; margin:0; overflow:hidden; color:#8b9995; font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
.catalog-entry-card__summary { display:-webkit-box; min-height:57px; margin:11px 0 13px; overflow:hidden; color:#667d78; font-size:12px; line-height:1.58; -webkit-box-orient:vertical; -webkit-line-clamp:3; }
.catalog-entry-card__facts { display:grid; gap:5px; margin:0 0 13px; }
.catalog-entry-card__facts>div { display:grid; grid-template-columns:minmax(68px,.4fr) minmax(0,1fr); gap:8px; padding:5px 7px; border-radius:7px; background:#f3f7f4; font-size:9px; }
.catalog-entry-card__facts dt { overflow:hidden; color:#758a85; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
.catalog-entry-card__facts dd { overflow:hidden; margin:0; color:#365e59; text-align:right; text-overflow:ellipsis; white-space:nowrap; }
.catalog-entry-card footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:auto; padding-top:13px; border-top:1px solid #edf2ee; }
.catalog-entry-card footer span { color:#889793; font-size:9px; }.catalog-entry-card footer b { color:#167b70; font-size:10px; }
</style>
