<script setup lang="ts">
import type { Equipment } from '~/composables/useApi'

const props = withDefaults(defineProps<{ item: Equipment; searchTerm?: string }>(), { searchTerm: '' })
const { t } = useI18n()
const { gameLocale, gameText, typeText, elementText, statText } = useGameLocale()
const localePath = useLocalePath()
const name = computed(() => gameText(props.item.name, props.item.displayName || props.item.id || t('equipment.unnamed')))
const category = computed(() => gameText(props.item.categoryLabel, props.item.category || t('equipment.uncategorized')))
const description = computed(() => gameText(props.item.description, t('equipment.descriptionMissing')))
const alternateName = computed(() => {
  if (!props.item.name || typeof props.item.name === 'string') return ''
  const value = gameLocale.value === 'en' ? props.item.name.zh : props.item.name.en
  return value && value !== name.value ? value : ''
})
const facts = computed(() => [typeText(props.item.type), elementText(props.item.element), props.item.levelRequired != null ? t('equipment.levelValue', { level: props.item.levelRequired }) : ''].filter(Boolean))
const baseStats = computed(() => {
  const separated = [...(props.item.primaryStats || []), ...(props.item.secondaryStats || [])]
  return separated.length ? separated : (props.item.stats || [])
})
const availableAffixes = computed(() => props.item.availableAffixes || props.item.affixes || [])
const dataCount = computed(() => baseStats.value.length + availableAffixes.value.length)
const setName = computed(() => gameText(props.item.set?.name, props.item.set?.displayName || ''))
function attributeValue(entry: NonNullable<Equipment['stats']>[number]) {
  const value = entry.value ?? entry.description
  if (value === null || value === undefined || value === '') return ''
  if (typeof value !== 'object') return String(value)
  const record = value as Record<string, unknown>
  return [
    record.base != null ? t('equipment.baseValue', { value: record.base }) : '',
    record.perLevel != null && Number(record.perLevel) !== 0 ? t('equipment.perLevelValue', { value: record.perLevel }) : '',
    typeof record.string === 'string' ? record.string : '',
    typeof record.string2 === 'string' ? record.string2 : ''
  ].filter(Boolean).join(' · ')
}
const matchingAffixes = computed(() => {
  const token = props.searchTerm.trim().toLocaleLowerCase('en-US')
  if (!token) return []
  return availableAffixes.value.filter(entry => JSON.stringify(entry).toLocaleLowerCase('en-US').includes(token))
})
const attributePreview = computed(() => {
  const mapEntry = (entry: NonNullable<Equipment['stats']>[number], kind: string, matched = false) => ({
    kind,
    label: statText(entry.type || entry.label || entry.name),
    value: attributeValue(entry),
    matched
  })
  const entries = matchingAffixes.value.length
    ? [
        ...matchingAffixes.value.slice(0, 2).map(entry => mapEntry(entry, t('equipment.availableAffixes'), true)),
        ...baseStats.value.slice(0, 1).map(entry => mapEntry(entry, t('equipment.stats')))
      ]
    : [
        ...baseStats.value.slice(0, 1).map(entry => mapEntry(entry, t('equipment.stats'))),
        ...availableAffixes.value.slice(0, 1).map(entry => mapEntry(entry, t('equipment.availableAffixes'))),
        ...baseStats.value.slice(1, 2).map(entry => mapEntry(entry, t('equipment.stats')))
      ]
  return entries.filter(entry => entry.label).slice(0, 2)
})
const restrictionText = computed(() => {
  if (props.item.allowedArchetypes?.length) return t('equipment.classCount', { count: props.item.allowedArchetypes.length })
  if (props.item.hasArchetypeRestriction === false || (props.item.hasArchetypeRestriction === undefined && Array.isArray(props.item.allowedArchetypes))) return t('equipment.allClassesAllowed')
  return t('equipment.classesMissing')
})
</script>

<template>
  <NuxtLink class="equipment-card" :to="localePath(`/equipment/${encodeURIComponent(item.slug)}`)">
    <div class="equipment-card__top">
      <EquipmentIcon :item="item" size="medium" />
      <span v-if="item.unique === true" class="equipment-rarity">{{ t('equipment.unique') }}</span>
    </div>
    <span class="equipment-category">{{ category }}</span>
    <h2>{{ name }}</h2>
    <p v-if="alternateName" class="equipment-card__en">{{ alternateName }}</p>
    <p class="equipment-card__description">{{ description }}</p>
    <div class="equipment-card__meta">
      <span v-for="fact in facts" :key="fact">{{ fact }}</span>
      <span v-if="!facts.length">{{ t('equipment.factsMissing') }}</span>
    </div>
    <div class="equipment-card__coverage">
      <span>{{ dataCount ? t('equipment.dataCount', { count: dataCount }) : t('equipment.dataMissing') }}</span>
      <span v-if="setName">{{ t('equipment.setValue', { set: setName }) }}</span>
    </div>
    <div v-if="attributePreview.length" class="equipment-card__attributes">
      <span v-for="entry in attributePreview" :key="`${entry.kind}-${entry.label}`" :class="{ 'is-matched': entry.matched }"><small>{{ entry.kind }}</small><b>{{ entry.label }}</b><em v-if="entry.value">{{ entry.value }}</em></span>
    </div>
    <footer>
      <span>{{ restrictionText }}</span>
      <b>{{ t('common.viewDetails') }} <span aria-hidden="true">→</span></b>
    </footer>
  </NuxtLink>
</template>
