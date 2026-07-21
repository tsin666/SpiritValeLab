<script setup lang="ts">
import type { Archetype } from '~/composables/useApi'

const api = useApi()
const route = useRoute()
const { t, locale } = useI18n()
const { gameLocale, gameText, slotText, typeText, elementText } = useGameLocale()
const { buildTitle, buildSummary } = useBuildLocale()
const localePath = useLocalePath()
const slug = computed(() => String(route.params.slug))
const { data: item, status, error, refresh } = await useFetch<Archetype>(() => `${api}/api/archetypes/${encodeURIComponent(slug.value)}`, { watch: [slug] })
const name = computed(() => gameText(item.value?.name, item.value?.displayName || item.value?.id || t('classes.unnamed')))
const role = computed(() => gameText(item.value?.roleLabel, item.value?.role || t('classes.roleMissing')))
const stage = computed(() => gameText(item.value?.stageLabel, item.value?.stage ? t(`classes.stages.${item.value.stage}`) : ''))
const description = computed(() => gameText(item.value?.description, t('classes.descriptionMissing')))
const alternateName = computed(() => {
  if (!item.value?.name || typeof item.value.name === 'string') return ''
  const value = gameLocale.value === 'en' ? item.value.name.zh : item.value.name.en
  return value && value !== name.value ? value : ''
})
const skillName = (skill: NonNullable<Archetype['skills']>[number]) => gameText(skill.name, skill.displayName || skill.id)
const skillAlternateName = (skill: NonNullable<Archetype['skills']>[number]) => typeof skill.name === 'object' ? (gameLocale.value === 'en' ? skill.name.zh : skill.name.en) : ''
const previewSkills = computed(() => item.value?.previewSkills || item.value?.skills || [])
const buildReferencedSkills = computed(() => item.value?.buildReferencedSkills || [])
const equipmentName = (equipment: NonNullable<Archetype['equipment']>[number]) => gameText(equipment.name, equipment.id)
const equipmentMeta = (equipment: NonNullable<Archetype['equipment']>[number]) => [typeText(equipment.type), slotText(equipment.slot), elementText(equipment.element)].filter(Boolean).join(' · ')
const buildClass = (build: NonNullable<Archetype['relatedBuilds']>[number]) => locale.value.startsWith('en') ? build.archetype : (build.archetypeZh || build.archetype)
const linkedClassName = (linked: NonNullable<Archetype['requiredClass']>) => gameText(linked.name, linked.displayName || linked.id)
const runtimeFacts = computed(() => item.value ? [
  { label: t('classes.maxJobLevel'), value: item.value.maxJobLevel != null ? String(item.value.maxJobLevel) : '' },
  { label: t('classes.healthMultiplier'), value: item.value.healthMultiplier != null ? `×${Number(item.value.healthMultiplier).toLocaleString(locale.value, { maximumFractionDigits: 2 })}` : '' }
].filter(entry => entry.value) : [])
useSeoMeta({ title: () => t('classes.detailSeoTitle', { name: name.value }), description: () => description.value })
</script>

<template>
  <main class="page class-detail-page">
    <NuxtLink class="back" :to="localePath('/classes')">← {{ t('classes.back') }}</NuxtLink>
    <section v-if="status === 'pending' && !item" class="database-state"><span class="database-state__mark">…</span><h2>{{ t('classes.loading') }}</h2></section>
    <section v-else-if="error || !item" class="database-state database-state--error"><span class="database-state__mark">!</span><h1>{{ t('classes.notFound') }}</h1><p>{{ error?.statusCode === 404 ? t('classes.notFoundHint') : t('classes.loadError') }}</p><div class="database-state__actions"><NuxtLink :to="localePath('/classes')">{{ t('classes.browse') }}</NuxtLink><button type="button" @click="refresh">{{ t('common.retry') }}</button></div></section>
    <template v-else>
      <header class="class-detail-hero"><ClassIcon :item="item" size="large"/><div><span>{{ role }}<template v-if="stage"> · {{ stage }}</template></span><h1>{{ name }}</h1><small v-if="alternateName">{{ alternateName }}</small><p>{{ description }}</p></div><NuxtLink :to="localePath({ path: '/builder', query: { archetype: item.id } })">{{ t('classes.createWithClass') }}</NuxtLink></header>
      <div class="class-detail-layout">
        <div class="class-detail-main">
          <section class="database-panel class-progression-panel">
            <div class="panel-heading"><div><span>{{ t('classes.lineageKicker') }}</span><h2>{{ t('classes.progressionPath') }}</h2></div><small>{{ t('classes.binaryVerified') }}</small></div>
            <div v-if="item.requiredClass" class="class-progression-path"><NuxtLink :to="localePath(`/classes/${encodeURIComponent(item.requiredClass.slug)}`)"><ClassIcon :item="item.requiredClass" size="small"/><span><small>{{ t('classes.stages.base') }}</small><strong>{{ linkedClassName(item.requiredClass) }}</strong></span></NuxtLink><b aria-hidden="true">→</b><div class="class-progression-current"><ClassIcon :item="item" size="small"/><span><small>{{ t('classes.jobLevelRequirement', { level: item.advancementJobLevel || 50 }) }}</small><strong>{{ name }}</strong></span></div></div>
            <div v-else-if="item.advancementOptions?.length" class="class-progression-branches"><p>{{ t('classes.chooseAdvancedAt', { level: item.lineageSource?.advancementJobLevel || 50 }) }}</p><div><NuxtLink v-for="advanced in item.advancementOptions.filter(option => option.configPresent)" :key="advanced.id" :to="localePath(`/classes/${encodeURIComponent(advanced.slug)}`)"><ClassIcon :item="advanced" size="small"/><span><strong>{{ linkedClassName(advanced) }}</strong><small>{{ t('classes.stages.advanced') }}</small></span><b>→</b></NuxtLink><div v-for="advanced in item.advancementOptions.filter(option => !option.configPresent)" :key="advanced.id" class="class-progression-unavailable"><ClassIcon :item="advanced" size="small"/><span><strong>{{ linkedClassName(advanced) }}</strong><small>{{ t('classes.configNotPresent') }}</small></span></div></div></div>
            <p v-else-if="item.stage === 'special'" class="data-confirmed">{{ t('classes.specialProgression') }}</p>
            <p v-else-if="item.stage === 'profession'" class="data-confirmed">{{ t('classes.professionProgression') }}</p>
            <p v-else class="data-missing">{{ t('classes.noProgression') }}</p>
            <p class="class-progression-source">{{ t('classes.progressionEvidence', { method: item.lineageSource?.method || 'Formula.GetRequiredClass', rva: item.lineageSource?.rva || '0x947430' }) }}</p>
          </section>
          <section class="database-panel class-runtime-panel">
            <div class="panel-heading"><div><span>{{ t('classes.runtimeKicker') }}</span><h2>{{ t('classes.runtimeData') }}</h2></div></div>
            <dl v-if="runtimeFacts.length" class="class-runtime-facts"><div v-for="fact in runtimeFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl>
            <div class="class-runtime-relations"><div><b>{{ t('classes.starterItems') }}</b><div v-if="item.starterItemIds?.length" class="token-list"><span v-for="id in item.starterItemIds" :key="id">{{ id }}</span></div><p v-else>{{ t('classes.noneConfigured') }}</p></div><div><b>{{ t('classes.displayItems') }}</b><div v-if="item.displayItemIds?.length" class="token-list"><span v-for="id in item.displayItemIds" :key="id">{{ id }}</span></div><p v-else>{{ t('classes.noneConfigured') }}</p></div></div>
            <div class="class-attribute-block"><b>{{ t('classes.attributes') }}</b><div v-if="item.attributes?.length" class="class-attribute-list"><span v-for="(value,index) in item.attributes" :key="index"><small>{{ t('classes.attributePosition', { number: index + 1 }) }}</small><strong>{{ value }}</strong></span></div><p v-else class="data-missing">{{ t('classes.attributesMissing') }}</p><small v-if="item.attributes?.length" class="class-attribute-note">{{ t('classes.attributesOrderUnknown') }}</small></div>
          </section>

          <section class="database-panel">
            <div class="panel-heading"><div><span>{{ t('classes.previewSkillsKicker') }}</span><h2>{{ t('classes.previewSkills') }}</h2></div><small>{{ t('common.itemCount', { count: previewSkills.length }) }}</small></div>
            <p class="database-panel-note">{{ t('classes.previewSkillsDescription') }}</p>
            <div v-if="previewSkills.length" class="class-skill-grid"><NuxtLink v-for="skill in previewSkills" :key="skill.id" :to="localePath(`/catalog/skills/${encodeURIComponent(skill.slug)}`)"><ClassIcon :item="skill" kind="skill" size="small"/><div><h3>{{ skillName(skill) }}</h3><small v-if="skillAlternateName(skill) && skillAlternateName(skill) !== skillName(skill)">{{ skillAlternateName(skill) }}</small><p>{{ gameText(skill.description, t('classes.skillDescriptionMissing')) }}</p></div><b aria-hidden="true">→</b></NuxtLink></div><p v-else class="data-missing">{{ t('classes.previewSkillsMissing') }}</p>
          </section>

          <section class="database-panel">
            <div class="panel-heading"><div><span>{{ t('classes.buildReferencedSkillsKicker') }}</span><h2>{{ t('classes.buildReferencedSkills') }}</h2></div><small>{{ t('common.itemCount', { count: buildReferencedSkills.length }) }}</small></div>
            <p class="database-panel-note">{{ t('classes.buildReferencedSkillsDescription') }}</p>
            <div v-if="buildReferencedSkills.length" class="class-skill-grid"><NuxtLink v-for="skill in buildReferencedSkills" :key="skill.id" :to="localePath(`/catalog/skills/${encodeURIComponent(skill.slug)}`)"><ClassIcon :item="skill" kind="skill" size="small"/><div><h3>{{ skillName(skill) }}</h3><small v-if="skillAlternateName(skill) && skillAlternateName(skill) !== skillName(skill)">{{ skillAlternateName(skill) }}</small><p>{{ gameText(skill.description, t('classes.skillDescriptionMissing')) }}</p></div><b aria-hidden="true">→</b></NuxtLink></div><p v-else class="data-missing">{{ t('classes.buildReferencedSkillsMissing') }}</p>
          </section>

          <section class="database-panel"><div class="panel-heading"><div><span>{{ t('classes.equipmentKicker') }}</span><h2>{{ t('classes.equipment') }}</h2></div><small>{{ t('common.itemCount', { count: item.equipment?.length || 0 }) }}</small></div><div v-if="item.equipment?.length" class="class-equipment-grid"><NuxtLink v-for="equipment in item.equipment" :key="equipment.id" :to="localePath(`/equipment/${encodeURIComponent(equipment.slug)}`)"><EquipmentIcon :item="equipment" size="small"/><div><h3>{{ equipmentName(equipment) }}</h3><small>{{ equipmentMeta(equipment) || equipment.id }}</small></div><b aria-hidden="true">→</b></NuxtLink></div><p v-else class="data-missing">{{ t('classes.equipmentMissing') }}</p></section>
        </div>

        <aside class="database-panel related-builds-panel"><div class="panel-heading"><div><span>{{ t('classes.buildsKicker') }}</span><h2>{{ t('classes.builds') }}</h2></div><small>{{ t('common.buildCount', { count: item.relatedBuilds?.length || 0 }) }}</small></div><div v-if="item.relatedBuilds?.length" class="related-build-list"><NuxtLink v-for="build in item.relatedBuilds" :key="build.slug" :to="localePath(`/builds/${encodeURIComponent(build.slug)}`)"><img v-if="build.classIcon" :src="build.classIcon" alt=""><span v-else class="related-build-placeholder">BD</span><div><small>{{ buildClass(build) }} · {{ build.tier }} TIER</small><strong>{{ buildTitle(build) }}</strong><p>{{ buildSummary(build) }}</p></div><b>→</b></NuxtLink></div><div v-else class="related-build-empty"><p>{{ t('classes.noBuilds') }}</p><NuxtLink :to="localePath({ path: '/builder', query: { archetype: item.id } })">{{ t('classes.createFirstBuild') }} →</NuxtLink></div></aside>
      </div>
    </template>
  </main>
</template>
