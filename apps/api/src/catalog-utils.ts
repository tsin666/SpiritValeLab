export type LocalizedText = {
  zh: string
  en: string
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    const record = asRecord(value)
    for (const key of ['id', 'value', 'slug', 'name', 'en', 'zh']) {
      const nested = record[key]
      if (typeof nested === 'string' && nested.trim()) return nested.trim()
    }
  }
  return null
}

export function localized(value: unknown, fallback = ''): LocalizedText {
  if (typeof value === 'string') {
    const text = value.trim()
    return { zh: text || fallback, en: text || fallback }
  }
  const record = asRecord(value)
  const zh = readString(record.zh, record['zh-CN'], record.cn)
  const en = readString(record.en, record['en-US'])
  return {
    zh: zh || en || fallback,
    en: en || zh || fallback
  }
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function canonical(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim()
}

export function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function readStringList(...values: unknown[]): string[] {
  for (const value of values) {
    const source = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
    const result = source
      .map(entry => readString(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (result.length) return [...new Map(result.map(entry => [canonical(entry), entry])).values()]
  }
  return []
}

export function flattenSearchText(value: unknown, depth = 0): string {
  if (depth > 6 || value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(entry => flattenSearchText(entry, depth + 1)).join(' ')
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(entry => flattenSearchText(entry, depth + 1))
      .join(' ')
  }
  return ''
}

export function matchesQuery(searchText: string, query?: string): boolean {
  if (!query) return true
  const tokens = query.toLocaleLowerCase('en-US').split(/\s+/).filter(Boolean)
  return tokens.every(token => searchText.includes(token))
}
