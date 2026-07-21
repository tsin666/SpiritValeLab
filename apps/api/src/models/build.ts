import mongoose, { Schema } from 'mongoose'
import { ArtifactSlot, StanceType, StatType } from '../runtime-data.js'
import { guideHtmlTextLength, MAX_GUIDE_TEXT_LENGTH, normalizeGuideHtml } from '../guide-html.js'

const childSchemaOptions = { _id: false, strict: true } as const

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
  treeArchetypeSource: { type: String, required: true, enum: ['user-confirmed'] }
}, childSchemaOptions)

const buildCardSchema = new Schema({
  slotIndex: { type: Number, required: true, min: 0, max: 3 },
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  equipClass: String
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
  refineLevel: { type: Number, min: 0, max: 100 },
  potential: { type: Number, min: 0, max: 100 },
  actualAffixes: { type: [buildStatValueSchema], default: [] },
  cards: { type: [buildCardSchema], default: [] }
}, childSchemaOptions)

const buildArtifactGemSchema = new Schema({
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  icon: String,
  affix: String
}, childSchemaOptions)

const buildArtifactSchema = new Schema({
  slot: { type: String, required: true, enum: [...ArtifactSlot] },
  partIndex: { type: Number, required: true, min: 0, max: 3 },
  id: { type: String, required: true },
  slug: String,
  name: String,
  nameZh: String,
  nameEn: String,
  partIcon: String,
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
  icon: String
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

const buildSchema = new Schema({
  slug: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true },
  titleEn: String,
  archetype: { type: String, required: true, index: true },
  archetypeZh: String,
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
  source: { type: String, enum: ['seed', 'user'], default: 'user', index: true },
  userGenerated: { type: Boolean, default: true, index: true },
  createdBy: { type: String, trim: true, maxlength: 50 },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: 'savedAt' }, versionKey: false })

export const BuildModel = mongoose.models.Build || mongoose.model('Build', buildSchema)
