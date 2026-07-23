import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildCatalogOcrRequestLines } from '../utils/ocr-catalog-panel.ts'

test('creates bounded JSON text lines with one explicit catalog kind', () => {
  for (const kind of ['equipment', 'artifact', 'grimoire'] as const) {
    const lines = buildCatalogOcrRequestLines(kind, {
      lines: Array.from({ length: 70 }, (_, index) => ({
        id: `unsafe/id-${index}`,
        text: index === 0 ? `  Candidate   ${'x'.repeat(250)}  ` : `Candidate ${index}`,
        refineLevel: index === 0 ? 6 : undefined
      }))
    })

    assert.equal(lines.length, 64)
    assert.ok(lines.every(line => line.request.text.length <= 240))
    assert.ok(lines.every(line => line.request.kinds.length === 1 && line.request.kinds[0] === kind))
    assert.match(lines[0]!.request.id, new RegExp(`^${kind}-\\d+$`))
    assert.equal(lines[0]!.source.refineLevel, 6)
  }
})

test('deduplicates normalized lines without losing source metadata', () => {
  const lines = buildCatalogOcrRequestLines('artifact', {
    lines: [
      { id: 'rune', text: 'Vampiric', partIndex: 0 },
      { id: 'jewel', text: '  vampiric  ', partIndex: 1 }
    ]
  })

  assert.equal(lines.length, 1)
  assert.equal(lines[0]?.source.partIndex, 0)
  assert.deepEqual(lines[0]?.request.kinds, ['artifact'])
})
