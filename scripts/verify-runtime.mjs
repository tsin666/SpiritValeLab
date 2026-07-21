import assert from 'node:assert/strict'

const webBase = process.env.SPIRITVALE_WEB_URL || 'http://127.0.0.1:3000'
const apiBase = process.env.SPIRITVALE_API_URL || 'http://127.0.0.1:4100'

async function json(path) {
  const response = await fetch(`${apiBase}${path}`)
  assert.equal(response.status, 200, `${path} returned ${response.status}`)
  return response.json()
}

const health = await json('/api/health')
assert.equal(health.ok, true)
assert.equal(health.services.mongo, true, 'MongoDB is not connected')
assert.equal(health.services.redis, true, 'Redis is not connected')
assert.equal(health.localizedCatalogEntries, 7_218)
assert.equal(health.equipmentEntries, 647)
assert.equal(health.archetypeEntries, 31)
assert.equal(health.equipmentSetEntries, 24)
assert.equal(health.substatPoolEntries, 9)
assert.equal(health.archetypeSkillRelationEntries, 56)
assert.equal(health.skillEntries, 279)
assert.equal(health.artifactEntries, 45)
assert.equal(health.gemEntries, 129)
assert.equal(health.cardEntries, 327)
assert.equal(health.monsterArchetypeEntries, 13)
assert.equal(health.monsterEntries, 330)
assert.equal(health.statusEntries, 185)
assert.equal(health.weaponEntries, 23)
assert.equal(health.runtimeCatalogCollections, 14)
assert.equal(health.runtimeCatalogEntries, 2_209)
assert.equal(health.runtimeSpriteEntries, 1_179)

const builds = await json('/api/builds?sort=rank')
const removedDemoSlugs = new Set(['paladin-aegis-v1', 'wizard-meteor-v1', 'ranger-storm-v1', 'assassin-shadow-v1'])
assert.ok(builds.every(build => !removedDemoSlugs.has(build.slug)), 'Legacy demo builds are still visible')
assert.ok(builds.every(build => build.userGenerated === true && build.source === 'user'), 'Build hall contains a non-user build')

const equipment = await json('/api/equipment?q=Crit_10&pageSize=5')
assert.ok(equipment.total > 0, 'Affix search returned no equipment')
assert.ok(equipment.items.some(item => item.availableAffixes?.some(affix => affix.name === 'Crit_10')))
assert.ok(equipment.items.every(item => Array.isArray(item.affixes) && Array.isArray(item.availableAffixes)))

const set = await json('/api/equipment?setId=Arcane&pageSize=10')
assert.equal(set.total, 4)
assert.ok(set.items.every(item => item.set?.id === 'Arcane' && item.setBonuses?.length))

const archetype = await json('/api/archetypes/wizard')
assert.deepEqual(archetype.previewSkills.map(skill => skill.id), ['Meteor', 'FreezingField', 'ChainLightning', 'TetraVortex'])
assert.equal('skills' in archetype, false, 'Preview skills must not be presented as a complete class skill list')
assert.ok(Array.isArray(archetype.buildReferencedSkills))
assert.equal(archetype.stage, 'advanced')
assert.equal(archetype.requiredClass.id, 'Mage')
assert.equal(archetype.lineageSource.method, 'Formula.GetRequiredClass')

const baseArchetype = await json('/api/archetypes/acolyte')
assert.deepEqual(baseArchetype.advancesTo.map(item => item.id), ['Priest', 'Monk', 'Warlock'])
const warrior = await json('/api/archetypes/warrior')
assert.deepEqual(warrior.advancementOptions.map(item => [item.id, item.configPresent]), [
  ['Berserker', true],
  ['BladeMaster', false],
  ['Mechanist', false]
])

const skill = await json('/api/catalog/skills/aegis')
assert.equal(skill.scaledValues.cooldown.base, 80)
assert.ok(skill.requirements.some(entry => entry.skillId === 'HolyShield'))

const gem = await json('/api/catalog/gems/aerialshot-gem')
assert.equal(gem.stats[0].type, 'SkillDamage')

const monster = await json('/api/catalog/monsters/abomination')
assert.ok(monster.drops.equipment.some(entry => entry.id === 'BerserkFeet'))
assert.equal(monster.archetype.id, monster.archetypeId)

const equipmentSet = await json('/api/catalog/equipment-sets/arcane')
assert.equal(equipmentSet.memberCount, 4)
assert.ok(equipmentSet.fullSet.every(entry => entry.requiredPieces === 4))

const substatPool = await json('/api/catalog/substat-pools/accessory')
assert.ok(substatPool.groups.length > 0)

const previewRelation = await json('/api/catalog/archetype-skill-relations/acolyte-barrier')
assert.equal(previewRelation.kind, 'preview')

const monsterArchetype = await json('/api/catalog/monster-archetypes/archer')
assert.equal(monsterArchetype.id, 'Archer')

const weapon = await json('/api/catalog/weapons/axe')
assert.equal(weapon.id, 'Axe')

const routes = [
  ['/', 'zh-CN'],
  ['/en', 'en-US'],
  ['/equipment', 'zh-CN'],
  ['/en/equipment', 'en-US'],
  ['/classes', 'zh-CN'],
  ['/en/classes', 'en-US'],
  ['/builder', 'zh-CN'],
  ['/en/builder', 'en-US'],
  ['/catalog', 'zh-CN'],
  ['/en/catalog', 'en-US'],
  ['/catalog/skills', 'zh-CN'],
  ['/en/catalog/skills', 'en-US'],
  ['/catalog/skills/aegis', 'zh-CN'],
  ['/en/catalog/artifacts/acolyte', 'en-US'],
  ['/catalog/gems/aerialshot-gem', 'zh-CN'],
  ['/catalog/equipment-sets', 'zh-CN'],
  ['/catalog/substat-pools', 'zh-CN'],
  ['/catalog/archetype-skill-relations', 'zh-CN'],
  ['/catalog/monster-archetypes', 'zh-CN'],
  ['/catalog/weapons', 'zh-CN']
]

for (const [path, language] of routes) {
  const response = await fetch(`${webBase}${path}`)
  assert.equal(response.status, 200, `${path} returned ${response.status}`)
  const html = await response.text()
  assert.match(html, new RegExp(`<html[^>]+lang=["']${language}["']`, 'i'), `${path} has the wrong html lang`)
}

console.log(`SpiritVale runtime smoke passed: ${routes.length} SSR routes, MongoDB, Redis, user-only builds, native class progression, 14 runtime collections, candidate affix pools, sets, skills, gems, and monster drops.`)
