<script setup lang="ts">
import type { Build } from '~/composables/useApi'

type BuildEngagement = { views: number; likes: number; liked: boolean }

const visitorStorageKey = 'spiritvale-lab-visitor-id'
const route = useRoute()
const api = useApi()
const slug = computed(() => String(route.params.slug))
const { data: build, error } = await useFetch<Build>(() => `${api}/api/builds/${encodeURIComponent(slug.value)}`, { watch: [slug] })
const { t, locale } = useI18n()
const { difficultyText, slotText } = useGameLocale()
const { buildTitle, buildSummary, buildGuide, buildTags, skillName, equipmentName, equipmentSlot, metricLabel } = useBuildLocale()
const localePath = useLocalePath()

if (error.value) throw createError({ statusCode: 404, statusMessage: t('builds.notFound') })

const engagement = reactive({ views: 0, likes: 0, liked: false })
const visitorId = ref('')
const liking = ref(false)
const engagementError = ref('')
const buildClass = computed(() => locale.value.startsWith('en') ? build.value?.archetype : (build.value?.archetypeZh || build.value?.archetype))
const title = computed(() => buildTitle(build.value))
const summary = computed(() => buildSummary(build.value))
const guide = computed(() => buildGuide(build.value))
const tags = computed(() => buildTags(build.value))
const rankScore = computed(() => engagement.likes * 5 + engagement.views)
const classInitials = computed(() => String(buildClass.value || 'BD').slice(0, 2).toLocaleUpperCase(locale.value))
const equipmentPreview = computed(() => {
  const left: Build['equipment'] = []
  const right: Build['equipment'] = []
  const leftSlots = /head|back|main-hand|weapon|legs|accessory|头|背|主手|武器|腿|饰品/i
  const rightSlots = /off-hand|chest|hands|feet|class-item|副手|胸|手|脚|鞋|职业/i
  for (const item of build.value?.equipment || []) {
    const slot = `${item.slot || ''} ${item.slotEn || ''}`
    if (leftSlots.test(slot) && !rightSlots.test(slot)) left.push(item)
    else if (rightSlots.test(slot) && !leftSlots.test(slot)) right.push(item)
    else (left.length <= right.length ? left : right).push(item)
  }
  return { left, right }
})
const itemPath = (item: Build['equipment'][number]) => item.kind === 'artifact'
  ? `/catalog/artifacts/${encodeURIComponent(String(item.slug))}`
  : `/equipment/${encodeURIComponent(String(item.slug))}`

watch(build, (value) => {
  engagement.views = Number(value?.views || 0)
  engagement.likes = Number(value?.likes || 0)
}, { immediate: true })

function createVisitorId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function getVisitorId() {
  const stored = localStorage.getItem(visitorStorageKey)
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) return stored
  const created = createVisitorId()
  localStorage.setItem(visitorStorageKey, created)
  return created
}

async function registerView() {
  try {
    const result = await $fetch<BuildEngagement>(`${api}/api/builds/${encodeURIComponent(slug.value)}/view`, {
      method: 'POST',
      body: { visitorId: visitorId.value }
    })
    Object.assign(engagement, result)
  } catch {
    engagementError.value = t('builds.engagementUnavailable')
  }
}

async function toggleLike() {
  if (!visitorId.value || liking.value) return
  liking.value = true
  engagementError.value = ''
  try {
    const result = await $fetch<BuildEngagement>(`${api}/api/builds/${encodeURIComponent(slug.value)}/like`, {
      method: 'POST',
      body: { visitorId: visitorId.value }
    })
    Object.assign(engagement, result)
  } catch {
    engagementError.value = t('builds.engagementUnavailable')
  } finally {
    liking.value = false
  }
}

onMounted(() => {
  try {
    visitorId.value = getVisitorId()
    void registerView()
  } catch {
    engagementError.value = t('builds.engagementUnavailable')
  }
})

useSeoMeta({ title: () => title.value || t('builds.seoTitle'), description: () => summary.value || t('builds.seoDescription') })
</script>

<template>
  <main v-if="build" class="page detail build-detail-page">
    <NuxtLink class="back" :to="localePath('/builds')">← {{ t('builds.back') }}</NuxtLink>
    <div class="detail-hero">
      <img v-if="build.classIcon" :src="build.classIcon" :alt="buildClass">
      <span v-else class="build-detail-fallback" aria-hidden="true">{{ classInitials }}</span>
      <div>
        <span class="tier tier-s">{{ build.tier === 'Community' ? t('builds.community') : `${build.tier} TIER` }}</span>
        <h1>{{ title }}</h1>
        <p>{{ buildClass }} · {{ difficultyText(build.difficulty) }} · {{ build.patch }}</p>
      </div>
    </div>

    <section class="build-engagement" :aria-label="t('builds.engagementTitle')">
      <div><strong>{{ engagement.likes.toLocaleString(locale) }}</strong><span>{{ t('builds.likesLabel') }}</span></div>
      <div><strong>{{ engagement.views.toLocaleString(locale) }}</strong><span>{{ t('builds.uniqueViewsLabel') }}</span></div>
      <div><strong>{{ rankScore.toLocaleString(locale) }}</strong><span>{{ t('builds.rankPointsLabel') }}</span></div>
      <button type="button" :class="{ 'is-liked': engagement.liked }" :aria-pressed="engagement.liked" :disabled="liking" @click="toggleLike">
        <span aria-hidden="true">{{ engagement.liked ? '♥' : '♡' }}</span>
        {{ engagement.liked ? t('builds.liked') : t('builds.like') }}
      </button>
      <p>{{ t('builds.rankExplanation') }} {{ t('builds.engagementPrivacy') }}</p>
      <small v-if="engagementError" role="status">{{ engagementError }}</small>
    </section>

    <p class="lead">{{ summary }}</p>
    <div v-if="tags.length" class="build-detail-tags"><span v-for="tag in tags" :key="tag"># {{ tag }}</span></div>

    <section class="build-loadout-preview" :aria-labelledby="'loadout-preview-title'">
      <header>
        <div><span>{{ t('builds.loadoutPreviewKicker') }}</span><h2 id="loadout-preview-title">{{ t('builds.loadoutPreview') }}</h2></div>
        <p>{{ t('builds.loadoutPreviewDescription') }}</p>
      </header>
      <div class="build-loadout-preview__stage">
        <div class="build-loadout-preview__gear build-loadout-preview__gear--left">
          <article v-for="(item, index) in equipmentPreview.left" :key="`left-${item.id}-${index}`">
            <EquipmentIcon :item="item" size="medium"/>
            <span><small>{{ slotText(equipmentSlot(item)) || t('builds.unknownSlot') }}</small><strong>{{ equipmentName(item) }}</strong></span>
          </article>
        </div>
        <div class="build-loadout-preview__class">
          <span>{{ t('builds.classPreview') }}</span>
          <div class="build-loadout-preview__portrait">
            <img v-if="build.classIcon" :src="build.classIcon" :alt="buildClass">
            <b v-else aria-hidden="true">{{ classInitials }}</b>
          </div>
          <strong>{{ buildClass }}</strong>
          <small>{{ title }}</small>
        </div>
        <div class="build-loadout-preview__gear build-loadout-preview__gear--right">
          <article v-for="(item, index) in equipmentPreview.right" :key="`right-${item.id}-${index}`">
            <EquipmentIcon :item="item" size="medium"/>
            <span><small>{{ slotText(equipmentSlot(item)) || t('builds.unknownSlot') }}</small><strong>{{ equipmentName(item) }}</strong></span>
          </article>
        </div>
      </div>
      <div v-if="!build.equipment.length" class="build-loadout-preview__empty">{{ t('builds.emptyEquipmentPreview') }}</div>
      <div class="build-loadout-preview__facts">
        <div><span>{{ t('builds.previewClass') }}</span><strong>{{ buildClass }}</strong></div>
        <div><span>{{ t('builds.previewDifficulty') }}</span><strong>{{ difficultyText(build.difficulty) }}</strong></div>
        <div><span>{{ t('builds.previewSkills') }}</span><strong>{{ build.skills.length }}</strong></div>
        <div><span>{{ t('builds.previewEquipment') }}</span><strong>{{ build.equipment.length }}</strong></div>
      </div>
      <div class="build-loadout-preview__attributes">
        <h3>{{ t('builds.attributeSnapshot') }}</h3>
        <div v-if="build.metrics.length" class="build-loadout-preview__metrics">
          <div v-for="metric in build.metrics" :key="`preview-${metric.label}`"><span>{{ metricLabel(metric) }}</span><strong>{{ metric.value }}</strong></div>
        </div>
        <p v-else>{{ t('builds.attributeUnavailable') }}</p>
      </div>
    </section>

    <div class="detail-grid">
      <section>
        <h2>{{ t('builds.skills') }}</h2>
        <div class="item-list">
          <NuxtLink v-for="skill in build.skills.filter(entry => entry.slug)" :key="skill.id" :to="localePath(`/catalog/skills/${encodeURIComponent(String(skill.slug))}`)">
            <img v-if="skill.icon" :src="skill.icon" :alt="skillName(skill)"><span>{{ skillName(skill) }}</span><b aria-hidden="true">→</b>
          </NuxtLink>
          <div v-for="skill in build.skills.filter(entry => !entry.slug)" :key="skill.id"><img v-if="skill.icon" :src="skill.icon" :alt="skillName(skill)"><span>{{ skillName(skill) }}</span></div>
        </div>
        <h2>{{ t('builds.guide') }}</h2>
        <ol><li v-for="step in guide" :key="step">{{ step }}</li></ol>
      </section>
      <aside>
        <h2>{{ t('builds.equipment') }}</h2>
        <NuxtLink v-for="item in build.equipment.filter(entry => entry.slug)" :key="`${item.kind || 'equipment'}-${item.id}`" class="gear gear--link" :to="localePath(itemPath(item))">
          <img v-if="item.icon" :src="item.icon" :alt="equipmentName(item)"><span><small>{{ slotText(equipmentSlot(item)) }}</small>{{ equipmentName(item) }}</span><b aria-hidden="true">→</b>
        </NuxtLink>
        <div v-for="item in build.equipment.filter(entry => !entry.slug)" :key="item.id" class="gear"><img v-if="item.icon" :src="item.icon" :alt="equipmentName(item)"><span><small>{{ equipmentSlot(item) }}</small>{{ equipmentName(item) }}</span></div>
        <h2>{{ t('builds.metrics') }}</h2>
        <div v-for="metric in build.metrics" :key="metric.label" class="metric"><span>{{ metricLabel(metric) }}</span><i><b :style="{ width: `${metric.value}%`, background: build.color || '#168d7e' }"/></i><strong>{{ metric.value }}</strong></div>
      </aside>
    </div>
  </main>
</template>
