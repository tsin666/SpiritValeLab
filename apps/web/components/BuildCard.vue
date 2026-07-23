<script setup lang="ts">
import type { Build } from '~/composables/useApi'
const props = defineProps<{ build: Build }>()
const { t, locale } = useI18n()
const { difficultyText } = useGameLocale()
const { buildTitle, buildSummary, skillName } = useBuildLocale()
const localePath = useLocalePath()
const buildClass = (build: Build) => locale.value.startsWith('en') ? build.archetype : (build.archetypeZh || build.archetype)
const title = computed(() => buildTitle(props.build))
const summary = computed(() => buildSummary(props.build))
const likes = computed(() => Number(props.build.likes || 0))
const views = computed(() => Number(props.build.views || 0))
const rankScore = computed(() => Number(props.build.rankScore ?? likes.value * 5 + views.value))
const classInitials = computed(() => buildClass(props.build).slice(0, 2).toLocaleUpperCase(locale.value))
const isExternal = computed(() => props.build.source === 'external' && Boolean(props.build.provenance))
const sourceLabel = computed(() => isExternal.value ? t('builds.sourceExternal') : t('builds.sourceUser'))
const author = computed(() => {
  const value = isExternal.value ? props.build.provenance?.author : props.build.createdBy
  return value && !/^(local-user|api-test|snapshot-test|guide-html-test)$/i.test(value) ? value : ''
})
</script>
<template>
  <NuxtLink class="build-card" :to="localePath(`/builds/${encodeURIComponent(build.slug)}`)">
    <div class="card-top">
      <img v-if="build.classIcon" class="class-image" :src="build.classIcon" :alt="buildClass(build)">
      <span v-else class="class-image build-card__fallback" aria-hidden="true">{{ classInitials }}</span>
      <div class="build-card__badges">
        <span class="build-card__source" :class="{ 'build-card__source--external': isExternal }">{{ sourceLabel }}</span>
        <span v-if="build.tier !== 'Community'" class="tier" :class="`tier-${build.tier.toLowerCase()}`">{{ `${build.tier} TIER` }}</span>
      </div>
    </div>
    <span class="class-label">{{ buildClass(build) }} · {{ difficultyText(build.difficulty) }}</span>
    <small v-if="author" class="build-card__author">{{ t('builds.byAuthor', { author }) }}</small>
    <h3>{{ title }}</h3>
    <p>{{ summary }}</p>
    <div class="skill-row">
      <img v-for="skill in build.skills" :key="skill.id" :src="skill.icon" :alt="skillName(skill)" :title="skillName(skill)">
    </div>
    <footer>
      <span class="build-card__engagement">
        <span>♥ {{ likes.toLocaleString(locale) }}</span>
        <span>◉ {{ views.toLocaleString(locale) }}</span>
        <span>{{ t('builds.rankPointsShort', { count: rankScore.toLocaleString(locale) }) }}</span>
      </span>
      <b>{{ t('common.view') }} →</b>
    </footer>
  </NuxtLink>
</template>
