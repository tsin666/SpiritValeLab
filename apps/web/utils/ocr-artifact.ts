export const ARTIFACT_OCR_SLOTS = ['Rune', 'Jewel', 'Scroll', 'Relic'] as const

export type ArtifactOcrSlot = typeof ARTIFACT_OCR_SLOTS[number]

export interface ArtifactOcrPartParse {
  slot: ArtifactOcrSlot
  /** Normalized part label as it was actually read, without the refine prefix. */
  partName: string
  /** Set-name fragment read directly from the screenshot. */
  recognizedSetName: string
  /** Text sent to the artifact-only catalog matcher for human review. */
  setNameCandidate: string
  querySource: 'recognized' | 'corroborated'
  refineLevel?: number
  suffixText?: string
}

export interface ArtifactOcrParse {
  parts: ArtifactOcrPartParse[]
}

const MAX_MATCH_LINES = 64
const MAX_MATCH_LINE_LENGTH = 240

const ENGLISH_SLOT = /\b(rune|jewel|scroll|relic)\b(?:\s*(?:[|Il]|[^\p{L}\p{N}]{0,2}))?$/iu
const CHINESE_SLOT = /(符文|宝石|卷轴|圣物|遗物)(?:\s*[^\p{L}\p{N}]{0,2})?$/u
const SUFFIX_PREFIX = /^(?:[^\p{L}\p{N}]{0,3})?(?:of|af|w@f)\s+(.+)$/iu
const LEADING_REFINE = /^[^\p{L}\p{N}+＋]{0,4}[+＋]\s*(\d{1,3})\s+(.+)$/u
const OCR_REFINE = /^[^\p{L}\p{N}]{0,3}(\d{1,3})\s*[)\]】]\s+(.+)$/u

const ENGLISH_SLOT_NAMES: Record<string, ArtifactOcrSlot> = {
  rune: 'Rune',
  jewel: 'Jewel',
  scroll: 'Scroll',
  relic: 'Relic'
}

const CHINESE_SLOT_NAMES: Record<string, ArtifactOcrSlot> = {
  '符文': 'Rune',
  '宝石': 'Jewel',
  '卷轴': 'Scroll',
  '圣物': 'Relic',
  '遗物': 'Relic'
}

function normalizeLine(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function normalizeComparable(value: string): string {
  return normalizeLine(value)
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function boundedText(value: string): string {
  return normalizeLine(value)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N})\]】]+$/u, '')
    .slice(0, MAX_MATCH_LINE_LENGTH)
    .trim()
}

function validCandidate(value: string): boolean {
  const comparable = normalizeComparable(value)
  return comparable.length >= 2 && /\p{L}/u.test(comparable)
}

function slotAtEnd(line: string): { slot: ArtifactOcrSlot, start: number } | null {
  const english = line.match(ENGLISH_SLOT)
  if (english?.index !== undefined) {
    const slot = ENGLISH_SLOT_NAMES[String(english[1] || '').toLocaleLowerCase('en-US')]
    if (slot) return { slot, start: english.index }
  }

  const chinese = line.match(CHINESE_SLOT)
  if (chinese?.index !== undefined) {
    const slot = CHINESE_SLOT_NAMES[String(chinese[1] || '')]
    if (slot) return { slot, start: chinese.index }
  }

  return null
}

function parseNameLine(line: string) {
  const inlineSuffix = line.match(/\s+(?:of|af|w@f)\s+(.+)$/iu)
  const nameLine = inlineSuffix?.index !== undefined
    ? normalizeLine(line.slice(0, inlineSuffix.index))
    : line
  const locatedSlot = slotAtEnd(nameLine)
  if (!locatedSlot) return null

  let prefix = normalizeLine(nameLine.slice(0, locatedSlot.start))
  let refineLevel: number | undefined
  const explicitRefine = prefix.match(LEADING_REFINE)
  const confusedRefine = explicitRefine ? null : prefix.match(OCR_REFINE)
  const refineMatch = explicitRefine || confusedRefine

  if (refineMatch) {
    const numeric = Number(refineMatch[1])
    if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 100) refineLevel = numeric
    prefix = normalizeLine(refineMatch[2] || '')
  }

  const recognizedSetName = boundedText(prefix)
  if (!validCandidate(recognizedSetName)) return null
  const suffixText = inlineSuffix ? boundedText(inlineSuffix[1] || '') : ''

  return {
    slot: locatedSlot.slot,
    partName: `${recognizedSetName} ${locatedSlot.slot}`,
    recognizedSetName,
    setNameCandidate: recognizedSetName,
    querySource: 'recognized' as const,
    refineLevel,
    ...(validCandidate(suffixText) ? { suffixText } : {})
  }
}

function parseSuffixLine(line: string): string | null {
  const suffix = line.match(SUFFIX_PREFIX)
  if (!suffix) return null
  const text = boundedText(suffix[1] || '')
  return validCandidate(text) ? text : null
}

function editDistance(left: string, right: string): number {
  if (!left) return right.length
  if (!right) return left.length

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      )
    }
    previous = current
  }
  return previous[right.length] ?? Math.max(left.length, right.length)
}

function relatedToRepeatedCandidate(fragment: string, candidate: string): boolean {
  if (fragment === candidate) return true
  if (fragment.length >= 2 && fragment.length <= 3 && candidate.endsWith(fragment)) return true
  if (Math.abs(fragment.length - candidate.length) > 2) return false
  return editDistance(fragment, candidate) <= Math.max(1, Math.floor(candidate.length * 0.25))
}

/**
 * Uses repetition within the reviewed screenshot only to repair obvious OCR
 * fragments. It never looks up or selects a catalog record. The API still
 * returns suggestions which the user must explicitly confirm.
 */
function corroborateQueries(parts: ArtifactOcrPartParse[]): ArtifactOcrPartParse[] {
  const groups = new Map<string, { text: string, count: number }>()
  for (const part of parts) {
    const key = normalizeComparable(part.recognizedSetName)
    if (key.length < 4) continue
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else groups.set(key, { text: part.recognizedSetName, count: 1 })
  }

  const repeated = [...groups.entries()]
    .filter(([, value]) => value.count >= 2)
    .map(([key, value]) => ({ key, text: value.text }))

  if (!repeated.length) return parts

  return parts.map((part) => {
    const fragment = normalizeComparable(part.recognizedSetName)
    if (repeated.some(candidate => candidate.key === fragment)) return part

    const related = repeated.filter(candidate => relatedToRepeatedCandidate(fragment, candidate.key))
    if (related.length !== 1) return part

    return {
      ...part,
      setNameCandidate: related[0]!.text,
      querySource: 'corroborated'
    }
  })
}

function partQuality(part: ArtifactOcrPartParse): number {
  return (part.refineLevel === undefined ? 0 : 100) + Math.min(80, normalizeComparable(part.recognizedSetName).length)
}

/**
 * Parses reviewed text from the four-part artifact screen. Coordinates,
 * images, filenames, OCR confidence, and catalog selections are deliberately
 * absent from both the input contract and result.
 */
export function parseArtifactOcrText(text: string): ArtifactOcrParse {
  const parts: ArtifactOcrPartParse[] = []
  const partIndexBySlot = new Map<ArtifactOcrSlot, number>()
  const awaitingSuffix: number[] = []

  for (const line of String(text || '').split(/\r?\n/u).map(normalizeLine).filter(Boolean)) {
    const parsedPart = parseNameLine(line)
    if (parsedPart) {
      const existingIndex = partIndexBySlot.get(parsedPart.slot)
      if (existingIndex === undefined) {
        partIndexBySlot.set(parsedPart.slot, parts.length)
        parts.push(parsedPart)
        awaitingSuffix.push(parts.length - 1)
      } else {
        const existing = parts[existingIndex]!
        if (partQuality(parsedPart) > partQuality(existing)) {
          parts[existingIndex] = existing.suffixText
            ? { ...parsedPart, suffixText: existing.suffixText }
            : parsedPart
        } else if (existing.refineLevel === undefined && parsedPart.refineLevel !== undefined) {
          existing.refineLevel = parsedPart.refineLevel
        }
        if (!parts[existingIndex]!.suffixText && !awaitingSuffix.includes(existingIndex)) awaitingSuffix.push(existingIndex)
      }
      continue
    }

    const suffixText = parseSuffixLine(line)
    if (!suffixText) continue
    while (awaitingSuffix.length) {
      const partIndex = awaitingSuffix.pop()!
      const part = parts[partIndex]
      if (!part || part.suffixText) continue
      part.suffixText = suffixText
      break
    }
  }

  return { parts: corroborateQueries(parts) }
}

/**
 * Produces text-only, artifact-scoped catalog queries. These are suggestions,
 * not accepted selections; the caller must keep the API review boundary.
 */
export function artifactOcrMatchLines(parsed: ArtifactOcrParse) {
  const seenSlots = new Set<ArtifactOcrSlot>()
  const lines: Array<{ id: string, text: string, kinds: readonly ['artifact'] }> = []

  for (const part of parsed.parts) {
    if (!ARTIFACT_OCR_SLOTS.includes(part.slot) || seenSlots.has(part.slot)) continue
    const text = boundedText(part.setNameCandidate)
    if (!validCandidate(text)) continue
    seenSlots.add(part.slot)
    lines.push({
      id: `artifact-${part.slot.toLocaleLowerCase('en-US')}`,
      text,
      kinds: ['artifact'] as const
    })
    if (lines.length >= MAX_MATCH_LINES) break
  }

  return lines
}
