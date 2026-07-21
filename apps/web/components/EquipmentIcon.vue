<script setup lang="ts">
import type { Equipment } from '~/composables/useApi'
import { equipmentCategory, equipmentName } from '~/composables/useApi'

const props = defineProps<{
  item: Partial<Equipment>
  size?: 'small' | 'medium' | 'large'
}>()

const imageFailed = ref(false)
const localIcon = computed(() => {
  const icon = props.item.icon?.trim()
  return icon && icon.startsWith('/') && !icon.startsWith('//') ? icon : ''
})
const hasImage = computed(() => Boolean(localIcon.value) && !imageFailed.value)

const categoryKey = computed(() => `${props.item.category || ''} ${equipmentCategory(props.item)}`.toLowerCase())
const marker = computed(() => {
  const value = categoryKey.value
  if (/weapon|mainhand|sword|axe|bow|staff|武器|主手/.test(value)) return 'W'
  if (/offhand|shield|副手|盾/.test(value)) return 'S'
  if (/armor|armour|chest|护甲|护胸/.test(value)) return 'A'
  if (/helm|head|头盔|头部/.test(value)) return 'H'
  if (/boot|feet|鞋|靴/.test(value)) return 'B'
  if (/glove|hand|手套/.test(value)) return 'G'
  if (/ring|amulet|accessor|饰品|戒指|项链/.test(value)) return 'R'
  if (/artifact|神器/.test(value)) return 'X'
  const source = equipmentCategory(props.item) || equipmentName(props.item)
  return source.trim().charAt(0).toUpperCase() || 'E'
})

const tone = computed(() => {
  const value = categoryKey.value
  if (/weapon|mainhand|武器|主手/.test(value)) return 'weapon'
  if (/armor|armour|shield|护甲|盾/.test(value)) return 'armor'
  if (/ring|amulet|accessor|饰品|戒指|项链/.test(value)) return 'accessory'
  if (/artifact|神器/.test(value)) return 'artifact'
  return 'default'
})

watch(localIcon, () => { imageFailed.value = false })
</script>

<template>
  <span class="equipment-icon" :class="[`equipment-icon--${size || 'medium'}`, `equipment-icon--${tone}`]" aria-hidden="true">
    <img v-if="hasImage" :src="localIcon" alt="" loading="lazy" @error="imageFailed = true">
    <b v-else>{{ marker }}</b>
  </span>
</template>
