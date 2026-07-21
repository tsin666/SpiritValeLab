import type { EquipmentOcrParse } from '~/types/ocr'

const MAX_MATCH_LINES = 64
const MAX_MATCH_LINE_LENGTH = 240

const SLOT_HEADING = /^(?:鞋子|鞋|头部|头饰|胸甲|腿部装备|腿部|背部|眼饰|饰品|主手|副手|shoes?|boots?|head|headgear|chest|armor|armour|legs?|back|eyewear|accessor(?:y|ies)|main\s*hand|off\s*hand)$/iu
const SET_HEADING = /(?:套装|\bset)\s*[:：]?$/iu
const STAT_OR_METADATA = /^(?:重量|weight|潜能|potential|精炼|强化|refine(?:ment)?|upgrade|def|mdef|flee|hp|mp|atk|matk|str|agi|vit|int|dex|luk|hit|crit|block|aspd|ctr|移动速度|攻击速度|施法速度|所有属性|物理防御|魔法防御|生命|法力|暴击|闪避)\s*[:：]/iu
const SEPARATOR = /^[\s\-_=~—–·•·]+$/u
const SENTENCE_PUNCTUATION = /[,，。！？；;]$/u

function normalizeLine(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function isPlausibleName(value: string): boolean {
  const line = normalizeLine(value)
  if (!line || line.length > MAX_MATCH_LINE_LENGTH) return false
  if (SLOT_HEADING.test(line) || SET_HEADING.test(line) || STAT_OR_METADATA.test(line)) return false
  if (SEPARATOR.test(line) || SENTENCE_PUNCTUATION.test(line)) return false
  if (/[%％]/u.test(line) || /^[[【]/u.test(line)) return false
  if (/\d\s*(?:~|～|-|–|—)\s*\d/u.test(line)) return false
  return /[\p{L}\p{N}]/u.test(line)
}

function uniqueLines(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const line = normalizeLine(value).slice(0, MAX_MATCH_LINE_LENGTH).trim()
    const key = line.toLocaleLowerCase('en-US')
    if (!line || seen.has(key)) continue
    seen.add(key)
    result.push(line)
    if (result.length >= MAX_MATCH_LINES) break
  }
  return result
}

/**
 * Extracts only user-reviewable values from confirmed OCR text. This helper
 * never receives or returns an image, filename, confidence score, or catalog
 * selection, so none of those values can accidentally enter a build payload.
 */
export function parseEquipmentOcrText(text: string): EquipmentOcrParse {
  const lines = String(text || '')
    .split(/\r?\n/u)
    .map(normalizeLine)
    .filter(Boolean)

  let refineLevel: number | undefined
  let potential: number | undefined
  const refinedNames: string[] = []

  for (const line of lines) {
    // OCR often leaves one or two tooltip-border glyphs before the game's
    // enhancement prefix (for example "{+6 Ashwalker Shoes"). Tolerate a
    // short run of punctuation, but never skip letters or digits.
    const refinedName = line.match(/^[^\p{L}\p{N}+＋]{0,4}[+＋]\s*(\d{1,3})\s+(.+)$/u)
    if (refinedName) {
      const numeric = Number(refinedName[1])
      if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 100) refineLevel ??= numeric
      if (isPlausibleName(refinedName[2] || '')) refinedNames.push(refinedName[2] || '')
      continue
    }

    const explicitRefine = line.match(/^(?:精炼|强化|refine(?:ment)?|upgrade)\s*[:：]?\s*[+＋]?\s*(\d{1,3})\b/iu)
    if (explicitRefine) {
      const numeric = Number(explicitRefine[1])
      if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 100) refineLevel ??= numeric
    }

    const potentialMatch = line.match(/^[\[【]?\s*(?:潜能|potential)\s*[\]】]?\s*[:：]?\s*(\d{1,3})\b/iu)
    if (potentialMatch) {
      const numeric = Number(potentialMatch[1])
      if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 100) potential ??= numeric
    }
  }

  // A leading +N followed by text is the game's strongest item-name signal.
  // If it exists, do not send surrounding slot labels, stats, lore, or set
  // headings to the catalog matcher.
  const nameCandidates = refinedNames.length
    ? uniqueLines(refinedNames)
    : uniqueLines(lines.filter(isPlausibleName))

  return { nameCandidates, refineLevel, potential }
}

export function equipmentOcrMatchLines(parsed: EquipmentOcrParse) {
  return uniqueLines(parsed.nameCandidates).map((text, index) => ({
    id: `equipment-${index + 1}`,
    text,
    kinds: ['equipment'] as const
  }))
}
