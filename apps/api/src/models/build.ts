import mongoose, { Schema } from 'mongoose'

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
  skills: [{ id: String, slug: String, name: String, nameZh: String, nameEn: String, icon: String }],
  equipment: [{ id: String, slug: String, kind: { type: String, enum: ['equipment', 'artifact'], default: 'equipment' }, name: String, nameZh: String, nameEn: String, slot: String, slotEn: String, icon: String }],
  metrics: [{ label: String, labelEn: String, value: { type: Number, min: 0, max: 100 } }],
  source: { type: String, enum: ['seed', 'user'], default: 'user', index: true },
  userGenerated: { type: Boolean, default: true, index: true },
  createdBy: { type: String, trim: true, maxlength: 50 },
  active: { type: Boolean, default: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: 'savedAt' }, versionKey: false })

export const BuildModel = mongoose.models.Build || mongoose.model('Build', buildSchema)
