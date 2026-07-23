import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  artifactOcrMatchLines,
  parseArtifactOcrText,
  type ArtifactOcrPartParse
} from '../utils/ocr-artifact.ts'

test('parses all four real Vampiric artifact parts, refine levels, and suffixes', () => {
  const parsed = parseArtifactOcrText(`+6 Vampiric Rune
of Venom Strike
+6 Vampiric Jewel
of Venom Strike
+6 Vampiric Scroll
of Venom Strike
+6 Vampiric Relic
of Venom Strike
Shinobi
Lv.64
姿态: 双持`)

  assert.deepEqual(parsed.parts, [
    artifactPart('Rune'),
    artifactPart('Jewel'),
    artifactPart('Scroll'),
    artifactPart('Relic')
  ])
})

test('handles the real full-screen OCR noise without claiming unread refine or suffix values', () => {
  const parsed = parseArtifactOcrText(`2
/
+6 Vampiric Rune
ic Jewel
of Venom Strike
2
#4
m
Strike
”了
We@
4
4
+6 Vampiric Scroll
Gampiric Relic
of Venom Strik
w@f venom Strike
9}
A
名
NA
-— a |
=,
Shinobi
Lv.64
办
姿态: 双持`)

  assert.deepEqual(parsed.parts, [
    {
      slot: 'Rune',
      partName: 'Vampiric Rune',
      recognizedSetName: 'Vampiric',
      setNameCandidate: 'Vampiric',
      querySource: 'recognized',
      refineLevel: 6
    },
    {
      slot: 'Jewel',
      partName: 'ic Jewel',
      recognizedSetName: 'ic',
      setNameCandidate: 'Vampiric',
      querySource: 'corroborated',
      refineLevel: undefined,
      suffixText: 'Venom Strike'
    },
    {
      slot: 'Scroll',
      partName: 'Vampiric Scroll',
      recognizedSetName: 'Vampiric',
      setNameCandidate: 'Vampiric',
      querySource: 'recognized',
      refineLevel: 6,
      suffixText: 'venom Strike'
    },
    {
      slot: 'Relic',
      partName: 'Gampiric Relic',
      recognizedSetName: 'Gampiric',
      setNameCandidate: 'Vampiric',
      querySource: 'corroborated',
      refineLevel: undefined,
      suffixText: 'Venom Strik'
    }
  ])
})

test('produces one explicit artifact-only review query per recognized slot', () => {
  const lines = artifactOcrMatchLines(parseArtifactOcrText(`+6 Vampiric Rune
+6 Vampiric Jewel
+6 Vampiric Scroll
+6 Vampiric Relic`))

  assert.deepEqual(lines, [
    { id: 'artifact-rune', text: 'Vampiric', kinds: ['artifact'] },
    { id: 'artifact-jewel', text: 'Vampiric', kinds: ['artifact'] },
    { id: 'artifact-scroll', text: 'Vampiric', kinds: ['artifact'] },
    { id: 'artifact-relic', text: 'Vampiric', kinds: ['artifact'] }
  ])
  assert.ok(lines.every(line => line.text.length <= 240 && line.kinds.length === 1))
  assert.ok(lines.every(line => !('selection' in line) && !('candidate' in line)))
})

test('keeps uncertain standalone readings as review queries instead of inventing a set', () => {
  const parsed = parseArtifactOcrText(`6) ampiric Relic
af Venom Strike`)

  assert.deepEqual(parsed.parts, [{
    slot: 'Relic',
    partName: 'ampiric Relic',
    recognizedSetName: 'ampiric',
    setNameCandidate: 'ampiric',
    querySource: 'recognized',
    refineLevel: 6,
    suffixText: 'Venom Strike'
  }])
  assert.deepEqual(artifactOcrMatchLines(parsed), [
    { id: 'artifact-relic', text: 'ampiric', kinds: ['artifact'] }
  ])
})

test('parses a part and suffix when sparse OCR keeps them on one line', () => {
  assert.deepEqual(parseArtifactOcrText('+6 Vampiric Rune of Venom Strike').parts, [{
    slot: 'Rune',
    partName: 'Vampiric Rune',
    recognizedSetName: 'Vampiric',
    setNameCandidate: 'Vampiric',
    querySource: 'recognized',
    refineLevel: 6,
    suffixText: 'Venom Strike'
  }])
})

test('ignores unrelated character text, invalid values, duplicate slots, and empty input', () => {
  const parsed = parseArtifactOcrText(`Shinobi
Lv.64
姿态: 双持
+999 Vampiric Rune
+5 Vampiric Rune
Strike
of
符文`)

  assert.deepEqual(parsed.parts, [{
    slot: 'Rune',
    partName: 'Vampiric Rune',
    recognizedSetName: 'Vampiric',
    setNameCandidate: 'Vampiric',
    querySource: 'recognized',
    refineLevel: 5
  }])
  assert.deepEqual(parseArtifactOcrText(' \n\t '), { parts: [] })
  assert.deepEqual(artifactOcrMatchLines({ parts: [] }), [])
})

test('bounds matcher text even when passed a malformed overlong parsed value', () => {
  const overlong = `Vampiric${'x'.repeat(400)}`
  const lines = artifactOcrMatchLines({
    parts: [{
      slot: 'Rune',
      partName: `${overlong} Rune`,
      recognizedSetName: overlong,
      setNameCandidate: overlong,
      querySource: 'recognized'
    }]
  })

  assert.equal(lines.length, 1)
  assert.equal(lines[0]?.text.length, 240)
  assert.deepEqual(lines[0]?.kinds, ['artifact'])
})

function artifactPart(slot: ArtifactOcrPartParse['slot']): ArtifactOcrPartParse {
  return {
    slot,
    partName: `Vampiric ${slot}`,
    recognizedSetName: 'Vampiric',
    setNameCandidate: 'Vampiric',
    querySource: 'recognized',
    refineLevel: 6,
    suffixText: 'Venom Strike'
  }
}
