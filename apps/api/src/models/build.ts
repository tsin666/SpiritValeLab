import mongoose, { Schema } from 'mongoose'
import { ArtifactSlot, StanceType, StatType } from '../runtime-data.js'
import { guideHtmlTextLength, MAX_GUIDE_TEXT_LENGTH, normalizeGuideHtml } from '../guide-html.js'

const childSchemaOptions = { _id: false, strict: true } as const
const strictExternalSchemaOptions = { _id: false, strict: 'throw' } as const
const SHA256_PATTERN = /^[a-f0-9]{64}$/

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const buildStatValueSchema = new Schema({
  type: { type: String, required: true, enum: [...StatType] },
  value: { type: Number, required: true, min: -1_000_000_000, max: 1_000_000_000 },
  bonus: { type: Number, min: -1_000_000_000, max: 1_000_000_000 },
  unit: { type: String, enum: ['flat', 'percent'], default: 'flat' },
  subjectId: { type: String, trim: true, maxlength: 120 }
}, childSchemaOptions)

const buildSkillSchema = new Schema({
  id: String,
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String
}, childSchemaOptions)

const buildSkillTreeSchema = new Schema({
  kind: { type: String, required: true, enum: ['active', 'passive'] },
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  level: { type: Number, required: true, min: 0, max: 10 },
  maxLevel: { type: Number, required: true, min: 0 },
  treeArchetype: { type: String, required: true },
  treeArchetypeSource: { type: String, required: true, enum: ['user-confirmed', 'external-source'] }
}, childSchemaOptions)

const runtimeEffectValueSchema = new Schema({
  base: { type: Number, required: true },
  perLevel: { type: Number, required: true },
  string: String,
  string2: String
}, childSchemaOptions)

const runtimeEffectSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  typeValue: { type: Number, required: true },
  value: { type: runtimeEffectValueSchema, required: true },
  eventType: { type: String, required: true },
  eventTypeValue: { type: Number, required: true },
  eventValue: String,
  conditionType: { type: String, required: true },
  conditionTypeValue: { type: Number, required: true },
  conditionValue: String,
  chance: { type: Number, required: true },
  triggerType: { type: String, required: true },
  triggerTypeValue: { type: Number, required: true },
  target: { type: String, required: true },
  targetValue: { type: Number, required: true }
}, childSchemaOptions)

const buildCardSchema = new Schema({
  slotIndex: { type: Number, required: true, min: 0, max: 3 },
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  descriptionZh: String,
  descriptionEn: String,
  equipClass: String,
  stats: { type: [runtimeEffectSchema], default: undefined }
}, childSchemaOptions)

const buildEquipmentSetSchema = new Schema({
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  equipmentIds: { type: [String], default: undefined },
  effects: { type: [runtimeEffectSchema], default: undefined }
}, childSchemaOptions)

const runtimeRequirementSchema = new Schema({
  skillId: { type: String, required: true },
  level: { type: Number, required: true, min: 0 },
  resolvedConfigKind: { type: String, required: true, enum: ['active', 'passive'] }
}, childSchemaOptions)

const buildEquipmentSchema = new Schema({
  id: String,
  slug: String,
  kind: { type: String, enum: ['equipment', 'artifact'], default: 'equipment' },
  name: String,
  nameZh: String,
  nameEn: String,
  slot: String,
  slotEn: String,
  slotKey: {
    type: String,
    enum: ['main-hand', 'off-hand', 'head', 'legs', 'feet', 'chest', 'accessory-left', 'accessory-right', 'eyewear', 'back']
  },
  icon: String,
  descriptionZh: String,
  descriptionEn: String,
  type: String,
  element: String,
  levelRequired: Number,
  primaryStats: { type: [runtimeEffectSchema], default: undefined },
  secondaryStats: { type: [runtimeEffectSchema], default: undefined },
  refineLevel: { type: Number, min: 0, max: 100 },
  potential: { type: Number, min: 0, max: 100 },
  actualAffixes: { type: [buildStatValueSchema], default: [] },
  cards: { type: [buildCardSchema], default: [] },
  setId: String,
  set: { type: buildEquipmentSetSchema, default: undefined }
}, childSchemaOptions)

const buildArtifactGemSchema = new Schema({
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  descriptionZh: String,
  descriptionEn: String,
  affix: String,
  stats: { type: [runtimeEffectSchema], default: undefined }
}, childSchemaOptions)

const buildArtifactSchema = new Schema({
  slot: { type: String, required: true, enum: [...ArtifactSlot] },
  partIndex: { type: Number, required: true, min: 0, max: 3 },
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  descriptionZh: String,
  descriptionEn: String,
  partIcon: String,
  partDescriptionZh: String,
  partDescriptionEn: String,
  fullSet: { type: [runtimeEffectSchema], default: undefined },
  perPiece: { type: [runtimeEffectSchema], default: undefined },
  perRefine: { type: [runtimeEffectSchema], default: undefined },
  individual: { type: [runtimeEffectSchema], default: undefined },
  refineLevel: { type: Number, min: 0, max: 100 },
  actualAffixes: { type: [buildStatValueSchema], default: [] },
  gem: { type: buildArtifactGemSchema, default: undefined }
}, childSchemaOptions)

const buildGrimoireSchema = new Schema({
  slotIndex: { type: Number, required: true, min: 0, max: 2 },
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  passive: {
    type: new Schema({
      id: { type: String, required: true },
      slug: String,
      name: String,
      nameZh: String,
      nameEn: String,
      icon: String,
      descriptionZh: String,
      descriptionEn: String,
      maxLevel: { type: Number, required: true, min: 0 },
      weaponTypes: { type: [String], default: undefined },
      weaponTypeValues: { type: [Number], default: undefined },
      stanceTypes: { type: [String], default: undefined },
      stanceTypeValues: { type: [Number], default: undefined },
      requirements: { type: [runtimeRequirementSchema], default: undefined },
      effects: { type: [runtimeEffectSchema], default: undefined }
    }, childSchemaOptions),
    default: undefined
  }
}, childSchemaOptions)

const characterSnapshotSchema = new Schema({
  name: { type: String, trim: true, maxlength: 50 },
  level: { type: Number, min: 1, max: 1000 },
  jobLevel: { type: Number, min: 0, max: 1000 },
  stance: { type: String, enum: [...StanceType] },
  stats: { type: [buildStatValueSchema], default: [] }
}, childSchemaOptions)

const buildMetricSchema = new Schema({
  label: String,
  labelEn: String,
  value: { type: Number, min: 0, max: 100 }
}, childSchemaOptions)

const buildTranslationSchema = new Schema({
  targetLanguage: { type: String, required: true, enum: ['zh-CN'] },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'translated', 'reviewed', 'stale', 'failed', 'not-needed']
  },
  method: { type: String, enum: ['manual', 'machine-assisted'] },
  updatedAt: Date,
  sourceHash: {
    type: String,
    lowercase: true,
    match: SHA256_PATTERN,
    select: false
  }
}, strictExternalSchemaOptions)

const buildProvenanceSchema = new Schema({
  site: { type: String, required: true, trim: true, maxlength: 160 },
  sourceId: { type: String, required: true, trim: true, maxlength: 200 },
  sourceUrl: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2_048,
    validate: { validator: isHttpUrl, message: 'sourceUrl must use http or https' }
  },
  author: { type: String, trim: true, maxlength: 120 },
  originalLanguage: { type: String, required: true, trim: true, maxlength: 35 },
  originalTitle: { type: String, required: true, trim: true, maxlength: 500 },
  originalSummary: { type: String, maxlength: 10_000 },
  originalGuideHtml: {
    type: String,
    set: (value: unknown) => typeof value === 'string' ? normalizeGuideHtml(value) : undefined,
    validate: (value: string | undefined) => !value || guideHtmlTextLength(value) <= MAX_GUIDE_TEXT_LENGTH
  },
  sourceCreatedAt: Date,
  sourceUpdatedAt: Date,
  firstImportedAt: { type: Date, required: true },
  lastFetchedAt: { type: Date, required: true },
  contentHash: {
    type: String,
    required: true,
    lowercase: true,
    match: SHA256_PATTERN,
    select: false
  },
  translation: { type: buildTranslationSchema, required: true }
}, strictExternalSchemaOptions)

const buildSourceMetricsSchema = new Schema({
  likes: {
    type: Number,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    validate: { validator: Number.isSafeInteger, message: 'likes must be a non-negative safe integer' }
  },
  views: {
    type: Number,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    validate: { validator: Number.isSafeInteger, message: 'views must be a non-negative safe integer' }
  },
  comments: {
    type: Number,
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
    validate: { validator: Number.isSafeInteger, message: 'comments must be a non-negative safe integer' }
  },
  fetchedAt: { type: Date, required: true }
}, strictExternalSchemaOptions)

const buildSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  titleEn: String,
  archetype: { type: String, required: true, index: true },
  archetypeZh: String,
  role: { type: String, trim: true, maxlength: 50, index: true },
  buildType: { type: String, trim: true, maxlength: 50, index: true },
  buildFor: { type: String, trim: true, maxlength: 50, index: true },
  buildOrientation: { type: String, trim: true, maxlength: 50, index: true },
  tier: { type: String, enum: ['S', 'A', 'B', 'Community'], index: true },
  patch: String,
  difficulty: { type: String, required: true },
  summary: String,
  summaryEn: String,
  guide: [String],
  guideHtml: {
    type: String,
    set: (value: unknown) => typeof value === 'string' ? normalizeGuideHtml(value) : undefined,
    validate: (value: string | undefined) => !value || guideHtmlTextLength(value) <= MAX_GUIDE_TEXT_LENGTH
  },
  guideEn: [String],
  guideHtmlEn: {
    type: String,
    set: (value: unknown) => typeof value === 'string' ? normalizeGuideHtml(value) : undefined,
    validate: (value: string | undefined) => !value || guideHtmlTextLength(value) <= MAX_GUIDE_TEXT_LENGTH
  },
  tags: [String],
  tagsEn: [String],
  views: { type: Number, min: 0, default: 0 },
  likes: { type: Number, min: 0, default: 0 },
  viewedBy: { type: [String], default: [], select: false },
  likedBy: { type: [String], default: [], select: false },
  updatedAt: String,
  color: String,
  classIcon: String,
  snapshotVersion: { type: Number, enum: [1] },
  character: { type: characterSnapshotSchema, default: undefined },
  skills: { type: [buildSkillSchema], default: [] },
  skillTree: { type: [buildSkillTreeSchema], default: [] },
  equipment: { type: [buildEquipmentSchema], default: [] },
  artifacts: { type: [buildArtifactSchema], default: [] },
  grimoires: { type: [buildGrimoireSchema], default: [] },
  metrics: { type: [buildMetricSchema], default: [] },
  source: { type: String, enum: ['seed', 'user', 'external'], default: 'user', index: true },
  provenance: { type: buildProvenanceSchema, default: undefined },
  sourceMetrics: { type: buildSourceMetricsSchema, default: undefined },
  userGenerated: { type: Boolean, default: true, index: true },
  createdBy: { type: String, trim: true, maxlength: 50 },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: 'savedAt' }, versionKey: false })

buildSchema.index(
  { 'provenance.site': 1, 'provenance.sourceId': 1 },
  {
    unique: true,
    partialFilterExpression: {
      source: 'external',
      'provenance.site': { $type: 'string' },
      'provenance.sourceId': { $type: 'string' }
    },
    name: 'unique_external_build_source'
  }
)

buildSchema.pre('validate', function validateSourceInvariants() {
  const document = this as unknown as {
    source?: string
    userGenerated?: boolean
    active?: boolean
    provenance?: {
      contentHash?: string
      translation?: { status?: string, sourceHash?: string }
    }
    sourceMetrics?: unknown
    invalidate(path: string, message: string): void
  }

  if (document.source === 'external') {
    if (document.userGenerated !== false) {
      document.invalidate('userGenerated', 'External builds cannot be marked as user generated')
    }
    if (!document.provenance) {
      document.invalidate('provenance', 'External builds require provenance')
      return
    }

    const translation = document.provenance.translation
    const publishable = translation?.status === 'reviewed' || translation?.status === 'not-needed'
    if (document.active !== false && !publishable) {
      document.invalidate(
        'provenance.translation.status',
        'Active external builds require a reviewed or not-needed translation'
      )
    }
    if (publishable && translation?.sourceHash !== document.provenance.contentHash) {
      document.invalidate(
        'provenance.translation.sourceHash',
        'Published external build translations must match the current source content'
      )
    }
    return
  }

  if (document.source === 'user') {
    if (document.userGenerated !== true) {
      document.invalidate('userGenerated', 'User builds must be marked as user generated')
    }
    if (document.provenance) {
      document.invalidate('provenance', 'User builds cannot define external provenance')
    }
    if (document.sourceMetrics) {
      document.invalidate('sourceMetrics', 'User builds cannot define external source metrics')
    }
  } else if (document.provenance || document.sourceMetrics) {
    document.invalidate('source', 'Only external builds can define provenance or source metrics')
  }
})

export const BuildModel = mongoose.models.Build || mongoose.model('Build', buildSchema)
