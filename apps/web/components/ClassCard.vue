<script setup lang="ts">
import type { Archetype } from '~/composables/useApi'

const props = defineProps<{ item: Archetype }>()
const { t } = useI18n()
const { gameLocale, gameText } = useGameLocale()
const localePath = useLocalePath()
const name = computed(() => gameText(props.item.name, props.item.displayName || props.item.id || t('classes.unnamed')))
const role = computed(() => gameText(props.item.roleLabel, props.item.role || t('classes.roleMissing')))
const description = computed(() => gameText(props.item.description, t('classes.descriptionMissing')))
const stage = computed(() => gameText(props.item.stageLabel, props.item.stage ? t(`classes.stages.${props.item.stage}`) : ''))
const alternateName = computed(() => {
  if (!props.item.name || typeof props.item.name === 'string') return ''
  const value = gameLocale.value === 'en' ? props.item.name.zh : props.item.name.en
  return value && value !== name.value ? value : ''
})
</script>

<template>
  <NuxtLink class="class-card" :to="localePath(`/classes/${encodeURIComponent(item.slug)}`)">
    <div class="class-card__visual"><ClassIcon :item="item" size="large"/><div><span>{{ role }}</span><b v-if="stage">{{ stage }}</b></div></div>
    <div class="class-card__body">
      <span class="class-card__id">{{ item.id }}</span>
      <h2>{{ name }}</h2>
      <p v-if="alternateName" class="class-card__en">{{ alternateName }}</p>
      <p class="class-card__description">{{ description }}</p>
      <p v-if="item.requiredClassId" class="class-card__path">{{ t('classes.advancesFrom', { name: item.requiredClassId }) }}</p>
      <footer><span>{{ t('classes.cardLabel') }}</span><b>{{ t('classes.viewSkillsBuilds') }} →</b></footer>
    </div>
  </NuxtLink>
</template>
