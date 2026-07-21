import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { buildApp } = await import('../src/app.js')
const { BuildModel } = await import('../src/models/build.js')
const app = await buildApp()

before(async () => app.ready())
after(async () => app.close())

type JsonRecord = Record<string, any>

function legacyPayload(slug: string): JsonRecord {
  return {
    slug,
    title: 'Legacy Wizard build',
    archetype: 'Wizard',
    difficulty: '进阶',
    summary: 'A legacy build remains publishable without a character snapshot.',
    guide: [],
    tags: ['legacy'],
    skills: [{ id: 'Meteor' }],
    equipment: [{ id: 'Meteoric Staff' }],
    createdBy: 'snapshot-test'
  }
}

function richWizardPayload(slug: string): JsonRecord {
  return {
    ...legacyPayload(slug),
    title: 'Complete Wizard snapshot',
    snapshotVersion: 1,
    character: {
      name: 'All-classes fixture',
      level: 64,
      jobLevel: 64,
      stance: 'DualWield',
      stats: [
        { type: 'Str', value: 15, bonus: 3, unit: 'flat' },
        { type: 'Int', value: 110, bonus: 10, unit: 'flat' },
        { type: 'Hp', value: 3_826, unit: 'flat' }
      ]
    },
    skillTree: [
      { id: 'Meteor', kind: 'active', level: 8, treeArchetype: 'Wizard' },
      { id: 'CodexMastery', kind: 'passive', level: 5, treeArchetype: 'Mage' }
    ],
    equipment: [
      {
        id: 'Meteoric Staff',
        slotKey: 'main-hand',
        refineLevel: 6,
        potential: 11,
        actualAffixes: [
          { type: 'Matk', value: 12, unit: 'flat' },
          { type: 'CastSpd', value: 10, unit: 'percent' }
        ],
        cards: [{ slotIndex: 0, id: 'Alien Galaxia' }]
      },
      {
        id: 'Meteoric Staff',
        slotKey: 'off-hand',
        refineLevel: 5,
        potential: 9,
        actualAffixes: [{ type: 'Int', value: 3, unit: 'flat' }],
        cards: [{ slotIndex: 0, id: 'Alien Pew Pew' }]
      }
    ],
    artifacts: [
      { slot: 'Rune', partIndex: 0, id: 'Mage', refineLevel: 6, actualAffixes: [
        { type: 'SkillDamage', value: 5, unit: 'percent', subjectId: 'Meteor' },
        { type: 'SkillDamage', value: 5, unit: 'percent', subjectId: 'FirePillar' }
      ], gem: { id: 'Meteor Gem' } },
      { slot: 'Jewel', partIndex: 1, id: 'Mage', refineLevel: 6, actualAffixes: [{ type: 'Matk', value: 10, unit: 'flat' }], gem: { id: 'Meteor Gem' } },
      { slot: 'Scroll', partIndex: 2, id: 'Mage', refineLevel: 5, actualAffixes: [{ type: 'CastSpd', value: 10, unit: 'percent' }], gem: { id: 'Meteor Gem' } },
      { slot: 'Relic', partIndex: 3, id: 'Mage', refineLevel: 4, actualAffixes: [{ type: 'Hp', value: 100, unit: 'flat' }], gem: { id: 'Meteor Gem' } }
    ],
    grimoires: [{ slotIndex: 0, id: 'Mage_1' }]
  }
}

async function expectRejected(payload: JsonRecord, code: string) {
  const response = await app.inject({ method: 'POST', url: '/api/builds', payload })
  assert.equal(response.statusCode, 400, JSON.stringify(response.json()))
  assert.equal(response.json().code, code, JSON.stringify(response.json()))
  assert.equal(typeof response.json().error, 'string')
  assert.ok(response.json().error.length > 0)
}

test('legacy build payload remains backward compatible', async () => {
  const payload = legacyPayload('snapshot-legacy-compatible')
  const response = await app.inject({ method: 'POST', url: '/api/builds', payload })

  assert.equal(response.statusCode, 201, JSON.stringify(response.json()))
  assert.equal(response.json().slug, payload.slug)
  assert.equal(response.json().snapshotVersion, undefined)
  assert.equal(response.json().character, undefined)
  assert.deepEqual(response.json().skillTree || [], [])
  assert.deepEqual(response.json().artifacts || [], [])
  assert.deepEqual(response.json().grimoires || [], [])
  assert.equal('setId' in response.json().equipment[0], false)
  assert.equal('set' in response.json().equipment[0], false)

  const legacyGrimoireDocument = new BuildModel({
    ...response.json(),
    snapshotVersion: 1,
    grimoires: [{ slotIndex: 0, id: 'Mage_1' }]
  })
  await legacyGrimoireDocument.validate()
  assert.equal(legacyGrimoireDocument.toObject().grimoires[0].passive, undefined)

  const implicitVersion = richWizardPayload('snapshot-version-auto-detected')
  delete implicitVersion.snapshotVersion
  const richResponse = await app.inject({ method: 'POST', url: '/api/builds', payload: implicitVersion })
  assert.equal(richResponse.statusCode, 201, JSON.stringify(richResponse.json()))
  assert.equal(richResponse.json().snapshotVersion, 1)
})

test('selected set equipment persists only verified runtime set identity, localized names and effects', async () => {
  const payload = {
    ...legacyPayload('snapshot-runtime-equipment-set'),
    equipment: [{ id: 'ArcaneChest' }]
  }
  const response = await app.inject({ method: 'POST', url: '/api/builds', payload })
  assert.equal(response.statusCode, 201, JSON.stringify(response.json()))
  const equipment = response.json().equipment[0]

  assert.equal(equipment.id, 'ArcaneChest')
  assert.equal(equipment.setId, 'Arcane')
  assert.deepEqual({
    id: equipment.set.id,
    slug: equipment.set.slug,
    name: equipment.set.name,
    nameZh: equipment.set.nameZh,
    nameEn: equipment.set.nameEn
  }, {
    id: 'Arcane',
    slug: 'arcane',
    name: 'Arcane',
    nameZh: 'Arcane',
    nameEn: 'Arcane'
  })
  assert.equal(equipment.set.effects.length, 5)
  assert.deepEqual(equipment.set.equipmentIds, ['ArcaneChest', 'ArcaneFeet', 'ArcaneGloves', 'ArcaneLegs'])
  assert.deepEqual(equipment.set.effects[0], {
    name: 'AllStats_3',
    type: 'AllStats',
    typeValue: 6,
    value: { base: 3, perLevel: 0, string: '', string2: '' },
    eventType: 'None',
    eventTypeValue: 0,
    eventValue: '',
    conditionType: 'None',
    conditionTypeValue: 0,
    conditionValue: '',
    chance: 0,
    triggerType: 'None',
    triggerTypeValue: 0,
    target: 'Enemy',
    targetValue: 0
  })

  const mongoDocument = new BuildModel(response.json())
  await mongoDocument.validate()
  const mongoEquipment = mongoDocument.toObject().equipment[0]
  assert.equal(mongoEquipment.setId, 'Arcane')
  assert.deepEqual(mongoEquipment.set.equipmentIds, ['ArcaneChest', 'ArcaneFeet', 'ArcaneGloves', 'ArcaneLegs'])
  assert.equal(mongoEquipment.set.effects.length, 5)
  assert.equal('_id' in mongoEquipment.set, false)
  assert.equal('_id' in mongoEquipment.set.effects[0], false)
})

test('complete class-agnostic snapshot is enriched and survives POST then GET intact', async () => {
  const payload = richWizardPayload('snapshot-wizard-roundtrip')
  const created = await app.inject({ method: 'POST', url: '/api/builds', payload })
  assert.equal(created.statusCode, 201, JSON.stringify(created.json()))

  const detail = await app.inject({ method: 'GET', url: `/api/builds/${payload.slug}` })
  assert.equal(detail.statusCode, 200)
  const build = detail.json()

  assert.equal(build.snapshotVersion, 1)
  assert.deepEqual(build.character, payload.character)

  assert.deepEqual(build.skillTree.map((entry: JsonRecord) => ({
    id: entry.id,
    kind: entry.kind,
    level: entry.level,
    treeArchetype: entry.treeArchetype,
    treeArchetypeSource: entry.treeArchetypeSource
  })), payload.skillTree.map((entry: JsonRecord) => ({ ...entry, treeArchetypeSource: 'user-confirmed' })))
  assert.deepEqual(build.skillTree.map((entry: JsonRecord) => entry.name), ['Meteor', 'Codex Mastery'])
  assert.equal(build.skillTree[0].maxLevel, 10)
  assert.equal(build.skillTree[1].maxLevel, 10)
  assert.match(build.skillTree[0].icon, /^\/game-assets\/runtime-icons\/.+\.png$/)
  assert.match(build.skillTree[1].icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  assert.deepEqual(build.equipment.map((entry: JsonRecord) => ({
    id: entry.id,
    slotKey: entry.slotKey,
    refineLevel: entry.refineLevel,
    potential: entry.potential,
    actualAffixes: entry.actualAffixes
  })), payload.equipment.map(({ cards: _cards, ...entry }: JsonRecord) => entry))
  assert.deepEqual(build.equipment.map((entry: JsonRecord) => entry.id), ['Meteoric Staff', 'Meteoric Staff'])
  assert.deepEqual(build.equipment.map((entry: JsonRecord) => entry.slotKey), ['main-hand', 'off-hand'])
  assert.ok(build.equipment.every((entry: JsonRecord) => entry.name === 'Meteoric Staff'))
  assert.ok(build.equipment.every((entry: JsonRecord) => /^\/game-assets\/runtime-icons\/.+\.png$/.test(entry.icon)))
  assert.deepEqual(build.equipment.map((entry: JsonRecord) => entry.cards[0].equipClass), ['Weapon', 'Weapon'])
  assert.deepEqual(build.equipment.map((entry: JsonRecord) => entry.cards[0].name), ['Galaxian Brute Card', 'Galaxian Blaster Card'])
  assert.ok(build.equipment.every((entry: JsonRecord) => /^\/game-assets\/runtime-icons\/.+\.png$/.test(entry.cards[0].icon)))

  assert.deepEqual(build.artifacts.map((entry: JsonRecord) => ({
    slot: entry.slot,
    partIndex: entry.partIndex,
    id: entry.id,
    refineLevel: entry.refineLevel,
    actualAffixes: entry.actualAffixes
  })), payload.artifacts.map(({ gem: _gem, ...entry }: JsonRecord) => entry))
  assert.deepEqual(build.artifacts.map((entry: JsonRecord) => entry.name), Array(4).fill('Arcane Origin'))
  assert.ok(build.artifacts.every((entry: JsonRecord) => /^\/game-assets\/runtime-icons\/.+\.png$/.test(entry.partIcon)))
  assert.deepEqual(build.artifacts.map((entry: JsonRecord) => entry.gem.name), Array(4).fill('Meteor Gem'))
  assert.deepEqual(build.artifacts.map((entry: JsonRecord) => entry.gem.affix), Array(4).fill('Meteor'))
  assert.ok(build.artifacts.every((entry: JsonRecord) => /^\/game-assets\/runtime-icons\/.+\.png$/.test(entry.gem.icon)))

  assert.equal(build.grimoires[0].id, 'Mage_1')
  assert.equal(build.grimoires[0].slotIndex, 0)
  assert.equal(build.grimoires[0].name, 'Elementalist')
  assert.match(build.grimoires[0].icon, /^\/game-assets\/runtime-icons\/.+\.png$/)
  assert.equal(build.grimoires[0].passive.id, 'Mage_1')
  assert.equal(build.grimoires[0].passive.descriptionEn, 'Four attunements share one page, arguing until they become a single harmony.')
  assert.deepEqual(build.grimoires[0].passive.weaponTypes, [])
  assert.deepEqual(build.grimoires[0].passive.weaponTypeValues, [])
  assert.deepEqual(build.grimoires[0].passive.stanceTypes, [])
  assert.deepEqual(build.grimoires[0].passive.stanceTypeValues, [])
  assert.deepEqual(build.grimoires[0].passive.requirements, [])
  assert.equal(build.grimoires[0].passive.effects.length, 4)
  assert.deepEqual(build.grimoires[0].passive.effects[0], {
    name: 'StatusReplace_FireAttunement_ElementalAttunement',
    type: 'StatusReplace',
    typeValue: 210,
    value: { base: 0, perLevel: 0, string: 'FireAttunement', string2: 'ElementalAttunement' },
    eventType: 'None',
    eventTypeValue: 0,
    eventValue: '',
    conditionType: 'None',
    conditionTypeValue: 0,
    conditionValue: '',
    chance: 0,
    triggerType: 'None',
    triggerTypeValue: 0,
    target: 'Enemy',
    targetValue: 0
  })

  const mongoDocument = new BuildModel(build)
  await mongoDocument.validate()
  const mongoSnapshot = mongoDocument.toObject()
  assert.equal(mongoSnapshot.skillTree[0].id, 'Meteor')
  assert.equal(mongoSnapshot.artifacts[0].gem.id, 'Meteor Gem')
  assert.equal(mongoSnapshot.grimoires[0].id, 'Mage_1')
  assert.equal(mongoSnapshot.grimoires[0].passive.effects.length, 4)
  assert.equal('_id' in mongoSnapshot.skillTree[0], false)
  assert.equal('_id' in mongoSnapshot.equipment[0].cards[0], false)
  assert.equal('_id' in mongoSnapshot.artifacts[0], false)
  assert.equal('_id' in mongoSnapshot.grimoires[0], false)
  assert.equal('_id' in mongoSnapshot.grimoires[0].passive, false)
  assert.equal('_id' in mongoSnapshot.grimoires[0].passive.effects[0], false)
})

test('grimoire snapshots preserve verified weapon and stance restrictions', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: {
      ...legacyPayload('snapshot-grimoire-weapon-restriction'),
      archetype: 'Acolyte',
      skills: [{ id: 'HolyLight' }],
      equipment: [],
      snapshotVersion: 1,
      grimoires: [{ slotIndex: 0, id: 'Acolyte_2' }]
    }
  })
  assert.equal(response.statusCode, 201, JSON.stringify(response.json()))
  const passive = response.json().grimoires[0].passive
  assert.deepEqual(passive.weaponTypes, ['Mace'])
  assert.deepEqual(passive.weaponTypeValues, [5])
  assert.deepEqual(passive.stanceTypes, [])
  assert.deepEqual(passive.stanceTypeValues, [])
  assert.deepEqual(passive.requirements, [])

  const mongoDocument = new BuildModel(response.json())
  await mongoDocument.validate()
  assert.deepEqual(mongoDocument.toObject().grimoires[0].passive.weaponTypes, ['Mace'])
})

test('grimoire compatibility follows every class lineage instead of one featured character', async () => {
  const inherited = {
    ...legacyPayload('snapshot-shinobi-inherits-rogue'),
    title: 'Shinobi inherited grimoire',
    archetype: 'Shinobi',
    skills: [{ id: 'ShadowStep' }],
    equipment: [],
    snapshotVersion: 1,
    skillTree: [{ id: 'Rogue_5', kind: 'passive', level: 0, treeArchetype: 'Rogue' }],
    grimoires: [{ slotIndex: 0, id: 'Rogue_5' }]
  }
  const accepted = await app.inject({ method: 'POST', url: '/api/builds', payload: inherited })
  assert.equal(accepted.statusCode, 201, JSON.stringify(accepted.json()))
  assert.equal(accepted.json().grimoires[0].name, 'Hidden Strikes')
  assert.match(accepted.json().grimoires[0].icon, /^\/game-assets\/runtime-icons\/.+\.png$/)
  assert.equal(accepted.json().skillTree[0].maxLevel, 0)
  assert.match(accepted.json().skillTree[0].icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  await expectRejected({
    ...inherited,
    slug: 'snapshot-shinobi-rejects-mage',
    grimoires: [{ slotIndex: 0, id: 'Mage_1' }]
  }, 'GRIMOIRE_ARCHETYPE_MISMATCH')
})

test('snapshot schemas reject duplicate slots, mixed legacy slots and unreviewed OCR fields', async () => {
  const invalidCases: Array<[string, (payload: JsonRecord) => void]> = [
    ['duplicate-equipment-slot', payload => { payload.equipment[1] = { ...payload.equipment[1], id: 'Rod', slotKey: 'main-hand' } }],
    ['mixed-equipment-slots', payload => { delete payload.equipment[1].slotKey }],
    ['duplicate-legacy-equipment-id', payload => { payload.equipment = [{ id: 'Meteoric Staff' }, { id: 'meteoric-staff' }] }],
    ['duplicate-card-slot', payload => { payload.equipment[0].cards.push({ slotIndex: 0, id: 'Alien Pew Pew' }) }],
    ['duplicate-artifact-slot', payload => { payload.artifacts[1].slot = 'Rune' }],
    ['artifact-part-index-low', payload => { payload.artifacts[0].partIndex = -1 }],
    ['artifact-part-index-high', payload => { payload.artifacts[0].partIndex = 4 }],
    ['duplicate-grimoire-slot', payload => { payload.grimoires.push({ slotIndex: 0, id: 'Mage_2' }) }],
    ['invalid-stance', payload => { payload.character.stance = 'ShinobiOnly' }],
    ['invalid-stat-type', payload => { payload.character.stats[0].type = 'MadeUpStat' }],
    ['duplicate-character-stat', payload => { payload.character.stats.push({ type: 'Str', value: 99 }) }],
    ['duplicate-affix-stat-subject', payload => { payload.artifacts[0].actualAffixes[1].subjectId = 'Meteor' }],
    ['raw-image', payload => { payload.image = 'data:image/png;base64,not-reviewed' }],
    ['raw-ocr', payload => { payload.rawOcr = 'Meteoric Staff +6' }]
  ]

  for (const [name, mutate] of invalidCases) {
    const payload = richWizardPayload(`snapshot-invalid-${name}`)
    mutate(payload)
    await expectRejected(payload, 'VALIDATION_ERROR')
  }
})

test('verified equipment types enforce real loadout slot domains while slotless legacy input stays compatible', async () => {
  const accepted: Array<[string, string]> = [
    ['Amber Bow', 'accessory-left'],
    ['Amber Bow', 'accessory-right'],
    ['Arrowcatch Wall', 'off-hand'],
    ['Azure Crown', 'head'],
    ["Adventurer's Kit", 'back'],
    ['3D Glasses', 'eyewear'],
    ['ArcaneFeet', 'feet'],
    ['ArcaneChest', 'chest'],
    ['ArcaneLegs', 'legs'],
    ['Abyss Shard', 'main-hand'],
    ['Abyss Shard', 'off-hand']
  ]
  for (const [index, [id, slotKey]] of accepted.entries()) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/builds',
      payload: {
        ...legacyPayload(`snapshot-slot-accepted-${index}`),
        equipment: [{ id, slotKey }]
      }
    })
    assert.equal(response.statusCode, 201, `${id} -> ${slotKey}: ${JSON.stringify(response.json())}`)
  }

  const rejected: Array<[string, string]> = [
    ['Amber Bow', 'head'],
    ['Arrowcatch Wall', 'main-hand'],
    ['Azure Crown', 'back'],
    ["Adventurer's Kit", 'eyewear'],
    ['3D Glasses', 'head'],
    ['ArcaneFeet', 'legs'],
    ['ArcaneChest', 'feet'],
    ['ArcaneLegs', 'chest'],
    ['Abyss Shard', 'head']
  ]
  for (const [index, [id, slotKey]] of rejected.entries()) {
    await expectRejected({
      ...legacyPayload(`snapshot-slot-rejected-${index}`),
      equipment: [{ id, slotKey }]
    }, 'EQUIPMENT_SLOT_MISMATCH')
  }

  await expectRejected({
    ...legacyPayload('snapshot-grimoire-not-regular-equipment'),
    equipment: [{ id: 'Mage_1' }]
  }, 'GRIMOIRE_NOT_REGULAR_EQUIPMENT')
})

test('snapshot catalog references and game constraints return explicit domain codes', async () => {
  const invalidCases: Array<[string, string, (payload: JsonRecord) => void]> = [
    ['unknown-artifact', 'UNKNOWN_ARTIFACT', payload => { payload.artifacts[0].id = 'No Such Artifact' }],
    ['unknown-gem', 'UNKNOWN_GEM', payload => { payload.artifacts[0].gem.id = 'No Such Gem' }],
    ['unknown-card', 'UNKNOWN_CARD', payload => { payload.equipment[0].cards[0].id = 'No Such Card' }],
    ['card-class-mismatch', 'CARD_EQUIPMENT_CLASS_MISMATCH', payload => { payload.equipment[0].cards[0].id = 'Abomination' }],
    ['non-grimoire', 'UNKNOWN_GRIMOIRE', payload => { payload.grimoires[0].id = 'Meteor' }],
    ['unknown-grimoire', 'UNKNOWN_GRIMOIRE', payload => { payload.grimoires[0].id = 'No Such Grimoire' }],
    ['skill-kind-active-as-passive', 'SKILL_KIND_MISMATCH', payload => { payload.skillTree[0].kind = 'passive' }],
    ['skill-kind-passive-as-active', 'SKILL_KIND_MISMATCH', payload => { payload.skillTree[1].kind = 'active' }],
    ['unknown-active-skill', 'UNKNOWN_ACTIVE_SKILL', payload => { payload.skillTree[0].id = 'No Such Active Skill' }],
    ['unknown-passive-skill', 'UNKNOWN_PASSIVE_SKILL', payload => { payload.skillTree[1].id = 'No Such Passive Skill' }],
    ['fixed-passive-above-zero', 'SKILL_LEVEL_EXCEEDS_MAX', payload => {
      payload.skillTree[1] = { id: 'Mage_1', kind: 'passive', level: 1, treeArchetype: 'Mage' }
    }],
    ['skill-above-max-level', 'SKILL_LEVEL_EXCEEDS_MAX', payload => {
      payload.skillTree[0] = { id: 'ChainLightning', kind: 'active', level: 6, treeArchetype: 'Wizard' }
    }],
    ['skill-sibling-tree', 'SKILL_TREE_ARCHETYPE_MISMATCH', payload => { payload.skillTree[0].treeArchetype = 'Chronomancer' }],
    ['job-level-above-class-max', 'CHARACTER_JOB_LEVEL_EXCEEDS_MAX', payload => { payload.character.jobLevel = 71 }]
  ]

  for (const [name, code, mutate] of invalidCases) {
    const payload = richWizardPayload(`snapshot-invalid-domain-${name}`)
    mutate(payload)
    await expectRejected(payload, code)
  }
})
