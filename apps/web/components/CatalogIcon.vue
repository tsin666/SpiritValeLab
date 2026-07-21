<script setup lang="ts">
import type { CatalogEntry, CatalogKind } from '~/composables/useCatalog'

const props = withDefaults(defineProps<{
  entry: Partial<CatalogEntry>
  kind: CatalogKind
  size?: 'small' | 'medium' | 'large'
}>(), { size: 'medium' })

const { entryName, icon } = useCatalogPresentation()
const failed = ref(false)
const image = computed(() => icon(props.entry))
const marker = computed(() => entryName(props.entry).trim().charAt(0).toUpperCase() || '?')
watch(image, () => { failed.value = false })
</script>

<template>
  <span class="catalog-icon" :class="[`catalog-icon--${size}`, `catalog-icon--${kind}`]" aria-hidden="true">
    <img v-if="image && !failed" :src="image" alt="" loading="lazy" @error="failed = true">
    <b v-else>{{ marker }}</b>
  </span>
</template>

<style scoped>
.catalog-icon { position:relative; display:grid; flex:0 0 auto; place-items:center; overflow:hidden; border:1px solid #cfe1da; color:#19796f; background:linear-gradient(145deg,#f3faf7,#e7f3ef); box-shadow:inset 0 -10px 22px rgba(22,91,83,.05); }
.catalog-icon:after { content:''; position:absolute; width:72%; height:1px; right:-2%; bottom:22%; background:currentColor; opacity:.12; transform:rotate(-35deg); }
.catalog-icon img { position:relative; z-index:1; width:100%; height:100%; padding:8%; object-fit:contain; }
.catalog-icon b { position:relative; z-index:1; font-size:18px; }
.catalog-icon--small { width:38px; height:38px; border-radius:10px; }.catalog-icon--small b { font-size:13px; }
.catalog-icon--medium { width:58px; height:58px; border-radius:15px; }
.catalog-icon--large { width:112px; height:112px; border-radius:27px; }.catalog-icon--large b { font-size:34px; }
.catalog-icon--artifacts { color:#92683e; border-color:#ead9bd; background:linear-gradient(145deg,#fffaf0,#f3e7d3); }
.catalog-icon--gems { color:#71529a; border-color:#dfd4ea; background:linear-gradient(145deg,#fbf8ff,#ece5f3); }
.catalog-icon--skills,.catalog-icon--skillPassives { color:#316e98; border-color:#d3e1eb; background:linear-gradient(145deg,#f6fbff,#e6eff5); }
.catalog-icon--monsters { color:#9a5346; border-color:#ead8d3; background:linear-gradient(145deg,#fff8f5,#f3e7e2); }
</style>
