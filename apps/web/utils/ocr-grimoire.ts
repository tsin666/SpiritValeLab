const MAX_MATCH_LINES = 64
const MAX_MATCH_LINE_LENGTH = 240

const UI_OR_METADATA = /^(?:back|return|apply|reset|points?|level|lv\.?\s*\d*|stance|class|character|返回|应用|重置|点数|等级|职业|角色|姿态)(?:\s*[:：].*)?$/iu
const ONLY_SHORT_NOISE = /^[\p{Lu}\p{Ll}]{1,3}$/u

export interface GrimoireOcrParse {
  nameCandidates: string[]
}

function normalizeLine(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function stripBoundaryNoise(value: string): string {
  return normalizeLine(value)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim()
}

function joinOcrWrappedWords(lines: readonly string[]): string[] {
  const joined: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const current = stripBoundaryNoise(lines[index] || '')
    const next = stripBoundaryNoise(lines[index + 1] || '')

    // Sparse-text OCR can split a large initial capital from the rest of the
    // same word (the real screenshot produced `H` + `idden Strikes`). Only
    // rejoin that observable pattern; never substitute a catalog name here.
    if (/^[\p{Lu}]$/u.test(current) && /^\p{Ll}/u.test(next)) {
      joined.push(`${current}${next}`)
      index += 1
      continue
    }

    if (current) joined.push(current)
  }

  return joined
}

function isPlausibleName(value: string): boolean {
  if (!value || value.length > MAX_MATCH_LINE_LENGTH) return false
  if (UI_OR_METADATA.test(value) || ONLY_SHORT_NOISE.test(value)) return false
  if (!/\p{L}/u.test(value)) return false

  const letters = [...value.matchAll(/\p{L}/gu)].length
  return letters >= 4
}

function uniqueLines(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const line = stripBoundaryNoise(value)
    const key = line.toLocaleLowerCase('en-US')
    if (!isPlausibleName(line) || seen.has(key)) continue
    seen.add(key)
    result.push(line)
    if (result.length >= MAX_MATCH_LINES) break
  }

  return result
}

/**
 * Extracts reviewable grimoire-name lines from user-confirmed OCR text.
 * It intentionally performs no catalog lookup, class filtering, deduplication
 * against occupied slots, or automatic selection; those belong to the review
 * integration layer.
 */
export function parseGrimoireOcrText(text: string): GrimoireOcrParse {
  const lines = String(text || '')
    .replace(/\f/gu, '')
    .split(/\r?\n/u)
    .map(normalizeLine)
    .filter(Boolean)

  return {
    nameCandidates: uniqueLines(joinOcrWrappedWords(lines))
  }
}

export function grimoireOcrMatchLines(
  parsed: GrimoireOcrParse,
  ignoredLabels: readonly (string | null | undefined)[] = []
) {
  const ignored = new Set(ignoredLabels.map(value => stripBoundaryNoise(String(value || '')).toLocaleLowerCase('en-US')).filter(Boolean))
  return uniqueLines(parsed.nameCandidates)
    .filter(text => !ignored.has(text.toLocaleLowerCase('en-US')))
    .map((text, index) => ({
      id: `grimoire-${index + 1}`,
      text,
      kinds: ['grimoire'] as const
    }))
}
