import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const catalogPath = path.join(root, 'packages/game-data/src/runtime-catalog.json')
const lineagePath = path.join(root, 'packages/game-data/src/archetype-lineage.json')
const iconRoot = path.join(root, 'apps/web/public/game-assets/runtime-icons')
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const lineage = JSON.parse(await readFile(lineagePath, 'utf8'))

const expected = {
  equipment: 647,
  equipmentSets: 24,
  substatPools: 9,
  archetypes: 31,
  archetypeSkillRelations: 56,
  skills: 279,
  skillPassives: 111,
  artifacts: 45,
  gems: 129,
  cards: 327,
  monsterArchetypes: 13,
  monsters: 330,
  statuses: 185,
  weapons: 23
}

for (const [key, count] of Object.entries(expected)) {
  assert.equal(catalog[key]?.length, count, `${key} count changed`)
  if (!catalog[key].every(entry => typeof entry.id === 'string' && entry.id.length)) continue
  assert.equal(new Set(catalog[key].map(entry => entry.id)).size, count, `${key} contains duplicate IDs`)
  if (catalog[key].every(entry => typeof entry.slug === 'string' && entry.slug.length)) {
    assert.equal(new Set(catalog[key].map(entry => entry.slug)).size, count, `${key} contains duplicate slugs`)
  }
}

const ids = records => new Set(records.map(record => record.id))
const equipmentIds = ids(catalog.equipment)
const poolIds = ids(catalog.substatPools)
const skillIds = new Set([...ids(catalog.skills), ...ids(catalog.skillPassives)])
const statusIds = ids(catalog.statuses)
const artifactIds = ids(catalog.artifacts)
const cardIds = ids(catalog.cards)
const gemIds = ids(catalog.gems)
const archetypeIds = ids(catalog.archetypes)

const expectedArchetypeIconFallbacks = {
  Artificer: { configSourcePathId: 83754, spriteSourcePathId: 9669, spriteId: 'Economy_Gem_05_Yellow' },
  Blacksmith: { configSourcePathId: 83755, spriteSourcePathId: 8801, spriteId: 'Item_Anvil_01_Light' },
  Craftsman: { configSourcePathId: 83757, spriteSourcePathId: 10803, spriteId: 'Gear_Weapons_Hammer_01' },
  Gemsmith: { configSourcePathId: 83759, spriteSourcePathId: 10142, spriteId: 'ItemIcon_Gem_Diamond_Blue' },
  Stylist: { configSourcePathId: 83766, spriteSourcePathId: 9672, spriteId: 'Item_HandMirror_01' }
}
const archetypeFallbackIds = catalog.archetypes
  .filter(archetype => archetype.fallbackIcon)
  .map(archetype => archetype.id)
  .sort()
assert.deepEqual(archetypeFallbackIds, Object.keys(expectedArchetypeIconFallbacks).sort(), 'Audited archetype icon fallback set changed')
for (const [id, expectedFallback] of Object.entries(expectedArchetypeIconFallbacks)) {
  const archetype = catalog.archetypes.find(value => value.id === id)
  assert.equal(archetype.icon, null, `${id} must preserve its null ArchetypeConfig icon`)
  assert.equal(archetype.iconSource, null, `${id} must preserve its null ArchetypeConfig icon source`)
  assert.equal(archetype.fallbackIconBasis, 'npc-config-same-id', `${id} fallback basis changed`)
  assert.match(archetype.fallbackIcon, /^\/game-assets\/runtime-icons\/.+\.png$/, `${id} fallback icon is not local`)
  assert.equal(archetype.fallbackIconSource.configClass, 'NpcConfig', `${id} fallback config class changed`)
  assert.equal(archetype.fallbackIconSource.configId, id, `${id} fallback must use a same-ID NpcConfig`)
  assert.equal(archetype.fallbackIconSource.configSourcePathId, expectedFallback.configSourcePathId, `${id} NpcConfig path ID changed`)
  assert.equal(archetype.fallbackIconSource.sourcePathId, expectedFallback.spriteSourcePathId, `${id} Sprite path ID changed`)
  assert.equal(archetype.fallbackIconSource.spriteId, expectedFallback.spriteId, `${id} Sprite ID changed`)
  const sprite = catalog.sprites[String(expectedFallback.spriteSourcePathId)]
  assert.ok(sprite.categories.includes('archetype-npc-fallback'), `${id} fallback Sprite category is missing`)
  assert.ok(sprite.referencedBy.includes(id), `${id} fallback Sprite provenance is missing`)
}
for (const id of ['Cardweaver', 'Merchant']) {
  const archetype = catalog.archetypes.find(value => value.id === id)
  assert.equal(archetype.icon, null, `${id} direct icon changed`)
  assert.equal(archetype.fallbackIcon, null, `${id} must not use a semantic NPC alias`)
  assert.equal(archetype.fallbackIconBasis, null, `${id} must not use a semantic NPC alias basis`)
}

assert.equal(lineage.meta.method, 'Formula.GetRequiredClass')
assert.equal(lineage.meta.advancementJobLevel, 50)
assert.match(lineage.meta.advancementJobLevelSource, /Formula\.RequiredAdvanceJobLevel/)
assert.equal(Object.keys(lineage.requiredClassByArchetype).length, 21)
for (const id of [...lineage.baseArchetypes, ...lineage.specialArchetypes, ...lineage.professionArchetypes]) {
  assert.ok(archetypeIds.has(id), `Lineage points to missing archetype ${id}`)
}
for (const [advanced, base] of Object.entries(lineage.requiredClassByArchetype)) {
  assert.ok(archetypeIds.has(base), `Lineage points to missing base archetype ${base}`)
}
assert.deepEqual(
  Object.keys(lineage.requiredClassByArchetype).filter(id => !archetypeIds.has(id)),
  ['Nightshade', 'Spellblade', 'BladeMaster', 'Mechanist', 'Alchemist'],
  'Native advancement entries without current ArchetypeConfig changed'
)

for (const set of catalog.equipmentSets) {
  for (const id of set.equipmentIds) assert.ok(equipmentIds.has(id), `Set ${set.id} points to missing equipment ${id}`)
}
for (const item of catalog.equipment) {
  if (item.substatPoolId) assert.ok(poolIds.has(item.substatPoolId), `${item.id} points to missing substat pool`)
  assert.equal('rarity' in item, false, `${item.id} unexpectedly received inferred rarity`)
}
for (const skill of [...catalog.skills, ...catalog.skillPassives]) {
  for (const requirement of skill.requirements || []) assert.ok(skillIds.has(requirement.skillId), `${skill.id} has missing requirement ${requirement.skillId}`)
  for (const group of ['statusEffects', 'selfStatusEffects']) {
    for (const status of skill[group] || []) if (status.id) assert.ok(statusIds.has(status.id), `${skill.id} points to missing status ${status.id}`)
  }
}
for (const status of catalog.statuses) {
  for (const nested of status.statusEffects || []) if (nested.id) assert.ok(statusIds.has(nested.id), `${status.id} points to missing nested status ${nested.id}`)
}
for (const monster of catalog.monsters) {
  for (const skill of monster.skills || []) assert.ok(skillIds.has(skill.skillId), `${monster.id} points to missing skill ${skill.skillId}`)
  for (const drop of monster.drops?.equipment || []) assert.ok(equipmentIds.has(drop.id), `${monster.id} points to missing equipment drop ${drop.id}`)
  if (monster.drops?.artifact?.id) assert.ok(artifactIds.has(monster.drops.artifact.id), `${monster.id} points to missing artifact drop`)
  if (monster.drops?.card?.id) assert.ok(cardIds.has(monster.drops.card.id), `${monster.id} points to missing card drop`)
  for (const drop of monster.drops?.gems || []) if (drop.id) assert.ok(gemIds.has(drop.id), `${monster.id} points to missing gem drop ${drop.id}`)
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const iconFiles = (await readdir(iconRoot)).filter(file => file.endsWith('.png')).sort()
const spritePaths = Object.values(catalog.sprites).map(sprite => path.basename(sprite.publicPath)).sort()
assert.equal(iconFiles.length, 1_179)
assert.deepEqual(iconFiles, spritePaths, 'Runtime icon directory and sprite manifest differ')
for (const file of iconFiles) {
  const bytes = await readFile(path.join(iconRoot, file))
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), `${file} is not a valid PNG`)
}

console.log('SpiritVale game-data verification passed: 14 runtime collections, cross-references, and 1,179 PNG icons.')
