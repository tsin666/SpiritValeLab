<script setup lang="ts">
import type { Equipment, EquipmentValue } from '~/composables/useApi'

const route = useRoute()
const api = useApi()
const { t, te, locale } = useI18n()
const { gameLocale, gameText, humanize, slotText, typeText, elementText, statText } = useGameLocale()
const { buildTitle, buildSummary } = useBuildLocale()
const localePath = useLocalePath()
const slug = computed(() => String(route.params.slug))

const { data: item, status, error, refresh } = await useFetch<Equipment>(() => `${api}/api/equipment/${encodeURIComponent(slug.value)}`, {
  watch: [slug]
})

const name = computed(() => gameText(item.value?.name, item.value?.displayName || item.value?.id || t('equipment.unnamed')))
const category = computed(() => gameText(item.value?.categoryLabel, item.value?.category || t('equipment.uncategorized')))
const description = computed(() => gameText(item.value?.description, t('equipment.detailDescriptionMissing')))
const alternateName = computed(() => {
  if (!item.value?.name || typeof item.value.name === 'string') return ''
  const value = gameLocale.value === 'en' ? item.value.name.zh : item.value.name.en
  return value && value !== name.value ? value : ''
})
const setName = computed(() => gameText(item.value?.set?.name, item.value?.set?.displayName || item.value?.setId || ''))
const equipmentLocations = computed(() => {
  if (!item.value) return ''
  const values = Array.isArray(item.value.slots) ? item.value.slots : [item.value.slot].filter(Boolean) as string[]
  return values.map(value => slotText(String(value))).filter(Boolean).join(' · ')
})
const facts = computed(() => item.value ? [
  { label: t('equipment.category'), value: category.value },
  { label: t('equipment.type'), value: typeText(item.value.type) },
  { label: item.value.fieldSources?.slot === 'type-derived' ? t('equipment.equipmentLocationDerived') : t('equipment.equipmentLocation'), value: equipmentLocations.value },
  { label: t('equipment.runtimeSlots'), value: item.value.runtimeSlots != null ? String(item.value.runtimeSlots) : null },
  { label: t('equipment.element'), value: elementText(item.value.element) },
  { label: t('equipment.levelRequired'), value: item.value.levelRequired != null ? String(item.value.levelRequired) : null },
  { label: t('equipment.unique'), value: item.value.unique == null ? null : (item.value.unique ? t('common.yes') : t('common.no')) },
  { label: t('equipment.characterBound'), value: item.value.characterBound == null ? null : (typeof item.value.characterBound === 'boolean' ? (item.value.characterBound ? t('common.yes') : t('common.no')) : item.value.characterBound) },
  { label: t('equipment.material'), value: gameText(item.value.material, item.value.materialId || '') },
  { label: t('equipment.dataId'), value: item.value.id }
] : [])
const fieldSourceKeys: Record<string, string> = {
  source: 'source',
  'type-derived': 'typeDerived',
  'name-derived': 'nameDerived',
  'pool-derived': 'poolDerived',
  default: 'default'
}
const evidence = computed(() => Object.entries(item.value?.fieldSources || {}).map(([field, source]) => ({
  field,
  label: te(`equipment.evidenceFields.${field}`) ? t(`equipment.evidenceFields.${field}`) : humanize(field),
  source: t(`equipment.fieldSources.${fieldSourceKeys[source] || 'default'}`)
})))
const unrestricted = computed(() => item.value?.hasArchetypeRestriction === false
  || item.value?.hasArchetypeRestriction === undefined && Array.isArray(item.value?.allowedArchetypes) && item.value.allowedArchetypes.length === 0)

const hasSeparatedStats = computed(() => Array.isArray(item.value?.primaryStats) || Array.isArray(item.value?.secondaryStats))
const primaryStats = computed(() => hasSeparatedStats.value ? (item.value?.primaryStats || []) : (item.value?.stats || []))
const secondaryStats = computed(() => hasSeparatedStats.value ? (item.value?.secondaryStats || []) : [])
const availableAffixes = computed(() => item.value?.availableAffixes || item.value?.affixes || [])
const setBonuses = computed(() => item.value?.setBonuses?.length ? item.value.setBonuses : (item.value?.set?.fullSet || []))
function entryLabel(entry: EquipmentValue, index: number) {
  return gameText(entry.label as any) || statText(entry.type || entry.name) || t('equipment.entryNumber', { number: index + 1 })
}
function entryValue(entry: EquipmentValue) {
  const value = entry.value ?? entry.description
  if (value === null || value === undefined || value === '') return t('equipment.valueMissing')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const localized = gameText(record as { zh?: string; en?: string })
    if (localized) return localized
    const hasStringValue = Boolean(record.string || record.string2)
    const parts = [
      record.base != null && (Number(record.base) !== 0 || !hasStringValue) ? t('equipment.baseValue', { value: record.base }) : '',
      record.perLevel != null && Number(record.perLevel) !== 0 ? t('equipment.perLevelValue', { value: record.perLevel }) : '',
      typeof record.string === 'string' ? record.string : '',
      typeof record.string2 === 'string' ? record.string2 : ''
    ].filter(Boolean)
    return parts.join(' · ') || t('equipment.valueMissing')
  }
  return String(value)
}
function entryMeta(entry: EquipmentValue) {
  return [
    entry.eventType != null && entry.eventType !== 'None' ? t('equipment.eventValue', { value: entry.eventType }) : '',
    entry.conditionType != null && entry.conditionType !== 'None' ? t('equipment.conditionValue', { value: `${entry.conditionType}${entry.conditionValue ? `:${entry.conditionValue}` : ''}` }) : '',
    entry.chance != null && Number(entry.chance) !== 0 ? t('equipment.chanceValue', { value: entry.chance }) : '',
    entry.triggerType != null && entry.triggerType !== 'None' ? t('equipment.triggerValue', { value: entry.triggerType }) : '',
    entry.target != null && entry.target !== 'Enemy' ? t('equipment.targetValue', { value: entry.target }) : ''
  ].filter(Boolean).join(' · ')
}
function bonusLabel(entry: EquipmentValue, index: number) {
  const pieces = entry.requiredPieces ?? entry.tier
  const label = entryLabel(entry, index)
  return pieces ? `${t('equipment.pieceBonus', { count: pieces })} · ${label}` : label
}
const affixNumber = (entry: EquipmentValue, index: number) => t('equipment.affixNumber', {
  number: typeof entry.groupIndex === 'number' ? entry.groupIndex + 1 : index + 1
})
const buildClass = (build: NonNullable<Equipment['relatedBuilds']>[number]) => locale.value.startsWith('en') ? build.archetype : (build.archetypeZh || build.archetype)

useSeoMeta({
  title: () => t('equipment.detailSeoTitle', { name: name.value }),
  description: () => description.value
})
</script>

<template>
  <main class="page equipment-detail-page">
    <NuxtLink class="back" :to="localePath('/equipment')">← {{ t('equipment.back') }}</NuxtLink>

    <section v-if="status === 'pending' && !item" class="database-state database-state--loading">
      <span class="database-state__mark">…</span><h2>{{ t('equipment.loading') }}</h2>
    </section>

    <section v-else-if="error || !item" class="database-state database-state--error">
      <span class="database-state__mark">!</span>
      <h1>{{ t('equipment.notFound') }}</h1>
      <p>{{ error?.statusCode === 404 ? t('equipment.notFoundHint') : t('equipment.loadError') }}</p>
      <div class="database-state__actions"><NuxtLink :to="localePath('/equipment')">{{ t('equipment.browse') }}</NuxtLink><button type="button" @click="refresh">{{ t('common.retry') }}</button></div>
    </section>

    <template v-else>
      <header class="equipment-detail-hero">
        <EquipmentIcon :item="item" size="large" />
        <div class="equipment-detail-hero__copy">
            <div class="equipment-detail-hero__badges">
            <span>{{ category }}</span><span v-if="item.element">{{ elementText(item.element) }}</span><span v-if="item.type">{{ typeText(item.type) }}</span><span v-if="item.unique === true">{{ t('equipment.unique') }}</span>
          </div>
          <h1>{{ name }}</h1>
          <p v-if="alternateName" class="equipment-detail-hero__en">{{ alternateName }}</p>
          <p>{{ description }}</p>
        </div>
      </header>

      <div class="equipment-detail-layout">
        <div class="equipment-detail-main">
          <section class="database-panel">
            <div class="panel-heading"><div><span>{{ t('equipment.verifiedKicker') }}</span><h2>{{ t('equipment.basicData') }}</h2></div></div>
            <dl class="equipment-fact-grid">
              <div v-for="fact in facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value || t('common.unknown') }}</dd></div>
            </dl>
            <div v-if="evidence.length" class="equipment-evidence">
              <div><span>{{ t('equipment.evidenceTitle') }}</span><small>{{ t('equipment.evidenceDescription') }}</small></div>
              <ul><li v-for="entry in evidence" :key="entry.field"><b>{{ entry.label }}</b><span>{{ entry.source }}</span></li></ul>
              <p v-if="item.runtimeSlots != null">{{ t('equipment.runtimeSlotsHint') }}</p>
            </div>
          </section>

          <section class="database-panel">
            <div class="panel-heading"><div><span>{{ t('equipment.attributesKicker') }}</span><h2>{{ t('equipment.attributesTitle') }}</h2></div><small>{{ t('common.itemCount', { count: primaryStats.length + secondaryStats.length + availableAffixes.length }) }}</small></div>
            <h3 v-if="primaryStats.length" class="equipment-value-heading">{{ t('equipment.primaryStats') }}</h3>
            <div v-if="primaryStats.length" class="equipment-value-list">
              <div v-for="(entry,index) in primaryStats" :key="`primary-${index}`"><span>{{ entryLabel(entry,index) }}<small v-if="entryMeta(entry)">{{ entryMeta(entry) }}</small></span><strong>{{ entryValue(entry) }}</strong></div>
            </div>
            <p v-else class="data-missing">{{ t('equipment.primaryMissing') }}</p>
            <h3 v-if="secondaryStats.length" class="equipment-value-heading">{{ t('equipment.secondaryStats') }}</h3>
            <div v-if="secondaryStats.length" class="equipment-value-list">
              <div v-for="(entry,index) in secondaryStats" :key="`secondary-${index}`"><span>{{ entryLabel(entry,index) }}<small v-if="entryMeta(entry)">{{ entryMeta(entry) }}</small></span><strong>{{ entryValue(entry) }}</strong></div>
            </div>
            <p v-else class="data-missing">{{ t('equipment.secondaryMissing') }}</p>
            <h3 v-if="availableAffixes.length" class="equipment-value-heading">{{ t('equipment.availableAffixes') }}</h3>
            <div v-if="availableAffixes.length" class="equipment-affix-list">
              <article v-for="(entry,index) in availableAffixes" :key="`available-affix-${index}`"><span>{{ affixNumber(entry,index) }}</span><h3>{{ entryLabel(entry,index) }}</h3><p>{{ entryValue(entry) }}</p><small v-if="entryMeta(entry)">{{ entryMeta(entry) }}</small></article>
            </div>
            <p v-else class="data-missing">{{ t('equipment.availableAffixesMissing') }}</p>
          </section>

          <section class="database-panel">
            <div class="panel-heading"><div><span>{{ t('equipment.setKicker') }}</span><h2>{{ t('equipment.setInfo') }}</h2></div></div>
            <template v-if="setName || setBonuses.length">
              <h3 class="equipment-set-name">{{ setName || t('equipment.unnamedSet') }}</h3>
              <div v-if="setBonuses.length" class="set-bonus-list">
                <div v-for="(bonus,index) in setBonuses" :key="`bonus-${index}`"><b>{{ bonusLabel(bonus,index) }}</b><span>{{ entryValue(bonus) }}</span></div>
              </div>
              <p v-else class="data-missing">{{ t('equipment.setBonusesMissing') }}</p>
            </template>
            <p v-else class="data-missing">{{ t('equipment.setMissing') }}</p>
          </section>
        </div>

        <aside class="equipment-detail-side">
          <section class="database-panel">
            <div class="panel-heading"><div><span>{{ t('equipment.archetypesKicker') }}</span><h2>{{ t('equipment.archetype') }}</h2></div></div>
            <div v-if="item.allowedArchetypes?.length" class="token-list"><span v-for="name in item.allowedArchetypes" :key="name">{{ name }}</span></div>
            <p v-else-if="unrestricted" class="data-confirmed">{{ t('equipment.allClassesAllowedDetail') }}</p>
            <p v-else class="data-missing">{{ t('equipment.classRestrictionsMissing') }}</p>
          </section>

          <section class="database-panel related-builds-panel">
            <div class="panel-heading"><div><span>{{ t('equipment.buildsKicker') }}</span><h2>{{ t('equipment.relatedBuilds') }}</h2></div><small>{{ t('common.buildCount', { count: item.relatedBuilds?.length || 0 }) }}</small></div>
            <div v-if="item.relatedBuilds?.length" class="related-build-list">
              <NuxtLink v-for="build in item.relatedBuilds" :key="build.slug" :to="localePath(`/builds/${encodeURIComponent(build.slug)}`)">
                <img v-if="build.classIcon" :src="build.classIcon" alt="">
                <span v-else class="related-build-placeholder">BD</span>
                <div><small>{{ buildClass(build) }} · {{ build.tier }} TIER</small><strong>{{ buildTitle(build) }}</strong><p>{{ buildSummary(build) }}</p></div>
                <b aria-hidden="true">→</b>
              </NuxtLink>
            </div>
            <div v-else class="related-build-empty"><p>{{ t('equipment.noRelatedBuilds') }}</p><NuxtLink :to="localePath('/builder')">{{ t('equipment.createWithItem') }} →</NuxtLink></div>
          </section>
        </aside>
      </div>
    </template>
  </main>
</template>
