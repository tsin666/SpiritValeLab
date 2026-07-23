import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grimoireOcrMatchLines, parseGrimoireOcrText } from '../utils/ocr-grimoire.ts'

const REAL_SPARSE_TEXT_OUTPUT = `@
Nas’
H

idden Strikes

2

bs

(SS

@.

“stow Dance

oo

2

"a

NY

Venom Bloom

=

A

=,`

test('extracts three reviewable lines from the real grimoire screenshot OCR noise', () => {
  const parsed = parseGrimoireOcrText(REAL_SPARSE_TEXT_OUTPUT)

  assert.deepEqual(parsed, {
    nameCandidates: ['Hidden Strikes', 'stow Dance', 'Venom Bloom']
  })
  assert.deepEqual(grimoireOcrMatchLines(parsed), [
    { id: 'grimoire-1', text: 'Hidden Strikes', kinds: ['grimoire'] },
    { id: 'grimoire-2', text: 'stow Dance', kinds: ['grimoire'] },
    { id: 'grimoire-3', text: 'Venom Bloom', kinds: ['grimoire'] }
  ])
})

test('keeps uncertain OCR text for review instead of inventing a catalog correction', () => {
  assert.deepEqual(parseGrimoireOcrText('“stow Dance'), {
    nameCandidates: ['stow Dance']
  })
})

test('accepts the real default OCR result without adding missing names', () => {
  assert.deepEqual(parseGrimoireOcrText('Venom Bloom\n\f'), {
    nameCandidates: ['Venom Bloom']
  })
})

test('filters common screen labels and isolated OCR glyph noise', () => {
  const parsed = parseGrimoireOcrText(`返回
Shinobi
Lv.64
姿态: 双持
应用
@
SS
Hidden Strikes`)

  assert.deepEqual(parsed, {
    nameCandidates: ['Shinobi', 'Hidden Strikes']
  })
  assert.deepEqual(grimoireOcrMatchLines(parsed, ['Rogue', 'Shinobi']), [
    { id: 'grimoire-1', text: 'Hidden Strikes', kinds: ['grimoire'] }
  ])
})

test('deduplicates case-insensitively and enforces matcher line and length limits', () => {
  const parsed = parseGrimoireOcrText([
    'Venom Bloom',
    'venom bloom',
    ...Array.from({ length: 70 }, (_, index) => `Verified Grimoire ${index}`),
    'x'.repeat(241)
  ].join('\n'))
  const lines = grimoireOcrMatchLines(parsed)

  assert.equal(lines.length, 64)
  assert.equal(lines[0]?.text, 'Venom Bloom')
  assert.ok(lines.every(line => line.text.length <= 240))
  assert.ok(lines.every(line => line.kinds.length === 1 && line.kinds[0] === 'grimoire'))
  assert.ok(lines.every(line => line.text !== 'x'.repeat(241)))
})

test('returns no candidates for empty or symbol-only OCR text', () => {
  assert.deepEqual(parseGrimoireOcrText(' \n @@@\n---\n\t'), {
    nameCandidates: []
  })
})
