import type { LocalizedText } from '~/composables/useApi'

export const catalogKinds = [
  'archetypes',
  'skills',
  'skillPassives',
  'equips',
  'equipment-sets',
  'substat-pools',
  'artifacts',
  'gems',
  'cards',
  'monster-archetypes',
  'monsters',
  'statuses',
  'weapons',
  'archetype-skill-relations'
] as const
export type CatalogKind = typeof catalogKinds[number]

export type CatalogEntry = {
  id: string
  slug: string
  name?: string | LocalizedText | null
  displayName?: string | null
  description?: string | LocalizedText | null
  icon?: string | null
  [key: string]: unknown
}

export type CatalogListResponse = {
  items: CatalogEntry[]
  total: number
  limit: number
  offset: number
  source?: string
}

export type CatalogField = {
  key: string
  label: string
  value: unknown
}

export type CatalogSection = {
  key: CatalogSectionKey
  title: string
  fields: CatalogField[]
}

export type CatalogSectionKey = 'stats' | 'effects' | 'requirements' | 'triggers' | 'growth' | 'relations' | 'details'

const coveredKeys = new Set(['id', 'slug', 'name', 'displayName', 'icon', 'iconPath', 'image', 'imagePath', 'sprite', 'thumbnail'])
const hiddenKeys = new Set([
  'source', 'sourcePath', 'sourcePathId', 'sourceFile', 'sourceFileId', 'filePath', 'assetPath',
  'evidence', 'evidenceFields', 'provenance', 'fieldSources', 'derivedFields', 'inferred',
  'raw', 'rawRecord', 'rawData', 'schemaVersion', 'catalogKind', 'dataSource', 'runtime',
  'runtimeDescription', 'runtimeAffix', 'iconSource', 'assetReferences', 'prefabReference', 'spriteId'
])

export function isCatalogKind(value: string): value is CatalogKind {
  return (catalogKinds as readonly string[]).includes(value)
}

export function isHiddenCatalogField(key: string) {
  if (!key || key.startsWith('_') || hiddenKeys.has(key)) return true
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return /^(source|evidence|provenance)(path|file|id|key|fields?)?$/.test(normalized)
    || /^(raw|debug|internal)(data|record|value|fields?)?$/.test(normalized)
}

export function sanitizeCatalogValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeCatalogValue).filter(isPresent)
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => {
        if (isHiddenCatalogField(key)) return false
        const base = key.replace(/Values?$/, '')
        return base === key || (!(base in record) && !(`${base}s` in record))
      })
      .map(([key, item]) => [key, sanitizeCatalogValue(item)])
      .filter(([, item]) => isPresent(item))
  )
}

export function sanitizeCatalogEntry(value: CatalogEntry): CatalogEntry {
  return sanitizeCatalogValue(value) as CatalogEntry
}

export function normalizeCatalogToken(value: string) {
  return decodeURIComponent(value).trim().toLocaleLowerCase('en-US').replace(/[\s_]+/g, '-')
}

export function findCatalogEntry(items: CatalogEntry[], slug: string) {
  const wanted = normalizeCatalogToken(slug)
  return items.find(item => normalizeCatalogToken(item.slug || '') === wanted)
    || items.find(item => normalizeCatalogToken(item.id || '') === wanted)
    || null
}

function isPresent(value: unknown) {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'boolean' || typeof value === 'number') return true
  if (typeof value === 'string') return value.trim() !== '' && value !== 'None'
  if (Array.isArray(value)) return value.some(isPresent)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .some(([key, item]) => !isHiddenCatalogField(key) && isPresent(item))
  }
  return true
}

function sectionForKey(key: string): CatalogSectionKey {
  const token = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  if (/(effect|affix|modifier|bonus|passive|buff|debuff)/.test(token)) return 'effects'
  if (/(trigger|condition|chance|event|target|proc)/.test(token)) return 'triggers'
  if (/(require|prerequisite|unlock|allowed|restriction|levelrequired|classrequired)/.test(token)) return 'requirements'
  if (/(growth|scal|upgrade|perlevel|progress|rank|tier|levelvalues|curve)/.test(token)) return 'growth'
  if (/(related|skillid|skillids|artifactid|artifactids|gemid|gemids|statusid|statusids|archetypeid|archetypeids|setid|setids)/.test(token)) return 'relations'
  if (/(^stats?$|attribute|damage|defen[cs]e|health|mana|power|speed|cooldown|duration|range|radius|cost|value|amount|rate)/.test(token)) return 'stats'
  return 'details'
}

function humanizeField(key: string) {
  const value = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : key
}

export function useCatalogPresentation() {
  const { t, te, locale } = useI18n()
  const { gameLocale, gameText } = useGameLocale()

  function entryName(entry?: Partial<CatalogEntry> | null) {
    return gameText(entry?.name, entry?.displayName || entry?.id || t('catalog.unnamed'))
  }

  function alternateName(entry?: Partial<CatalogEntry> | null) {
    if (!entry?.name || typeof entry.name === 'string') return ''
    const value = gameLocale.value === 'en' ? entry.name.zh : entry.name.en
    return value && value !== entryName(entry) ? value : ''
  }

  function descriptions(entry?: Partial<CatalogEntry> | null) {
    if (!entry) return []
    return Object.entries(entry)
      .filter(([key, value]) => (key === 'description' || /^description_?\d+$/i.test(key)) && isPresent(value))
      .sort(([left], [right]) => {
        if (left === 'description') return -1
        if (right === 'description') return 1
        return left.localeCompare(right, 'en', { numeric: true })
      })
      .map(([, value]) => gameText(value as string | LocalizedText))
      .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
  }

  function description(entry?: Partial<CatalogEntry> | null) {
    return descriptions(entry)[0] || t('catalog.entryFallback')
  }

  function icon(entry?: Partial<CatalogEntry> | null) {
    if (!entry) return ''
    const firstPart = Array.isArray(entry.parts) ? entry.parts[0] as Record<string, unknown> | undefined : undefined
    const candidates = [entry.icon, firstPart?.icon, entry.iconPath, entry.image, entry.imagePath, entry.sprite, entry.thumbnail]
    for (const candidate of candidates) {
      const raw = typeof candidate === 'string'
        ? candidate.trim()
        : (candidate && typeof candidate === 'object' && typeof (candidate as Record<string, unknown>).path === 'string'
            ? String((candidate as Record<string, unknown>).path).trim()
            : '')
      if (!raw) continue
      if (raw.startsWith('/') && !raw.startsWith('//')) return raw
      if (/^(game-assets|images)\//.test(raw)) return `/${raw}`
    }
    return ''
  }

  function fieldLabel(key: string) {
    const normalized = key.replace(/[^a-z0-9]/gi, '')
    const translationKey = `catalog.fieldLabels.${normalized}`
    return te(translationKey) ? t(translationKey) : humanizeField(key)
  }

  function localizedValue(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
    const record = value as Record<string, unknown>
    if (typeof record.zh !== 'string' && typeof record.en !== 'string') return ''
    return gameText(record as LocalizedText)
  }

  function primitiveValue(value: unknown) {
    if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no')
    if (typeof value === 'number') return value.toLocaleString(locale.value)
    if (typeof value === 'string') return value
    return ''
  }

  function compactValue(value: unknown, depth = 0): string {
    const localized = localizedValue(value)
    if (localized) return localized
    const primitive = primitiveValue(value)
    if (primitive) return primitive.length > 80 ? `${primitive.slice(0, 77)}…` : primitive
    if (Array.isArray(value)) {
      const values = value.map(item => compactValue(item, depth + 1)).filter(Boolean)
      if (!values.length) return ''
      const joined = values.slice(0, 3).join(' · ')
      return values.length > 3 ? `${joined} · +${values.length - 3}` : joined
    }
    if (value && typeof value === 'object' && depth < 3) {
      const record = value as Record<string, unknown>
      if ('base' in record || 'perLevel' in record) {
        return [
          record.base !== undefined ? `${fieldLabel('base')}: ${compactValue(record.base, depth + 1)}` : '',
          record.perLevel !== undefined ? `${fieldLabel('perLevel')}: ${compactValue(record.perLevel, depth + 1)}` : '',
          typeof record.string === 'string' && record.string !== 'None' ? record.string : '',
          typeof record.string2 === 'string' && record.string2 !== 'None' ? record.string2 : ''
        ].filter(Boolean).join(' · ')
      }
      if (('type' in record || 'name' in record) && 'value' in record) {
        const name = compactValue(record.type ?? record.name, depth + 1)
        const statValue = compactValue(record.value, depth + 1)
        if (name && statValue) return `${name}: ${statValue}`
      }
      const entries = Object.entries(record)
        .filter(([key, item]) => !isHiddenCatalogField(key) && isPresent(item))
        .slice(0, 3)
        .map(([key, item]) => `${fieldLabel(key)}: ${compactValue(item, depth + 1)}`)
        .filter(Boolean)
      return entries.join(' · ')
    }
    return ''
  }

  function sections(entry?: Partial<CatalogEntry> | null): CatalogSection[] {
    if (!entry) return []
    const grouped = new Map<CatalogSectionKey, CatalogField[]>()
    for (const [key, value] of Object.entries(entry)) {
      if (coveredKeys.has(key) || key === 'description' || /^description_?\d+$/i.test(key) || isHiddenCatalogField(key) || !isPresent(value)) continue
      const section = sectionForKey(key)
      const fields = grouped.get(section) || []
      fields.push({ key, label: fieldLabel(key), value })
      grouped.set(section, fields)
    }
    const order: CatalogSectionKey[] = ['stats', 'effects', 'requirements', 'triggers', 'growth', 'relations', 'details']
    return order
      .filter(key => grouped.has(key))
      .map(key => ({ key, title: t(`catalog.sections.${key}`), fields: grouped.get(key)! }))
  }

  function highlights(entry?: Partial<CatalogEntry> | null) {
    return sections(entry)
      .flatMap(section => section.fields.map(field => ({ ...field, displayValue: compactValue(field.value) })))
      .filter(field => field.displayValue)
      .slice(0, 3)
  }

  return { entryName, alternateName, descriptions, description, icon, fieldLabel, localizedValue, primitiveValue, compactValue, sections, highlights }
}
