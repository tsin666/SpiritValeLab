<script setup lang="ts">
import type { Archetype, ArchetypeSkill } from '~/composables/useApi'

const props = withDefaults(defineProps<{
  item: Partial<Archetype> | Partial<ArchetypeSkill>
  size?: 'small' | 'medium' | 'large'
  kind?: 'class' | 'skill'
}>(), { size: 'medium', kind: 'class' })
const { t } = useI18n()
const { gameText } = useGameLocale()

const failedIcon = ref('')
const directIcon = computed(() => {
  const icon = props.item.icon?.trim()
  return icon && icon.startsWith('/') && !icon.startsWith('//') ? icon : ''
})
const classItem = computed(() => props.item as Partial<Archetype>)
const fallbackIcon = computed(() => {
  if (props.kind !== 'class' || classItem.value.fallbackIconBasis !== 'npc-config-same-id') return ''
  const source = classItem.value.fallbackIconSource
  if (!source || source.configClass !== 'NpcConfig' || source.configId !== props.item.id) return ''
  const icon = classItem.value.fallbackIcon?.trim()
  return icon && icon.startsWith('/') && !icon.startsWith('//') ? icon : ''
})
const localIcon = computed(() => {
  if (directIcon.value && failedIcon.value !== directIcon.value) return directIcon.value
  if (fallbackIcon.value && failedIcon.value !== fallbackIcon.value) return fallbackIcon.value
  return ''
})
const isSourceFallback = computed(() => Boolean(localIcon.value && localIcon.value === fallbackIcon.value && !directIcon.value))
const sourceHint = computed(() => {
  if (!isSourceFallback.value) return undefined
  const source = classItem.value.fallbackIconSource
  return source
    ? `NpcConfig ${source.configId} · config pathId ${source.configSourcePathId} · Sprite pathId ${source.sourcePathId}`
    : undefined
})
const name = computed(() => props.kind === 'class'
  ? gameText(props.item.name, (props.item as Partial<Archetype>).displayName || props.item.id || t('classes.unnamed'))
  : gameText(props.item.name, (props.item as Partial<ArchetypeSkill>).displayName || props.item.id || t('catalog.kinds.skills')))
const classMarker = computed(() => {
  const source = String(props.item.id || name.value).trim()
  const parts = source
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9\u4e00-\u9fff]+/)
    .filter(Boolean)
  if (parts.length > 1) return parts.slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase()
  return Array.from(parts[0] || 'CL').slice(0, 2).join('').toUpperCase()
})
const marker = computed(() => props.kind === 'class'
  ? classMarker.value
  : name.value.trim().charAt(0).toUpperCase() || 'S')
const isClassFallback = computed(() => props.kind === 'class' && !localIcon.value)
watch([directIcon, fallbackIcon], () => { failedIcon.value = '' })
</script>

<template>
  <span
    class="class-data-icon"
    :class="[`class-data-icon--${size}`, `class-data-icon--${kind}`, { 'class-data-icon--fallback': isClassFallback, 'class-data-icon--source-fallback': isSourceFallback }]"
    :title="sourceHint"
    :data-icon-source="isSourceFallback ? 'NpcConfig' : undefined"
    aria-hidden="true"
  >
    <img v-if="localIcon" :src="localIcon" alt="" loading="lazy" @error="failedIcon = localIcon">
    <b v-else>{{ marker }}</b>
    <small v-if="isSourceFallback" class="class-data-icon__source">NPC</small>
  </span>
</template>
