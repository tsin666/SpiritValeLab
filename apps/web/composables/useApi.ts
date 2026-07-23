export const useApi = () => useRuntimeConfig().public.apiBase as string

export type BuildSkill = {
  id: string
  slug?: string
  name: string
  nameZh?: string
  nameEn?: string
  icon?: string
}

export type BuildStatValue = {
  type: string
  value: number
  bonus?: number
  unit?: 'flat' | 'percent'
  subjectId?: string
}

export type BuildCharacterSnapshot = {
  name?: string
  level?: number
  jobLevel?: number
  stance?: 'None' | 'Unarmed' | 'OneHanded' | 'TwoHanded' | 'DualWield'
  stats?: BuildStatValue[]
}

export type BuildSkillAllocation = BuildSkill & {
  kind: 'active' | 'passive'
  level: number
  maxLevel: number
  treeArchetype: string
  treeArchetypeSource: 'user-confirmed' | 'external-source'
}

export type BuildEquipmentCard = {
  slotIndex: number
  id: string
  slug?: string
  name: string
  nameZh?: string
  nameEn?: string
  icon?: string
  descriptionZh?: string
  descriptionEn?: string
  equipClass: string
  stats?: RuntimeEffect[]
}

export type BuildEquipmentSlot =
  | 'main-hand'
  | 'off-hand'
  | 'head'
  | 'legs'
  | 'feet'
  | 'chest'
  | 'accessory-left'
  | 'accessory-right'
  | 'eyewear'
  | 'back'

export type RuntimeEffectValue = {
  base: number
  perLevel: number
  string?: string
  string2?: string
}

export type RuntimeEffect = {
  name: string
  type: string
  typeValue: number
  value: RuntimeEffectValue
  eventType: string
  eventTypeValue: number
  eventValue?: string
  conditionType: string
  conditionTypeValue: number
  conditionValue?: string
  chance: number
  triggerType: string
  triggerTypeValue: number
  target: string
  targetValue: number
}

export type RuntimeRequirement = {
  skillId: string
  level: number
  resolvedConfigKind: 'active' | 'passive'
}

export type BuildEquipmentSet = {
  id: string
  slug?: string
  name?: string
  nameZh?: string
  nameEn?: string
  icon?: string
  equipmentIds?: string[]
  effects?: RuntimeEffect[]
}

export type BuildEquipment = {
  id: string
  slug?: string
  kind?: 'equipment' | 'artifact'
  name: string
  nameZh?: string
  nameEn?: string
  slot: string
  slotEn?: string
  icon?: string
  slotKey?: BuildEquipmentSlot
  descriptionZh?: string
  descriptionEn?: string
  type?: string
  element?: string
  levelRequired?: number
  primaryStats?: RuntimeEffect[]
  secondaryStats?: RuntimeEffect[]
  refineLevel?: number
  potential?: number
  actualAffixes?: BuildStatValue[]
  cards?: BuildEquipmentCard[]
  setId?: string
  set?: BuildEquipmentSet
}

export type BuildArtifactSlot = 'Rune' | 'Jewel' | 'Scroll' | 'Relic'

export type BuildArtifactGem = {
  id: string
  slug?: string
  name: string
  nameZh?: string
  nameEn?: string
  icon?: string
  descriptionZh?: string
  descriptionEn?: string
  affix?: string
  stats?: RuntimeEffect[]
}

export type BuildArtifact = {
  slot: BuildArtifactSlot
  partIndex: 0 | 1 | 2 | 3
  id: string
  slug?: string
  name: string
  nameZh?: string
  nameEn?: string
  descriptionZh?: string
  descriptionEn?: string
  partIcon?: string
  partDescriptionZh?: string
  partDescriptionEn?: string
  fullSet?: RuntimeEffect[]
  perPiece?: RuntimeEffect[]
  perRefine?: RuntimeEffect[]
  individual?: RuntimeEffect[]
  refineLevel?: number
  actualAffixes?: BuildStatValue[]
  gem?: BuildArtifactGem
}

export type BuildGrimoire = {
  slotIndex: 0 | 1 | 2
  id: string
  slug?: string
  name: string
  nameZh?: string
  nameEn?: string
  icon?: string
  passive?: BuildGrimoirePassive
}

export type BuildGrimoirePassive = {
  id: string
  slug?: string
  name?: string
  nameZh?: string
  nameEn?: string
  icon?: string
  descriptionZh?: string
  descriptionEn?: string
  maxLevel: number
  weaponTypes?: string[]
  weaponTypeValues?: number[]
  stanceTypes?: string[]
  stanceTypeValues?: number[]
  requirements?: RuntimeRequirement[]
  effects?: RuntimeEffect[]
}

export type BuildMetric = {
  label: string
  labelEn?: string
  value: number
}

export type BuildProvenance = {
  site: string
  sourceId: string
  sourceUrl: string
  author?: string
  originalLanguage: string
  originalTitle: string
  sourceCreatedAt?: string
  sourceUpdatedAt?: string
}

export type BuildSourceMetrics = {
  likes?: number
  views?: number
  fetchedAt: string
}

export type Build = {
  slug: string
  title: string
  titleEn?: string
  archetype: string
  archetypeZh: string
  tier: string
  patch: string
  difficulty: string
  summary: string
  summaryEn?: string
  guide: string[]
  guideHtml?: string
  guideHtmlEn?: string
  guideEn?: string[]
  tags: string[]
  tagsEn?: string[]
  role?: string
  buildType?: string
  buildFor?: string
  buildOrientation?: string
  views: number
  likes: number
  rankScore?: number
  createdAt?: string
  updatedAt: string
  color?: string
  classIcon?: string
  snapshotVersion?: 1
  character?: BuildCharacterSnapshot
  skills: BuildSkill[]
  skillTree?: BuildSkillAllocation[]
  equipment: BuildEquipment[]
  artifacts?: BuildArtifact[]
  grimoires?: BuildGrimoire[]
  metrics: BuildMetric[]
  source?: 'seed' | 'user' | 'external'
  userGenerated?: boolean
  createdBy?: string
  provenance?: BuildProvenance
  sourceMetrics?: BuildSourceMetrics
}

export type ApiHealth = {
  ok?: boolean
  localizedCatalogEntries?: number
  runtimeCatalogEntries?: number
  equipmentEntries?: number
  archetypeEntries?: number
  skillEntries?: number
  artifactEntries?: number
  gemEntries?: number
  equipmentSetEntries?: number
  runtimeDataSource?: string
}

export type LocalizedText = {
  zh?: string
  en?: string
}

export type ArchetypeFallbackIconBasis = 'npc-config-same-id'

export type ArchetypeFallbackIconSource = {
  publicPath?: string
  sourcePathId: number
  sourceName?: string
  sourceWidth?: number
  sourceHeight?: number
  width?: number
  height?: number
  configClass: 'NpcConfig'
  configId: string
  configSourcePathId: number
  spriteId: string
}

export type FacetOption = {
  value: string
  label: string
  count: number
}

export type EquipmentValue = {
  label?: string
  name?: string
  type?: string
  value?: unknown
  description?: string
  tier?: number | string
  requiredPieces?: number
  [key: string]: unknown
}

export type EquipmentSet = {
  id?: string
  slug?: string
  name?: string | LocalizedText
  displayName?: string
  description?: string | LocalizedText
  fullSet?: EquipmentValue[]
  [key: string]: unknown
}

export type Equipment = {
  id: string
  slug: string
  name: string | LocalizedText
  displayName?: string
  description?: string | LocalizedText
  category?: string | null
  categoryLabel?: string | LocalizedText | null
  icon?: string | null
  slot?: string | null
  slots?: string[] | number | null
  type?: string | null
  element?: string | null
  levelRequired?: number | null
  unique?: boolean | null
  characterBound?: boolean | string | null
  material?: string | LocalizedText | null
  materialId?: string | null
  allowedArchetypes?: string[]
  hasArchetypeRestriction?: boolean
  setId?: string | null
  set?: EquipmentSet | null
  runtimeSlots?: number | null
  slotsValue?: number | null
  fieldSources?: Record<string, 'source' | 'type-derived' | 'name-derived' | 'pool-derived' | 'default' | string>
  derivedFields?: string[]
  stats?: EquipmentValue[]
  primaryStats?: EquipmentValue[]
  secondaryStats?: EquipmentValue[]
  availableAffixes?: EquipmentValue[]
  /** Compatibility with pre-runtime-contract API responses. */
  affixes?: EquipmentValue[]
  setBonuses?: EquipmentValue[]
  relatedBuilds?: Array<Pick<Build, 'slug' | 'title' | 'titleEn' | 'archetype' | 'archetypeZh' | 'tier' | 'summary' | 'summaryEn' | 'color' | 'classIcon'>>
}

export type EquipmentFacets = {
  categories: FacetOption[]
  archetypes: FacetOption[]
  slots: FacetOption[]
  types: FacetOption[]
  elements: FacetOption[]
  levels: FacetOption[]
  sets: FacetOption[]
}

export type EquipmentListResponse = {
  items: Equipment[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  facets: EquipmentFacets
}

export type ArchetypeSkill = {
  id: string
  slug: string
  name: string | LocalizedText
  displayName?: string
  description?: string | LocalizedText
  icon?: string | null
}

export type ArchetypeStage = 'base' | 'advanced' | 'special' | 'profession'

export type ArchetypeLink = {
  id: string
  slug: string
  name: string | LocalizedText
  displayName?: string
  description?: string | LocalizedText
  icon?: string | null
  fallbackIcon?: string | null
  fallbackIconSource?: ArchetypeFallbackIconSource | null
  fallbackIconBasis?: ArchetypeFallbackIconBasis | null
  role?: string | null
  roleLabel?: string | LocalizedText | null
  stage?: ArchetypeStage
  stageLabel?: string | LocalizedText | null
  configPresent?: boolean
}

export type Archetype = {
  id: string
  slug: string
  name: string | LocalizedText
  displayName?: string
  description?: string | LocalizedText
  role?: string | null
  roleLabel?: string | LocalizedText | null
  stage?: ArchetypeStage
  stageLabel?: string | LocalizedText | null
  requiredClassId?: string | null
  advancesToIds?: string[]
  advancementJobLevel?: number | null
  requiredClass?: ArchetypeLink | null
  advancesTo?: ArchetypeLink[]
  advancementOptions?: ArchetypeLink[]
  lineageSource?: {
    source?: string
    method?: string
    rva?: string
    jumpTableRva?: string
    gameAssemblySha256?: string
    advancementJobLevel?: number
    advancementJobLevelSource?: string
  }
  icon?: string | null
  fallbackIcon?: string | null
  fallbackIconSource?: ArchetypeFallbackIconSource | null
  fallbackIconBasis?: ArchetypeFallbackIconBasis | null
  maxJobLevel?: number | null
  healthMultiplier?: number | null
  starterItemIds?: string[]
  displayItemIds?: string[]
  attributes?: number[]
  previewSkills?: ArchetypeSkill[]
  buildReferencedSkills?: ArchetypeSkill[]
  /** Compatibility with pre-runtime-contract API responses. */
  skills?: ArchetypeSkill[]
  equipment?: Array<Pick<Equipment, 'id' | 'slug' | 'name' | 'icon' | 'type' | 'slot' | 'element' | 'levelRequired' | 'setId'>>
  relatedBuilds?: Array<Pick<Build, 'slug' | 'title' | 'titleEn' | 'archetype' | 'archetypeZh' | 'tier' | 'summary' | 'summaryEn' | 'color' | 'classIcon'>>
}

export type ArchetypeListResponse = {
  items: Archetype[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  facets: { roles: FacetOption[]; stages: FacetOption[] }
}

export type BuilderOption = {
  id: string
  slug: string
  name: string | LocalizedText
  displayName?: string
  category?: string | null
  slot?: string | null
  type?: string | null
  element?: string | null
  levelRequired?: number | null
  icon?: string | null
  fallbackIcon?: string | null
  fallbackIconSource?: ArchetypeFallbackIconSource | null
  fallbackIconBasis?: ArchetypeFallbackIconBasis | null
  allowedArchetypes?: Array<string | { value?: string; label?: string }>
  recommendedArchetypes?: string[]
  previewedByArchetypes?: string[]
  stage?: ArchetypeStage
  requiredClassId?: string | null
  advancementJobLevel?: number | null
  maxJobLevel?: number | null
  maxLevel?: number | null
  configKind?: string | null
  hasArchetypeRestriction?: boolean
  parts?: Array<{ index: number; icon?: string | null }>
  partCount?: number
  descriptionZh?: string | null
  descriptionEn?: string | null
  fullSet?: RuntimeEffect[]
  perPiece?: RuntimeEffect[]
  perRefine?: RuntimeEffect[]
  individual?: RuntimeEffect[]
  stats?: RuntimeEffect[]
  affix?: string | LocalizedText | null
  equipClass?: string | null
  unique?: boolean
  isBoss?: boolean
  setId?: string | null
  passive?: BuildGrimoirePassive
}

export type BuilderEquipmentSlotOption = {
  value: BuildEquipmentSlot
  sourceName: string
}

export type BuilderOptionsMetadata = {
  skillTreeOwnership: 'user-confirmed'
  equipmentRuntimeSlotsMeaning: 'unverified'
  artifactPartSlotMapping: 'user-confirmed'
}

export type BuilderOptions = {
  archetypes: BuilderOption[]
  skills: BuilderOption[]
  skillPassives: BuilderOption[]
  equipment: BuilderOption[]
  equipmentSets?: BuildEquipmentSet[]
  grimoires: BuilderOption[]
  artifacts: BuilderOption[]
  gems: BuilderOption[]
  cards: BuilderOption[]
  equipmentSlots: BuilderEquipmentSlotOption[]
  artifactSlots: BuildArtifactSlot[]
  stances: NonNullable<BuildCharacterSnapshot['stance']>[]
  statTypes: string[]
  difficulties: string[]
  metadata: BuilderOptionsMetadata
}

export function localizedText(value?: string | LocalizedText | null, locale: 'zh' | 'en' = 'zh') {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] || value.zh || value.en || ''
}

export function equipmentName(item?: Partial<Equipment> | null) {
  return item?.displayName || localizedText(item?.name) || item?.id || '未命名装备'
}

export function equipmentCategory(item?: Partial<Equipment> | null) {
  return localizedText(item?.categoryLabel) || item?.category || '未分类'
}

export function archetypeName(item?: Partial<Archetype> | null) {
  return item?.displayName || localizedText(item?.name) || item?.id || '未命名职业'
}
