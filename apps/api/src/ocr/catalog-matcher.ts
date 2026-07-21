import Fuse from 'fuse.js'

export const ocrCatalogKinds = [
  'archetype',
  'skill',
  'skillPassive',
  'equipment',
  'grimoire',
  'artifact',
  'gem',
  'card'
] as const

export type OcrCatalogKind = typeof ocrCatalogKinds[number]
export type OcrCatalogSources = Partial<Record<OcrCatalogKind, readonly unknown[]>>
export type OcrMatchStatus = 'suggested' | 'ambiguous' | 'unmatched'
export type OcrMatchType = 'exact' | 'fuzzy'

export type OcrCatalogCandidate = {
  key: string
  kind: OcrCatalogKind
  id: string
  slug: string
  displayName: string
  matchedAlias: string
  matchType: OcrMatchType
  score: number
}

export type OcrTextMatch = {
  query: string
  normalizedQuery: string
  status: OcrMatchStatus
  candidates: OcrCatalogCandidate[]
}

export type OcrCatalogLine = {
  id: string
  text: string
}

export type OcrCatalogLineMatch = OcrTextMatch & {
  lineId: string
}

export type OcrMatchOptions = {
  kinds?: readonly OcrCatalogKind[]
  maxCandidates?: number
}

export type OcrCatalogMatcherOptions = {
  maxCandidates?: number
  fuzzyThreshold?: number
  suggestionScore?: number
  ambiguityMargin?: number
}

export type OcrCatalogMatcher = {
  size: number
  counts: Readonly<Record<OcrCatalogKind, number>>
  match: (text: string, options?: OcrMatchOptions) => OcrTextMatch
  matchLines: (lines: readonly OcrCatalogLine[], options?: OcrMatchOptions) => OcrCatalogLineMatch[]
}

type Alias = {
  normalized: string
  value: string
}

type IndexedCatalogEntry = {
  key: string
  kind: OcrCatalogKind
  id: string
  slug: string
  displayName: string
  aliases: Alias[]
  searchAliases: string[]
}

const DEFAULT_MAX_CANDIDATES = 5
const MAX_CANDIDATES = 10
const DEFAULT_FUZZY_THRESHOLD = 0.4
const DEFAULT_SUGGESTION_SCORE = 0.88
const DEFAULT_AMBIGUITY_MARGIN = 0.12
const kindOrder = new Map<OcrCatalogKind, number>(ocrCatalogKinds.map((kind, index) => [kind, index]))

/**
 * Normalizes OCR and catalog text without removing word boundaries. Only the
 * catalog fields id, slug, displayName and name are passed through this function.
 */
export function normalizeOcrText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function directStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) {
    return value.flatMap(entry => typeof entry === 'string' && entry.trim() ? [entry.trim()] : [])
  }
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .flatMap(entry => typeof entry === 'string' && entry.trim() ? [entry.trim()] : [])
  }
  return []
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareEntries(left: IndexedCatalogEntry, right: IndexedCatalogEntry): number {
  return (kindOrder.get(left.kind) ?? Number.MAX_SAFE_INTEGER) - (kindOrder.get(right.kind) ?? Number.MAX_SAFE_INTEGER)
    || compareText(normalizeOcrText(left.id), normalizeOcrText(right.id))
    || compareText(left.id, right.id)
    || compareText(left.displayName, right.displayName)
    || compareText(left.slug, right.slug)
    || compareText(left.searchAliases.join('\u0000'), right.searchAliases.join('\u0000'))
}

function aliasValues(raw: Record<string, unknown>): string[] {
  // Deliberately do not inspect descriptions, stats or any other catalog fields.
  return [
    ...directStrings(raw.id),
    ...directStrings(raw.slug),
    ...directStrings(raw.displayName),
    ...directStrings(raw.name)
  ]
}

function preferredValue(value: unknown): string | null {
  return directStrings(value)[0] || null
}

function toIndexedEntry(kind: OcrCatalogKind, value: unknown): IndexedCatalogEntry | null {
  const raw = asRecord(value)
  const nameValues = directStrings(raw.name)
  const id = preferredValue(raw.id)
    || preferredValue(raw.slug)
    || preferredValue(raw.displayName)
    || nameValues[0]
  if (!id) return null

  const slug = preferredValue(raw.slug) || id
  const displayName = preferredValue(raw.displayName) || nameValues[0] || id
  const aliasMap = new Map<string, string>()
  for (const alias of aliasValues(raw)) {
    const normalized = normalizeOcrText(alias)
    if (!normalized) continue
    const existing = aliasMap.get(normalized)
    if (!existing || compareText(alias, existing) < 0) aliasMap.set(normalized, alias)
  }
  if (!aliasMap.size) return null

  const aliases = [...aliasMap.entries()]
    .map(([normalized, alias]) => ({ normalized, value: alias }))
    .sort((left, right) => compareText(left.normalized, right.normalized) || compareText(left.value, right.value))

  return {
    key: `${kind}:${id}`,
    kind,
    id,
    slug,
    displayName,
    aliases,
    searchAliases: aliases.map(alias => alias.normalized)
  }
}

function mergeDuplicateEntries(entries: IndexedCatalogEntry[]): IndexedCatalogEntry[] {
  const merged = new Map<string, IndexedCatalogEntry>()
  for (const entry of entries.sort(compareEntries)) {
    const identity = `${entry.kind}:${normalizeOcrText(entry.id)}`
    const existing = merged.get(identity)
    if (!existing) {
      merged.set(identity, entry)
      continue
    }

    const aliases = new Map(existing.aliases.map(alias => [alias.normalized, alias.value]))
    for (const alias of entry.aliases) {
      const current = aliases.get(alias.normalized)
      if (!current || compareText(alias.value, current) < 0) aliases.set(alias.normalized, alias.value)
    }
    existing.aliases = [...aliases.entries()]
      .map(([normalized, alias]) => ({ normalized, value: alias }))
      .sort((left, right) => compareText(left.normalized, right.normalized) || compareText(left.value, right.value))
    existing.searchAliases = existing.aliases.map(alias => alias.normalized)
  }
  return [...merged.values()].sort(compareEntries)
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, value))
}

function candidateLimit(value: number | undefined, fallback: number): number {
  return Math.floor(boundedNumber(value, fallback, 1, MAX_CANDIDATES))
}

function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function aliasFor(entry: IndexedCatalogEntry, normalizedAlias?: string): string {
  if (normalizedAlias) {
    const match = entry.aliases.find(alias => alias.normalized === normalizedAlias)
    if (match) return match.value
  }
  return entry.aliases[0]?.value || entry.displayName
}

function codePointLevenshteinSimilarity(left: string, right: string): number {
  const leftPoints = [...left]
  const rightPoints = [...right]
  const maximumLength = Math.max(leftPoints.length, rightPoints.length)
  if (maximumLength === 0) return 1
  if (leftPoints.length === 0 || rightPoints.length === 0) return 0

  let previous = Array.from({ length: rightPoints.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= leftPoints.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= rightPoints.length; rightIndex += 1) {
      const substitutionCost = leftPoints[leftIndex - 1] === rightPoints[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      )
    }
    previous = current
  }

  return Math.max(0, 1 - previous[rightPoints.length] / maximumLength)
}

function bestAliasForQuery(entry: IndexedCatalogEntry, normalizedQuery: string): Alias & { score: number } {
  return entry.aliases
    .map(alias => ({ ...alias, score: codePointLevenshteinSimilarity(normalizedQuery, alias.normalized) }))
    .sort((left, right) => right.score - left.score
      || compareText(left.normalized, right.normalized)
      || compareText(left.value, right.value))[0]
}

function toCandidate(
  entry: IndexedCatalogEntry,
  matchType: OcrMatchType,
  score: number,
  normalizedAlias?: string
): OcrCatalogCandidate {
  return {
    key: entry.key,
    kind: entry.kind,
    id: entry.id,
    slug: entry.slug,
    displayName: entry.displayName,
    matchedAlias: aliasFor(entry, normalizedAlias),
    matchType,
    score: roundScore(score)
  }
}

function compareCandidates(left: OcrCatalogCandidate, right: OcrCatalogCandidate): number {
  return (left.matchType === right.matchType ? 0 : left.matchType === 'exact' ? -1 : 1)
    || right.score - left.score
    || (kindOrder.get(left.kind) ?? Number.MAX_SAFE_INTEGER) - (kindOrder.get(right.kind) ?? Number.MAX_SAFE_INTEGER)
    || compareText(normalizeOcrText(left.id), normalizeOcrText(right.id))
    || compareText(left.id, right.id)
    || compareText(left.key, right.key)
}

export function createOcrCatalogMatcher(
  sources: OcrCatalogSources,
  options: OcrCatalogMatcherOptions = {}
): OcrCatalogMatcher {
  const entries = mergeDuplicateEntries(ocrCatalogKinds.flatMap(kind =>
    (sources[kind] || []).flatMap(value => {
      const entry = toIndexedEntry(kind, value)
      return entry ? [entry] : []
    })
  ))
  const exactIndex = new Map<string, IndexedCatalogEntry[]>()
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      exactIndex.set(alias.normalized, [...(exactIndex.get(alias.normalized) || []), entry])
    }
  }

  const maxCandidates = candidateLimit(options.maxCandidates, DEFAULT_MAX_CANDIDATES)
  const fuzzyThreshold = boundedNumber(options.fuzzyThreshold, DEFAULT_FUZZY_THRESHOLD, 0, 1)
  const suggestionScore = boundedNumber(options.suggestionScore, DEFAULT_SUGGESTION_SCORE, 0, 1)
  const ambiguityMargin = boundedNumber(options.ambiguityMargin, DEFAULT_AMBIGUITY_MARGIN, 0, 1)
  const fuse = new Fuse(entries, {
    keys: ['searchAliases'],
    ignoreLocation: true,
    shouldSort: false,
    threshold: fuzzyThreshold
  })
  const counts = Object.freeze(Object.fromEntries(ocrCatalogKinds.map(kind => [
    kind,
    entries.filter(entry => entry.kind === kind).length
  ])) as Record<OcrCatalogKind, number>)

  function match(text: string, matchOptions: OcrMatchOptions = {}): OcrTextMatch {
    const query = typeof text === 'string' ? text : String(text ?? '')
    const normalizedQuery = normalizeOcrText(query)
    const allowedKinds = matchOptions.kinds === undefined ? null : new Set(matchOptions.kinds)
    const limit = candidateLimit(matchOptions.maxCandidates, maxCandidates)
    if (!normalizedQuery || allowedKinds?.size === 0) {
      return { query, normalizedQuery, status: 'unmatched', candidates: [] }
    }

    const exactEntries = (exactIndex.get(normalizedQuery) || [])
      .filter(entry => !allowedKinds || allowedKinds.has(entry.kind))
    if (exactEntries.length) {
      const candidates = exactEntries
        .map(entry => toCandidate(entry, 'exact', 1, normalizedQuery))
        .sort(compareCandidates)
      return {
        query,
        normalizedQuery,
        status: candidates.length === 1 ? 'suggested' : 'ambiguous',
        candidates: candidates.slice(0, limit)
      }
    }

    const candidates = fuse.search(normalizedQuery)
      .filter(result => !allowedKinds || allowedKinds.has(result.item.kind))
      .map(result => {
        // Fuse only recalls plausible entries. Its score and match choice are
        // intentionally ignored; final ranking uses every whitelisted alias.
        const alias = bestAliasForQuery(result.item, normalizedQuery)
        return toCandidate(result.item, 'fuzzy', alias.score, alias.normalized)
      })
      .sort(compareCandidates)

    if (!candidates.length) return { query, normalizedQuery, status: 'unmatched', candidates: [] }

    const top = candidates[0]
    const runnerUp = candidates[1]
    const ambiguous = top.score < suggestionScore
      || Boolean(runnerUp && top.score - runnerUp.score <= ambiguityMargin)
    return {
      query,
      normalizedQuery,
      status: ambiguous ? 'ambiguous' : 'suggested',
      candidates: candidates.slice(0, limit)
    }
  }

  return {
    size: entries.length,
    counts,
    match,
    matchLines: (lines, matchOptions) => lines.map(line => ({
      lineId: line.id,
      ...match(line.text, matchOptions)
    }))
  }
}
