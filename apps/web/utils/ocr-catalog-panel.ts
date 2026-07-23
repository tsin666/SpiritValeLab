import type {
  BuildCatalogOcrKind,
  BuildCatalogOcrParsedLine,
  BuildCatalogOcrParseResult
} from '~/types/ocr'

export interface BuildCatalogOcrRequestLine {
  request: {
    id: string
    text: string
    kinds: [BuildCatalogOcrKind]
  }
  source: BuildCatalogOcrParsedLine
}

export function buildCatalogOcrRequestLines(
  kind: BuildCatalogOcrKind,
  parsed: BuildCatalogOcrParseResult
): BuildCatalogOcrRequestLine[] {
  const seen = new Set<string>()
  const result: BuildCatalogOcrRequestLine[] = []
  for (const source of parsed.lines) {
    const text = String(source.text || '').normalize('NFKC').replace(/\s+/gu, ' ').trim().slice(0, 240).trim()
    const key = text.toLocaleLowerCase('en-US')
    if (!text || seen.has(key)) continue
    seen.add(key)
    const id = `${kind}-${result.length + 1}`
    result.push({
      request: { id, text, kinds: [kind] },
      source: { ...source, id, text }
    })
    if (result.length >= 64) break
  }
  return result
}
