import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { buildApp } = await import('../src/app.js')
const { StatType } = await import('../src/runtime-data.js')
const app = await buildApp()

before(async () => app.ready())
after(async () => app.close())

type JsonRecord = Record<string, any>

function localizedEnglish(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return typeof record.en === 'string' ? record.en : typeof record.zh === 'string' ? record.zh : ''
  }
  return ''
}

test('builder options expose the complete class-agnostic runtime catalogs and official enums', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/builder/options' })
  assert.equal(response.statusCode, 200, JSON.stringify(response.json()))
  const options = response.json() as JsonRecord

  assert.equal(options.archetypes.length, 31)
  assert.equal(options.skills.length, 279)
  assert.equal(options.equipment.length, 647)
  assert.equal(options.skillPassives.length, 111)
  assert.equal(options.grimoires.length, 71)
  assert.equal(options.artifacts.length, 45)
  assert.equal(options.gems.length, 129)
  assert.equal(options.cards.length, 327)
  assert.ok(options.artifacts.every((item: JsonRecord) => item.partCount === 4 && item.parts.length === 4))
  assert.ok(options.artifacts.every((item: JsonRecord) => item.parts.every((part: JsonRecord) => /^\/game-assets\/runtime-icons\/.+\.png$/.test(part.icon))))

  assert.ok(options.archetypes.every((item: JsonRecord) => item.id && item.slug && item.name))
  assert.ok(options.skills.every((item: JsonRecord) => item.id && item.slug && item.name))
  assert.ok(options.equipment.every((item: JsonRecord) => item.id && item.slug && item.name))
  assert.deepEqual(options.difficulties, ['入门', '进阶', '专家'])

  assert.deepEqual(options.equipmentSlots, [
    { value: 'main-hand', sourceName: 'Mainhand' },
    { value: 'off-hand', sourceName: 'Offhand' },
    { value: 'head', sourceName: 'Head' },
    { value: 'legs', sourceName: 'Legs' },
    { value: 'feet', sourceName: 'Feet' },
    { value: 'chest', sourceName: 'Chest' },
    { value: 'accessory-left', sourceName: 'AccessoryLeft' },
    { value: 'accessory-right', sourceName: 'AccessoryRight' },
    { value: 'eyewear', sourceName: 'Eyewear' },
    { value: 'back', sourceName: 'Back' }
  ])
  assert.deepEqual(options.artifactSlots, ['Rune', 'Jewel', 'Scroll', 'Relic'])
  assert.deepEqual(options.stances, ['None', 'Unarmed', 'OneHanded', 'TwoHanded', 'DualWield'])
  assert.ok(options.statTypes.length > 0)
  assert.equal(options.statTypes.length, 221)
  assert.equal(new Set(options.statTypes).size, options.statTypes.length)
  assert.deepEqual(options.statTypes, StatType)

  assert.deepEqual(options.metadata, {
    skillTreeOwnership: 'user-confirmed',
    equipmentRuntimeSlotsMeaning: 'unverified',
    artifactPartSlotMapping: 'user-confirmed'
  })
})

test('builder options include enriched representative records from every loadout catalog', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/builder/options' })
  assert.equal(response.statusCode, 200)
  const options = response.json() as JsonRecord

  const wizard = options.archetypes.find((item: JsonRecord) => item.id === 'Wizard')
  assert.equal(wizard.maxJobLevel, 70)
  assert.match(wizard.icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const meteor = options.skills.find((item: JsonRecord) => item.id === 'Meteor')
  assert.equal(meteor.maxLevel, 10)
  assert.match(meteor.icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const roguePassive = options.skillPassives.find((item: JsonRecord) => item.id === 'Rogue_5')
  assert.equal(roguePassive.maxLevel, 0)
  assert.equal(roguePassive.configKind, 'passive')
  assert.equal(localizedEnglish(roguePassive.name), 'Hidden Strikes')
  assert.match(roguePassive.icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const rogueGrimoire = options.grimoires.find((item: JsonRecord) => item.id === 'Rogue_5')
  assert.equal(String(rogueGrimoire.type).toLowerCase(), 'grimoire')
  assert.deepEqual(rogueGrimoire.allowedArchetypes, ['Rogue'])
  assert.equal(rogueGrimoire.hasArchetypeRestriction, true)
  assert.equal(localizedEnglish(rogueGrimoire.name), 'Hidden Strikes')
  assert.match(rogueGrimoire.icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const mageArtifact = options.artifacts.find((item: JsonRecord) => item.id === 'Mage')
  assert.equal(localizedEnglish(mageArtifact.name), 'Arcane Origin')
  assert.equal(mageArtifact.partCount, 4)
  assert.deepEqual(mageArtifact.parts.map((part: JsonRecord) => part.index), [0, 1, 2, 3])
  assert.ok(mageArtifact.parts.every((part: JsonRecord) => /^\/game-assets\/runtime-icons\/.+\.png$/.test(part.icon)))

  const meteorGem = options.gems.find((item: JsonRecord) => item.id === 'Meteor Gem')
  assert.equal(localizedEnglish(meteorGem.name), 'Meteor Gem')
  assert.equal(localizedEnglish(meteorGem.affix), 'Meteor')
  assert.match(meteorGem.icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const abominationCard = options.cards.find((item: JsonRecord) => item.id === 'Abomination')
  assert.equal(localizedEnglish(abominationCard.name), 'Abomination Card')
  assert.equal(abominationCard.equipClass, 'Chest')
  assert.match(abominationCard.icon, /^\/game-assets\/runtime-icons\/.+\.png$/)
})

test('builder options reject unsupported query parameters', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/builder/options?extra=true' })
  assert.equal(response.statusCode, 400)
  assert.equal(response.json().code, 'VALIDATION_ERROR')
})
