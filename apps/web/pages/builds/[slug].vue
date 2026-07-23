<script setup lang="ts">
import type {
  Build,
  BuildArtifactSlot,
  BuildEquipmentSlot,
  BuilderOption,
  BuilderOptions
} from '~/composables/useApi'

type BuildEngagement = { views: number; likes: number; liked: boolean }

const visitorStorageKey = 'spiritvale-lab-visitor-id'
const route = useRoute()
const api = useApi()
const slug = computed(() => String(route.params.slug))
const { data: build, error } = await useFetch<Build>(() => `${api}/api/builds/${encodeURIComponent(slug.value)}`, { watch: [slug] })
const { data: builderOptions, error: builderOptionsError } = await useFetch<BuilderOptions>(`${api}/api/builder/options`, {
  transform: compactBuilderOptions
})
const { t, locale } = useI18n()
const { difficultyText, slotText } = useGameLocale()
const { buildTitle, buildSummary, buildGuide, buildGuideHtml, buildTags, skillName, equipmentName, equipmentSlot, metricLabel } = useBuildLocale()
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
const guideHtml = computed(() => buildGuideHtml(build.value))
const tags = computed(() => buildTags(build.value))
const rankScore = computed(() => engagement.likes * 5 + engagement.views)
const isExternal = computed(() => build.value?.source === 'external' && Boolean(build.value?.provenance))
const provenance = computed(() => isExternal.value ? build.value?.provenance : undefined)
const sourceMetrics = computed(() => build.value?.sourceMetrics)
const classInitials = computed(() => String(buildClass.value || 'BD').slice(0, 2).toLocaleUpperCase(locale.value))
const hasLoadoutSnapshot = computed(() => Boolean(
  build.value?.snapshotVersion
  || build.value?.character
  || build.value?.skillTree?.length
  || build.value?.artifacts?.length
  || build.value?.grimoires?.length
  || build.value?.equipment.some(item => Boolean(
    item.slotKey
    || item.refineLevel !== undefined
    || item.potential !== undefined
    || item.actualAffixes?.length
    || item.cards?.length
  ))
))
const loadoutNotice = computed(() => locale.value.startsWith('en')
  ? 'This build predates complete loadout snapshots. Empty slots and missing stats mean “not saved”; the page only shows equipment and skills that were actually recorded.'
  : '这套 BD 创建于完整配装快照上线之前。空槽位与缺失属性表示“未保存”；页面只展示当时真实记录的装备与技能，不会补造数据。')
const optionsNotice = computed(() => locale.value.startsWith('en')
  ? 'The live game catalog is temporarily unavailable. Saved snapshot names, icons, slots, and values are still shown.'
  : '本机游戏资料目录暂时不可用；页面仍会展示 BD 已保存的名称、图标、槽位与数值。')

const canonicalEquipmentSlots: Array<{ value: BuildEquipmentSlot; sourceName: string }> = [
  { value: 'head', sourceName: 'Head' },
  { value: 'eyewear', sourceName: 'Eyewear' },
  { value: 'back', sourceName: 'Back' },
  { value: 'chest', sourceName: 'Chest' },
  { value: 'main-hand', sourceName: 'Mainhand' },
  { value: 'off-hand', sourceName: 'Offhand' },
  { value: 'legs', sourceName: 'Legs' },
  { value: 'feet', sourceName: 'Feet' },
  { value: 'accessory-left', sourceName: 'AccessoryLeft' },
  { value: 'accessory-right', sourceName: 'AccessoryRight' }
]
const canonicalArtifactSlots: BuildArtifactSlot[] = ['Rune', 'Jewel', 'Scroll', 'Relic']

function snapshotOption(item: {
  id: string
  slug?: string
  name?: string
  nameZh?: string
  nameEn?: string
  icon?: string
}, extra: Partial<BuilderOption> = {}): BuilderOption {
  return {
    id: item.id,
    slug: item.slug || item.id,
    name: { zh: item.nameZh || item.name || item.id, en: item.nameEn || item.name || item.id },
    icon: item.icon,
    ...extra
  }
}

function uniqueOptions(items: BuilderOption[]) {
  return [...new Map(items.map(item => [item.id, item])).values()]
}

function compactBuilderOptions(options: BuilderOptions): BuilderOptions {
  const value = build.value
  if (!value) return options
  const skillIds = new Set([...(value.skills || []).map(item => item.id), ...(value.skillTree || []).filter(item => item.kind === 'active').map(item => item.id)])
  const passiveIds = new Set((value.skillTree || []).filter(item => item.kind === 'passive').map(item => item.id))
  const equipmentIds = new Set(value.equipment.map(item => item.id))
  const artifactIds = new Set((value.artifacts || []).map(item => item.id))
  const gemIds = new Set((value.artifacts || []).flatMap(item => item.gem ? [item.gem.id] : []))
  const cardIds = new Set(value.equipment.flatMap(item => (item.cards || []).map(card => card.id)))
  const grimoireIds = new Set((value.grimoires || []).map(item => item.id))
  const archetypeIds = new Set([value.archetype, ...(value.skillTree || []).map(item => item.treeArchetype)])
  let discoveredParent = true
  while (discoveredParent) {
    discoveredParent = false
    for (const item of options.archetypes) {
      if (!archetypeIds.has(item.id) || !item.requiredClassId || archetypeIds.has(item.requiredClassId)) continue
      archetypeIds.add(item.requiredClassId)
      discoveredParent = true
    }
  }
  const selectedEquipmentOptions = options.equipment.filter(item => equipmentIds.has(item.id))
  const setIds = new Set([
    ...value.equipment.flatMap(item => item.setId ? [item.setId] : []),
    ...selectedEquipmentOptions.flatMap(item => item.setId ? [item.setId] : [])
  ])
  return {
    ...options,
    archetypes: options.archetypes.filter(item => archetypeIds.has(item.id)),
    skills: options.skills.filter(item => skillIds.has(item.id)),
    skillPassives: options.skillPassives.filter(item => passiveIds.has(item.id)),
    equipment: selectedEquipmentOptions,
    grimoires: options.grimoires.filter(item => grimoireIds.has(item.id)),
    artifacts: options.artifacts.filter(item => artifactIds.has(item.id)),
    gems: options.gems.filter(item => gemIds.has(item.id)),
    cards: options.cards.filter(item => cardIds.has(item.id)),
    equipmentSets: (options.equipmentSets || []).filter(item => setIds.has(item.id))
  }
}

const snapshotOnlyOptions = computed<BuilderOptions>(() => {
  const value = build.value
  const archetypes: BuilderOption[] = []
  if (value) {
    archetypes.push(snapshotOption({
      id: value.archetype,
      slug: value.archetype,
      name: value.archetype,
      nameZh: value.archetypeZh,
      nameEn: value.archetype,
      icon: value.classIcon
    }))
    for (const treeArchetype of new Set((value.skillTree || []).map(skill => skill.treeArchetype))) {
      if (treeArchetype !== value.archetype) archetypes.push(snapshotOption({ id: treeArchetype }))
    }
  }
  const equipment = (value?.equipment || []).map(item => snapshotOption(item, { slot: item.slot }))
  const artifacts = (value?.artifacts || []).map(item => snapshotOption(item, {
    parts: item.partIcon ? [{ index: item.partIndex, icon: item.partIcon }] : [],
    partCount: 4
  }))
  const grimoires = (value?.grimoires || []).map(item => snapshotOption(item))
  const gems = (value?.artifacts || []).flatMap(item => item.gem ? [snapshotOption(item.gem)] : [])
  const cards = (value?.equipment || []).flatMap(item => (item.cards || []).map(card => snapshotOption(card, { equipClass: card.equipClass })))
  const allocations = value?.skillTree || []
  return {
    archetypes: uniqueOptions(archetypes),
    skills: uniqueOptions([...(value?.skills || []).map(item => snapshotOption(item)), ...allocations.filter(item => item.kind === 'active').map(item => snapshotOption(item, { maxLevel: item.maxLevel }))]),
    skillPassives: uniqueOptions(allocations.filter(item => item.kind === 'passive').map(item => snapshotOption(item, { maxLevel: item.maxLevel, configKind: 'passive' }))),
    equipment: uniqueOptions(equipment),
    grimoires: uniqueOptions(grimoires),
    artifacts: uniqueOptions(artifacts),
    gems: uniqueOptions(gems),
    cards: uniqueOptions(cards),
    equipmentSlots: canonicalEquipmentSlots,
    artifactSlots: canonicalArtifactSlots,
    stances: ['None', 'Unarmed', 'OneHanded', 'TwoHanded', 'DualWield'],
    statTypes: (value?.character?.stats || []).map(stat => stat.type),
    difficulties: [],
    metadata: {
      skillTreeOwnership: 'user-confirmed',
      equipmentRuntimeSlotsMeaning: 'unverified',
      artifactPartSlotMapping: 'user-confirmed'
    }
  }
})
const loadoutOptions = computed(() => builderOptions.value || snapshotOnlyOptions.value)
const loadoutArchetype = computed(() => loadoutOptions.value.archetypes.find(item => item.id === build.value?.archetype)
  || snapshotOnlyOptions.value.archetypes.find(item => item.id === build.value?.archetype))
const itemPath = (item: Build['equipment'][number]) => item.kind === 'artifact'
  ? `/catalog/artifacts/${encodeURIComponent(String(item.slug))}`
  : `/equipment/${encodeURIComponent(String(item.slug))}`

function sourceDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(date)
}

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
        <div class="build-detail-source-badges">
          <span v-if="build.tier !== 'Community'" class="tier tier-s">{{ `${build.tier} TIER` }}</span>
          <span class="build-card__source" :class="{ 'build-card__source--external': isExternal }">{{ isExternal ? t('builds.sourceExternal') : t('builds.sourceUser') }}</span>
        </div>
        <h1>{{ title }}</h1>
        <p>{{ buildClass }} · {{ difficultyText(build.difficulty) }} · {{ build.patch }}</p>
      </div>
    </div>

    <section v-if="provenance" class="build-provenance" :aria-label="t('builds.sourceTitle')">
      <div class="build-provenance__copy">
        <span>{{ t('builds.sourceExternal') }}</span>
        <strong>{{ provenance.site }}</strong>
        <p>
          <template v-if="provenance.author">{{ t('builds.sourceAuthor', { author: provenance.author }) }}</template>
          <template v-if="sourceDate(provenance.sourceCreatedAt)"> · {{ t('builds.sourcePublished', { date: sourceDate(provenance.sourceCreatedAt) }) }}</template>
          · {{ t('builds.originalLanguage', { language: provenance.originalLanguage }) }}
        </p>
      </div>
      <div v-if="sourceMetrics" class="build-provenance__metrics" :aria-label="t('builds.sourceMetricsTitle')">
        <div><strong>{{ Number(sourceMetrics.likes || 0).toLocaleString(locale) }}</strong><span>{{ t('builds.sourceLikes') }}</span></div>
        <div><strong>{{ Number(sourceMetrics.views || 0).toLocaleString(locale) }}</strong><span>{{ t('builds.sourceViews') }}</span></div>
        <small>{{ t('builds.sourceMetricsSnapshot', { date: sourceDate(sourceMetrics.fetchedAt) }) }}</small>
      </div>
      <a :href="provenance.sourceUrl" target="_blank" rel="noopener noreferrer nofollow">{{ t('builds.openOriginal') }} ↗</a>
    </section>

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

    <section class="build-snapshot-view" aria-labelledby="loadout-preview-title">
      <header class="build-snapshot-view__header">
        <div><span>{{ t('builds.loadoutPreviewKicker') }}</span><h2 id="loadout-preview-title">{{ t('builds.loadoutPreview') }}</h2></div>
        <div class="build-snapshot-view__summary">
          <strong v-if="build.character?.name">{{ build.character.name }}</strong>
          <p>{{ t('builds.loadoutPreviewDescription') }}</p>
        </div>
      </header>
      <p v-if="!hasLoadoutSnapshot" class="build-snapshot-view__notice">{{ loadoutNotice }}</p>
      <p v-if="builderOptionsError" class="build-snapshot-view__notice build-snapshot-view__notice--warning">{{ optionsNotice }}</p>
      <BuildLoadoutBoard
        :options="loadoutOptions"
        mode="view"
        :archetype="loadoutArchetype"
        :equipment-selections="build.equipment"
        :artifact-selections="build.artifacts || []"
        :grimoire-selections="build.grimoires || []"
        :character="build.character"
        :skill-tree="build.skillTree || []"
      />
      <BuildSnapshotDetails :build="build" />
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
        <div v-if="guideHtml" class="build-rich-text" v-html="guideHtml"/>
        <ol v-else-if="guide.length"><li v-for="(step, index) in guide" :key="`${index}-${step}`">{{ step }}</li></ol>
        <p v-else class="build-rich-text__empty">{{ t('builds.guideEmpty') }}</p>
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

<style scoped>
.build-snapshot-view { margin: clamp(34px, 6vw, 68px) 0; }
.build-snapshot-view__header { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; margin-bottom: 18px; }
.build-snapshot-view__header > div:first-child { flex: 0 0 auto; }
.build-snapshot-view__header span { color: #168d7e; font-size: 11px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.build-snapshot-view__header h2 { margin: 6px 0 0; color: #123d39; font-size: clamp(26px, 3.2vw, 40px); }
.build-snapshot-view__summary { max-width: 650px; text-align: right; }
.build-snapshot-view__summary strong { display: block; margin-bottom: 5px; color: #176f65; font-size: 13px; }
.build-snapshot-view__summary p { margin: 0; color: #6b817d; font-size: 11px; line-height: 1.7; }
.build-snapshot-view__notice { margin: 0 0 14px; padding: 13px 16px; border: 1px solid #d7e8e3; border-radius: 14px; color: #476d67; background: #edf7f4; font-size: 11px; line-height: 1.7; }
.build-snapshot-view__notice--warning { border-color: #eadfc8; color: #79684c; background: #faf5e9; }
.build-rich-text { color:#49635f; font-size:12px; line-height:1.8; overflow-wrap:anywhere; }
.build-rich-text :deep(h2),.build-rich-text :deep(h3) { color:#173f3b; line-height:1.3; }
.build-rich-text :deep(h2) { margin:22px 0 9px; font-size:20px; }
.build-rich-text :deep(h3) { margin:18px 0 8px; font-size:16px; }
.build-rich-text :deep(p) { margin:8px 0; }
.build-rich-text :deep(ul),.build-rich-text :deep(ol) { padding-left:24px; }
.build-rich-text :deep(blockquote) { margin:14px 0; padding:10px 14px; border-left:3px solid #2aa28f; border-radius:0 8px 8px 0; color:#58716d; background:#eef7f3; }
.build-rich-text :deep(pre) { max-width:100%; padding:13px; overflow:auto; border-radius:10px; color:#dff8f1; background:#123d3a; font:10px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace; }
.build-rich-text :deep(code) { padding:2px 4px; border-radius:4px; color:#0b7065; background:#e7f3ef; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
.build-rich-text :deep(pre code) { padding:0; color:inherit; background:transparent; }
.build-rich-text :deep(a) { color:#0a8173; text-decoration:underline; text-underline-offset:2px; }
.build-rich-text__empty { margin:0; color:#899793; font-size:11px; }

@media (max-width: 720px) {
  .build-snapshot-view__header { display: grid; align-items: start; gap: 10px; }
  .build-snapshot-view__summary { text-align: left; }
}
</style>
