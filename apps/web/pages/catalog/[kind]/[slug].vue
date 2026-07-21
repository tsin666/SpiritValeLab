<script setup lang="ts">
import type { CatalogEntry, CatalogKind } from '~/composables/useCatalog'
import { isCatalogKind, sanitizeCatalogEntry } from '~/composables/useCatalog'

const route = useRoute()
const api = useApi()
const { t } = useI18n()
const localePath = useLocalePath()

const initialKind = String(route.params.kind)
if (!isCatalogKind(initialKind)) throw createError({ statusCode: 404, statusMessage: t('catalog.invalidKind') })
const kind = computed(() => String(route.params.kind) as CatalogKind)
const slug = computed(() => String(route.params.slug))
const kindLabel = computed(() => t(`catalog.kinds.${kind.value}`))

const { data: item, status, error, refresh } = await useFetch<CatalogEntry>(() => `${api}/api/catalog/${kind.value}/${encodeURIComponent(slug.value)}`, {
  watch: [kind, slug],
  transform: sanitizeCatalogEntry
})

const { entryName, alternateName, descriptions, sections } = useCatalogPresentation()
const name = computed(() => entryName(item.value))
const alternate = computed(() => alternateName(item.value))
const paragraphs = computed(() => descriptions(item.value))
const structuredSections = computed(() => sections(item.value))

useSeoMeta({
  title: () => t('catalog.detailSeoTitle', { name: name.value, kind: kindLabel.value }),
  description: () => paragraphs.value[0] || t('catalog.seoDescription', { kind: kindLabel.value })
})
</script>

<template>
  <main class="page catalog-detail-page">
    <NuxtLink class="back" :to="localePath(`/catalog/${kind}`)">← {{ t('catalog.backToKind', { kind: kindLabel }) }}</NuxtLink>

    <section v-if="status === 'pending' && !item" class="database-state">
      <span class="database-state__mark">…</span><h2>{{ t('catalog.loadingDetail') }}</h2><p>{{ t('catalog.loadingDetailHint', { kind: kindLabel }) }}</p>
    </section>

    <section v-else-if="error" class="database-state database-state--error">
      <span class="database-state__mark">!</span><h1>{{ t('catalog.loadError') }}</h1><p>{{ t('catalog.loadErrorHint') }}</p><div class="database-state__actions"><NuxtLink :to="localePath(`/catalog/${kind}`)">{{ t('catalog.browseKind', { kind: kindLabel }) }}</NuxtLink><button type="button" @click="refresh">{{ t('common.retry') }}</button></div>
    </section>

    <section v-else-if="!item" class="database-state database-state--error">
      <span class="database-state__mark">0</span><h1>{{ t('catalog.notFound') }}</h1><p>{{ t('catalog.notFoundHint') }}</p><div class="database-state__actions"><NuxtLink :to="localePath(`/catalog/${kind}`)">{{ t('catalog.browseKind', { kind: kindLabel }) }}</NuxtLink><button type="button" @click="refresh">{{ t('common.retry') }}</button></div>
    </section>

    <template v-else>
      <header class="catalog-detail-hero">
        <CatalogIcon :entry="item" :kind="kind" size="large"/>
        <div>
          <span class="catalog-detail-hero__kind">{{ kindLabel }}</span>
          <h1>{{ name }}</h1>
          <p v-if="alternate" class="catalog-detail-hero__alternate">{{ alternate }}</p>
          <small>{{ t('catalog.dataId') }} · {{ item.id }}</small>
        </div>
      </header>

      <div class="catalog-detail-layout">
        <div class="catalog-detail-main">
          <section class="catalog-detail-panel catalog-description-panel">
            <header><span>{{ t('catalog.overviewKicker') }}</span><h2>{{ t('catalog.overview') }}</h2></header>
            <div v-if="paragraphs.length" class="catalog-description-list"><p v-for="(paragraph,index) in paragraphs" :key="index">{{ paragraph }}</p></div>
            <p v-else class="catalog-detail-missing">{{ t('catalog.descriptionMissing') }}</p>
          </section>

          <section v-for="section in structuredSections" :key="section.key" class="catalog-detail-panel">
            <header><span>{{ t(`catalog.sectionKickers.${section.key}`) }}</span><h2>{{ section.title }}</h2></header>
            <dl class="catalog-field-grid">
              <div v-for="field in section.fields" :key="field.key"><dt>{{ field.label }}</dt><dd><CatalogFieldValue :value="field.value"/></dd></div>
            </dl>
          </section>

          <section v-if="!structuredSections.length" class="catalog-detail-panel catalog-detail-panel--quiet">
            <header><span>{{ t('catalog.verifiedKicker') }}</span><h2>{{ t('catalog.structuredTitle') }}</h2></header>
            <p class="catalog-detail-missing">{{ t('catalog.structuredMissing') }}</p>
          </section>
        </div>

        <aside class="catalog-detail-side">
          <section class="catalog-detail-panel">
            <header><span>{{ t('catalog.recordKicker') }}</span><h2>{{ t('catalog.recordInfo') }}</h2></header>
            <dl class="catalog-record-list"><div><dt>{{ t('catalog.kind') }}</dt><dd>{{ kindLabel }}</dd></div><div><dt>{{ t('catalog.dataId') }}</dt><dd>{{ item.id }}</dd></div><div><dt>{{ t('catalog.slug') }}</dt><dd>{{ item.slug }}</dd></div><div><dt>{{ t('catalog.dataCoverage') }}</dt><dd>{{ t('catalog.sectionCount', { count: structuredSections.length }) }}</dd></div></dl>
          </section>
          <NuxtLink class="catalog-detail-side__browse" :to="localePath(`/catalog/${kind}`)">{{ t('catalog.moreFromKind', { kind: kindLabel }) }} →</NuxtLink>
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.catalog-detail-page { width:min(1240px,92%); }
.catalog-detail-hero { display:flex; align-items:center; gap:26px; padding:31px; border:1px solid #d8e5de; border-radius:24px; background:radial-gradient(circle at 92% 10%,rgba(15,185,157,.11),transparent 27%),linear-gradient(135deg,#fff,#edf8f4); box-shadow:0 15px 38px rgba(21,72,66,.055); }
.catalog-detail-hero>div { min-width:0; }
.catalog-detail-hero__kind { display:inline-flex; padding:5px 8px; border-radius:7px; color:#167c70; background:#e3f3ee; font-size:9px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.catalog-detail-hero h1 { max-width:none; margin:10px 0 3px; color:#123e3a; font-size:clamp(37px,5vw,59px); line-height:1; overflow-wrap:anywhere; }
.catalog-detail-hero__alternate { margin:7px 0!important; color:#82928e; font-size:12px; }
.catalog-detail-hero small { display:block; margin-top:10px; color:#718580; font:600 10px/1.5 monospace; overflow-wrap:anywhere; }
.catalog-detail-layout { display:grid; grid-template-columns:minmax(0,1.65fr) minmax(280px,.72fr); gap:18px; margin-top:20px; align-items:start; }
.catalog-detail-main,.catalog-detail-side { display:grid; gap:18px; }
.catalog-detail-panel { min-width:0; padding:24px; border:1px solid #dfe8e2; border-radius:18px; background:#fff; box-shadow:0 5px 17px rgba(24,65,61,.03); }
.catalog-detail-panel>header { margin-bottom:17px; }.catalog-detail-panel>header span { display:block; margin-bottom:4px; color:#17907f; font-size:9px; font-weight:800; letter-spacing:.15em; }.catalog-detail-panel>header h2 { margin:0; font-size:21px; letter-spacing:-.025em; }
.catalog-description-list { display:grid; gap:13px; }.catalog-description-list p { margin:0; color:#4f6d68; font-size:14px; line-height:1.78; }
.catalog-description-list p+p { padding-top:13px; border-top:1px solid #edf2ee; }
.catalog-field-grid { display:grid; gap:8px; margin:0; }.catalog-field-grid>div { display:grid; grid-template-columns:minmax(125px,.35fr) minmax(0,1fr); gap:15px; padding:11px 12px; border:1px solid #e5ece8; border-radius:11px; background:#fbfdfb; }.catalog-field-grid dt { color:#728681; font-size:11px; font-weight:700; }.catalog-field-grid dd { min-width:0; margin:0; color:#315953; font-size:12px; line-height:1.55; }
.catalog-detail-missing { margin:0; color:#81918d; font-size:13px; line-height:1.65; }.catalog-detail-panel--quiet { background:rgba(255,255,255,.65); }
.catalog-record-list { display:grid; gap:0; margin:0; }.catalog-record-list>div { display:grid; grid-template-columns:90px minmax(0,1fr); gap:8px; padding:9px 0; border-bottom:1px solid #edf2ee; }.catalog-record-list>div:last-child { border-bottom:0; }.catalog-record-list dt { color:#81918d; font-size:10px; font-weight:700; }.catalog-record-list dd { min-width:0; margin:0; color:#315953; font-size:11px; overflow-wrap:anywhere; }
.catalog-detail-side__browse { display:flex; justify-content:center; padding:13px 16px; border-radius:12px; color:#fff; background:#073f3d; font-size:12px; font-weight:700; }
@media (max-width:800px) { .catalog-detail-layout { grid-template-columns:1fr; }.catalog-detail-side { grid-template-columns:1fr; }.catalog-field-grid>div { grid-template-columns:1fr; gap:6px; } }
@media (max-width:560px) { .catalog-detail-hero { align-items:flex-start; padding:22px; }.catalog-detail-hero h1 { font-size:34px; } }
</style>
