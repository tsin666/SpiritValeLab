import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createOcrCatalogMatcher,
  normalizeOcrText,
  type OcrCatalogSources
} from '../src/ocr/catalog-matcher.js'

const completeCatalog: OcrCatalogSources = {
  archetype: [{ id: 'Paladin', slug: 'paladin', displayName: 'Paladin', name: { en: 'Paladin', zh: '圣骑士' } }],
  skill: [{ id: 'Whirlwind', slug: 'whirlwind', displayName: 'Whirlwind', name: { en: 'Whirlwind', zh: '旋风斩' } }],
  skillPassive: [{ id: 'IronWill', slug: 'iron-will', displayName: 'Iron Will', name: { en: 'Iron Will', zh: '钢铁意志' } }],
  equipment: [{ id: 'ArcaneSigil', slug: 'arcane-sigil', displayName: 'Arcane Sigil', name: { en: 'Arcane Sigil', zh: '奥术印记' } }],
  artifact: [{ id: 'AstralPrism', slug: 'astral-prism', displayName: 'Astral Prism', name: { en: 'Astral Prism', zh: '星界棱镜' } }],
  gem: [{ id: 'AerialShotGem', slug: 'aerial-shot-gem', displayName: 'Aerial Shot Gem', name: { en: 'Aerial Shot Gem', zh: '空中射击宝石' } }],
  card: [{ id: 'Abomination', slug: 'abomination', displayName: 'Abomination', name: { en: 'Abomination', zh: '憎恶卡片' } }]
}

test('normalizes Unicode NFKC, punctuation and whitespace while preserving word boundaries', () => {
  assert.equal(normalizeOcrText('  ＡＲＣＡＮＥ—ＳＩＧＩＬ\t\n'), 'arcane sigil')
  assert.equal(normalizeOcrText('星界・棱镜'), '星界 棱镜')
})

test('indexes and exactly matches every supported catalog kind', () => {
  const matcher = createOcrCatalogMatcher(completeCatalog)
  const queries = [
    ['Paladin', 'archetype'],
    ['旋风斩', 'skill'],
    ['iron-will', 'skillPassive'],
    ['ＡＲＣＡＮＥ—ＳＩＧＩＬ', 'equipment'],
    ['星界棱镜', 'artifact'],
    ['aerial shot gem', 'gem'],
    ['Abomination', 'card']
  ] as const

  assert.equal(matcher.size, 7)
  for (const [query, kind] of queries) {
    const result = matcher.match(query)
    assert.equal(result.status, 'suggested', query)
    assert.equal(result.candidates[0]?.kind, kind, query)
    assert.equal(result.candidates[0]?.matchType, 'exact', query)
    assert.equal(result.candidates[0]?.score, 1, query)
  }
})

test('uses Fuse fuzzy matching for a small OCR typo', () => {
  const result = createOcrCatalogMatcher(completeCatalog).match('Whirlwnd')

  assert.equal(result.status, 'suggested')
  assert.equal(result.candidates[0]?.id, 'Whirlwind')
  assert.equal(result.candidates[0]?.kind, 'skill')
  assert.equal(result.candidates[0]?.matchType, 'fuzzy')
  assert.equal(result.candidates[0]?.matchedAlias, 'Whirlwind')
  assert.equal(result.candidates[0]?.score, 0.888889)
})

test('re-scores Fuse recall by the true best alias and keeps a low-confidence typo ambiguous', () => {
  const matcher = createOcrCatalogMatcher({
    archetype: [{ id: 'Acolyte', slug: 'acolyte', displayName: 'Acolyte', name: 'Acolyte' }],
    card: [{ id: 'NightmareAcolyte', slug: 'nightmare-acolyte', displayName: 'Nightmare Acolyte', name: 'Nightmare Acolyte' }]
  })
  const result = matcher.match('aacolyte')

  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(result.candidates.slice(0, 2).map(candidate => candidate.id), ['Acolyte', 'NightmareAcolyte'])
  assert.equal(result.candidates[0]?.matchedAlias, 'Acolyte')
  assert.equal(result.candidates[0]?.score, 0.875)
})

test('tolerates a common enhancement-level prefix without auto-accepting weaker candidates', () => {
  const matcher = createOcrCatalogMatcher({
    equipment: [{ id: 'AshwalkerShoes', slug: 'ashwalker-shoes', displayName: 'Ashwalker Shoes', name: 'Ashwalker Shoes' }]
  })
  const result = matcher.match('+6 Ashwalker Shoes')

  assert.equal(result.status, 'suggested')
  assert.equal(result.candidates[0]?.id, 'AshwalkerShoes')
  assert.equal(result.candidates[0]?.matchedAlias, 'Ashwalker Shoes')
  assert.equal(result.candidates[0]?.score, 0.882353)
})

test('marks an exact cross-category alias collision as ambiguous', () => {
  const matcher = createOcrCatalogMatcher({
    archetype: [{ id: 'Acolyte', slug: 'acolyte', name: { en: 'Acolyte' } }],
    artifact: [{ id: 'AcolyteArtifact', slug: 'acolyte-artifact', displayName: 'Acolyte', name: { en: 'Acolyte' } }]
  })
  const result = matcher.match('Acolyte')

  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(result.candidates.map(candidate => candidate.kind), ['archetype', 'artifact'])
  assert.ok(result.candidates.every(candidate => candidate.matchType === 'exact'))
})

test('returns unmatched for unrelated text and never indexes descriptions', () => {
  const matcher = createOcrCatalogMatcher({
    equipment: [{
      id: 'PlainTome',
      slug: 'plain-tome',
      displayName: 'Plain Tome',
      name: { en: 'Plain Tome' },
      description: 'Singularity Nova'
    }]
  })

  assert.deepEqual(matcher.match('qxzv plutonium dishwasher').candidates, [])
  assert.equal(matcher.match('qxzv plutonium dishwasher').status, 'unmatched')
  assert.deepEqual(matcher.match('Singularity Nova').candidates, [])
  assert.equal(matcher.match('Singularity Nova').status, 'unmatched')
})

test('caps candidates per line and supports explicit kind narrowing', () => {
  const matcher = createOcrCatalogMatcher({
    archetype: [{ id: 'Acolyte', name: 'Acolyte' }],
    skill: [{ id: 'AcolyteSkill', displayName: 'Acolyte', name: 'Acolyte' }],
    equipment: [{ id: 'AcolyteEquipment', displayName: 'Acolyte', name: 'Acolyte' }],
    artifact: [{ id: 'AcolyteArtifact', displayName: 'Acolyte', name: 'Acolyte' }],
    card: [{ id: 'AcolyteCard', displayName: 'Acolyte', name: 'Acolyte' }]
  }, { maxCandidates: 2 })

  const [line] = matcher.matchLines([{ id: 'line-7', text: 'Acolyte' }])
  assert.equal(line.lineId, 'line-7')
  assert.equal(line.status, 'ambiguous')
  assert.equal(line.candidates.length, 2)

  const narrowed = matcher.match('Acolyte', { kinds: ['artifact'], maxCandidates: 10 })
  assert.equal(narrowed.status, 'suggested')
  assert.deepEqual(narrowed.candidates.map(candidate => candidate.kind), ['artifact'])
})

test('produces deterministic ordering regardless of source record order', () => {
  const records = [
    { id: 'RadiantShieldB', displayName: 'Radiant Shield', name: 'Radiant Shield' },
    { id: 'RadiantShieldA', displayName: 'Radiant Shield', name: 'Radiant Shield' }
  ]
  const forward = createOcrCatalogMatcher({ equipment: records }).match('Radiant Shiel')
  const reversed = createOcrCatalogMatcher({ equipment: [...records].reverse() }).match('Radiant Shiel')

  assert.equal(forward.status, 'ambiguous')
  assert.deepEqual(forward, reversed)
  assert.deepEqual(forward.candidates.map(candidate => candidate.id), ['RadiantShieldA', 'RadiantShieldB'])
  assert.deepEqual(createOcrCatalogMatcher({ equipment: records }).match('Radiant Shiel'), forward)
})

test('indexes the current SpiritVale runtime catalogs and preserves real collisions', async () => {
  const { runtimeRecordsForKind } = await import('../src/runtime-data.js')
  const matcher = createOcrCatalogMatcher({
    archetype: runtimeRecordsForKind('archetypes'),
    skill: runtimeRecordsForKind('skills'),
    skillPassive: runtimeRecordsForKind('skillPassives'),
    equipment: runtimeRecordsForKind('equips'),
    artifact: runtimeRecordsForKind('artifacts'),
    gem: runtimeRecordsForKind('gems'),
    card: runtimeRecordsForKind('cards')
  })

  assert.equal(matcher.size, 1_569)
  assert.deepEqual(matcher.counts, {
    archetype: 31,
    skill: 279,
    skillPassive: 111,
    equipment: 647,
    artifact: 45,
    gem: 129,
    card: 327
  })
  const collision = matcher.match('Acolyte')
  assert.equal(collision.status, 'ambiguous')
  assert.deepEqual(collision.candidates.slice(0, 2).map(candidate => candidate.kind), ['archetype', 'artifact'])

  const typo = matcher.match('aacolyte')
  assert.equal(typo.status, 'ambiguous')
  assert.equal(typo.candidates[0]?.id, 'Acolyte')
  assert.equal(typo.candidates[0]?.score, 0.875)

  const enhancedEquipment = matcher.match('+6 Ashwalker Shoes')
  assert.equal(enhancedEquipment.status, 'suggested')
  assert.equal(enhancedEquipment.candidates[0]?.id, 'ThiefFeet')
  assert.equal(enhancedEquipment.candidates[0]?.displayName, 'Ashwalker Shoes')
  assert.equal(enhancedEquipment.candidates[0]?.matchedAlias, 'Ashwalker Shoes')
})
