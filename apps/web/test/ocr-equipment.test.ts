import assert from 'node:assert/strict'
import { test } from 'node:test'
import { equipmentOcrMatchLines, parseEquipmentOcrText } from '../utils/ocr-equipment.ts'

test('extracts the real Ashwalker item and ignores slot, metadata, stats, and set headings', () => {
  const parsed = parseEquipmentOcrText(`鞋子
+6 Ashwalker Shoes
重量:20
[潜能]:11
Def:5+6
Mdef:2+6
Flee:5
移动速度:10%
攻击速度:+10%
Str:+3 [2~3]
Ashwalker 套装`)

  assert.deepEqual(parsed, {
    nameCandidates: ['Ashwalker Shoes'],
    refineLevel: 6,
    potential: 11
  })
  assert.deepEqual(equipmentOcrMatchLines(parsed), [{
    id: 'equipment-1',
    text: 'Ashwalker Shoes',
    kinds: ['equipment']
  }])
})

test('tolerates tooltip-border noise from the real Ashwalker screenshot OCR output', () => {
  const parsed = parseEquipmentOcrText(`鞋子 i
{+6 Ashwalker Shoes
重量 : 20
[潜能 ]: 11
Def: 5+6
Mdef: 2 +6
移动 速度 : 10%
Ashwalker 套装 :`)

  assert.deepEqual(parsed, {
    nameCandidates: ['Ashwalker Shoes'],
    refineLevel: 6,
    potential: 11
  })
})

test('accepts an ordinary English equipment name without inventing values', () => {
  assert.deepEqual(parseEquipmentOcrText('Arcane Boots'), {
    nameCandidates: ['Arcane Boots'],
    refineLevel: undefined,
    potential: undefined
  })
})

test('returns no candidates or values for empty text', () => {
  assert.deepEqual(parseEquipmentOcrText('  \n\t '), {
    nameCandidates: [],
    refineLevel: undefined,
    potential: undefined
  })
})

test('never treats numeric stat ranges as item names and enforces matcher line limits', () => {
  const parsed = parseEquipmentOcrText([
    'Str:+3 [2～3]',
    ...Array.from({ length: 70 }, (_, index) => `Verified Item ${index}`),
    `Ignored ${'x'.repeat(250)}`
  ].join('\n'))
  const lines = equipmentOcrMatchLines(parsed)

  assert.equal(lines.length, 64)
  assert.ok(lines.every(line => line.text.length <= 240 && line.kinds[0] === 'equipment'))
  assert.ok(lines.every(line => !line.text.includes('Str:')))
})
