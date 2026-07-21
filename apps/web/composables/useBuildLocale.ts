import type { Build, BuildEquipment, BuildMetric, BuildSkill } from '~/composables/useApi'

export function useBuildLocale() {
  const { gameLocale } = useGameLocale()

  const buildTitle = (build?: Partial<Build> | null) => gameLocale.value === 'en' ? (build?.titleEn || build?.title || '') : (build?.title || build?.titleEn || '')
  const buildSummary = (build?: Partial<Build> | null) => gameLocale.value === 'en' ? (build?.summaryEn || build?.summary || '') : (build?.summary || build?.summaryEn || '')
  const buildGuide = (build?: Partial<Build> | null) => gameLocale.value === 'en' ? (build?.guideEn?.length ? build.guideEn : (build?.guide || [])) : (build?.guide?.length ? build.guide : (build?.guideEn || []))
  const buildTags = (build?: Partial<Build> | null) => gameLocale.value === 'en' ? (build?.tagsEn?.length ? build.tagsEn : (build?.tags || [])) : (build?.tags?.length ? build.tags : (build?.tagsEn || []))
  const skillName = (skill?: Partial<BuildSkill> | null) => gameLocale.value === 'en'
    ? (skill?.nameEn || skill?.name || skill?.nameZh || '')
    : (skill?.nameZh || skill?.name || skill?.nameEn || '')
  const equipmentName = (item?: Partial<BuildEquipment> | null) => gameLocale.value === 'en'
    ? (item?.nameEn || item?.name || item?.nameZh || '')
    : (item?.nameZh || item?.name || item?.nameEn || '')
  const equipmentSlot = (item?: Partial<BuildEquipment> | null) => gameLocale.value === 'en' ? (item?.slotEn || item?.slot || '') : (item?.slot || item?.slotEn || '')
  const metricLabel = (metric?: Partial<BuildMetric> | null) => gameLocale.value === 'en' ? (metric?.labelEn || metric?.label || '') : (metric?.label || metric?.labelEn || '')

  return { buildTitle, buildSummary, buildGuide, buildTags, skillName, equipmentName, equipmentSlot, metricLabel }
}
