<script setup lang="ts">
const props = withDefaults(defineProps<{ value: unknown; depth?: number }>(), { depth: 0 })
const { t } = useI18n()
const { localizedValue, primitiveValue, fieldLabel } = useCatalogPresentation()

const localized = computed(() => localizedValue(props.value))
const primitive = computed(() => primitiveValue(props.value))
const arrayItems = computed(() => Array.isArray(props.value) ? props.value.filter(value => value !== null && value !== undefined && value !== '') : [])
const objectIcon = computed(() => {
  if (!props.value || typeof props.value !== 'object' || Array.isArray(props.value)) return ''
  const icon = (props.value as Record<string, unknown>).icon
  return typeof icon === 'string' && icon.startsWith('/') && !icon.startsWith('//') ? icon : ''
})
function isDefaultValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '' || value === 'None' || value === false || value === 0) return true
  if (Array.isArray(value)) return value.length === 0 || value.every(isDefaultValue)
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'icon' && !isHiddenCatalogField(key))
    return entries.length === 0 || entries.every(([, item]) => isDefaultValue(item))
  }
  return false
}
const objectEntries = computed(() => {
  if (!props.value || typeof props.value !== 'object' || Array.isArray(props.value) || localized.value) return []
  return Object.entries(props.value as Record<string, unknown>)
    .filter(([key, value]) => key !== 'icon' && !isHiddenCatalogField(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({ key, label: fieldLabel(key), value }))
})
const primaryObjectEntries = computed(() => objectEntries.value.filter(entry => !isDefaultValue(entry.value)))
const defaultObjectEntries = computed(() => objectEntries.value.filter(entry => isDefaultValue(entry.value)))
</script>

<template>
  <span v-if="localized || primitive" class="catalog-value__text">{{ localized || primitive }}</span>
  <ul v-else-if="arrayItems.length" class="catalog-value__list" :class="{ 'catalog-value__list--nested': depth > 0 }">
    <li v-for="(item,index) in arrayItems" :key="index"><CatalogFieldValue :value="item" :depth="depth + 1"/></li>
  </ul>
  <div v-else-if="objectEntries.length || objectIcon" class="catalog-value__record">
    <img v-if="objectIcon" :src="objectIcon" alt="" loading="lazy">
    <div v-if="objectEntries.length" class="catalog-value__record-body">
      <dl v-if="primaryObjectEntries.length" class="catalog-value__object">
        <div v-for="entry in primaryObjectEntries" :key="entry.key"><dt>{{ entry.label }}</dt><dd><CatalogFieldValue :value="entry.value" :depth="depth + 1"/></dd></div>
      </dl>
      <details v-if="defaultObjectEntries.length" class="catalog-value__defaults">
        <summary>{{ t('catalog.showDefaultFields', { count: defaultObjectEntries.length }) }}</summary>
        <dl class="catalog-value__object">
          <div v-for="entry in defaultObjectEntries" :key="entry.key"><dt>{{ entry.label }}</dt><dd><CatalogFieldValue :value="entry.value" :depth="depth + 1"/></dd></div>
        </dl>
      </details>
    </div>
  </div>
  <span v-else class="catalog-value__missing">{{ t('common.unknown') }}</span>
</template>

<style scoped>
.catalog-value__text { overflow-wrap:anywhere; white-space:pre-wrap; }
.catalog-value__missing { color:#92a09d; font-style:italic; }
.catalog-value__list { display:flex; gap:7px; margin:0; padding:0; flex-wrap:wrap; list-style:none; }
.catalog-value__list>li { max-width:100%; padding:6px 9px; border:1px solid #dde9e4; border-radius:8px; color:#456a65; background:#f5f8f6; }
.catalog-value__list--nested { display:grid; gap:6px; }
.catalog-value__record { display:flex; align-items:flex-start; gap:10px; min-width:0; }.catalog-value__record>img { width:52px; height:52px; flex:0 0 auto; padding:4px; border:1px solid #dce9e4; border-radius:10px; object-fit:contain; background:#fff; }.catalog-value__record-body { flex:1; min-width:0; }
.catalog-value__object { display:grid; gap:7px; margin:0; }
.catalog-value__object>div { display:grid; grid-template-columns:minmax(92px,.38fr) minmax(0,1fr); gap:10px; padding:7px 0; border-bottom:1px solid #edf2ef; }
.catalog-value__object>div:last-child { border-bottom:0; }
.catalog-value__object dt { color:#7b8e89; font-size:10px; font-weight:700; }
.catalog-value__object dd { min-width:0; margin:0; color:#345b56; }
.catalog-value__defaults { margin-top:7px; padding-top:7px; border-top:1px dashed #dce7e2; }.catalog-value__defaults summary { color:#78908a; cursor:pointer; font-size:10px; font-weight:700; }.catalog-value__defaults[open] summary { margin-bottom:7px; }
@media (max-width:600px) { .catalog-value__object>div { grid-template-columns:1fr; gap:4px; } }
</style>
