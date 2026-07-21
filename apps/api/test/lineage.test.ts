import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { archetypeLineageIds, inheritsArchetype } = await import('../src/archetypes.js')
const { buildApp } = await import('../src/app.js')

test('advancement lineage is canonical, directional and limited to combat classes', () => {
  assert.deepEqual(archetypeLineageIds('Shinobi'), ['Shinobi', 'Rogue'])
  assert.deepEqual(archetypeLineageIds('wizard'), ['wizard', 'Mage'])
  assert.deepEqual(archetypeLineageIds('Chronomancer'), ['Chronomancer', 'Mage'])
  assert.deepEqual(archetypeLineageIds('Merchant'), ['Merchant'])
  assert.deepEqual(archetypeLineageIds('Weaver'), ['Weaver'])
  assert.deepEqual(archetypeLineageIds('Unknown Class'), ['Unknown Class'])

  assert.equal(inheritsArchetype('Shinobi', 'Rogue'), true)
  assert.equal(inheritsArchetype('Shinobi', 'Shinobi'), true)
  assert.equal(inheritsArchetype('Rogue', 'Shinobi'), false)
  assert.equal(inheritsArchetype('Shinobi', 'Assassin'), false)
  assert.equal(inheritsArchetype('Wizard', 'Mage'), true)
  assert.equal(inheritsArchetype('Chronomancer', 'Mage'), true)
  assert.equal(inheritsArchetype('Mage', 'Wizard'), false)
  assert.equal(inheritsArchetype('Wizard', 'Chronomancer'), false)
})

test('equipment compatibility, class detail and build validation follow advancement lineage', async () => {
  const lineageApp = await buildApp({
    archetypeRecords: [
      'Rogue', 'Shinobi', 'Assassin', 'Mage', 'Wizard', 'Chronomancer'
    ].map(id => ({ id, slug: id.toLowerCase(), name: { en: id } })),
    skillRecords: [
      { id: 'Practice', slug: 'practice', name: { en: 'Practice' }, description: { en: 'Test skill' } },
      { id: 'ShadowStep', slug: 'shadowstep', name: { en: 'Shadow Step' }, allowedArchetypes: ['Rogue'] },
      { id: 'Assassin Practice', slug: 'assassin-practice', name: { en: 'Assassin Practice' }, allowedArchetypes: ['Assassin'] }
    ],
    equipmentRecords: [
      { id: 'Rogue Dagger', slug: 'rogue-dagger', name: { en: 'Rogue Dagger' }, allowedArchetypes: ['Rogue'] },
      { id: 'Shinobi Kunai', slug: 'shinobi-kunai', name: { en: 'Shinobi Kunai' }, allowedArchetypes: ['Shinobi'] },
      { id: 'Assassin Dagger', slug: 'assassin-dagger', name: { en: 'Assassin Dagger' }, allowedArchetypes: ['Assassin'] },
      { id: 'Mage Tome', slug: 'mage-tome', name: { en: 'Mage Tome' }, allowedArchetypes: ['Mage'] },
      { id: 'Wizard Tome', slug: 'wizard-tome', name: { en: 'Wizard Tome' }, allowedArchetypes: ['Wizard'] },
      { id: 'Chronomancer Tome', slug: 'chronomancer-tome', name: { en: 'Chronomancer Tome' }, allowedArchetypes: ['Chronomancer'] },
      { id: 'Travel Cloak', slug: 'travel-cloak', name: { en: 'Travel Cloak' } }
    ]
  })
  await lineageApp.ready()

  const names = (response: { json: () => { items: Array<{ slug: string }> } }) => response.json().items.map(item => item.slug).sort()
  const buildPayload = (slug: string, archetype: string, equipment: string, skill = 'Practice') => ({
    slug,
    title: `${archetype} lineage test`,
    archetype,
    difficulty: '入门',
    summary: 'Verifies advancement equipment compatibility.',
    skills: [{ id: skill }],
    equipment: [{ id: equipment }]
  })

  try {
    const shinobiStrict = await lineageApp.inject({ method: 'GET', url: '/api/equipment?archetype=shinobi' })
    assert.equal(shinobiStrict.statusCode, 200)
    assert.deepEqual(names(shinobiStrict), ['shinobi-kunai'])

    const shinobiCompatible = await lineageApp.inject({ method: 'GET', url: '/api/equipment?archetype=shinobi&compatible=true' })
    assert.equal(shinobiCompatible.statusCode, 200)
    assert.deepEqual(names(shinobiCompatible), ['rogue-dagger', 'shinobi-kunai', 'travel-cloak'])

    const wizardCompatible = await lineageApp.inject({ method: 'GET', url: '/api/equipment?archetype=wizard&compatible=true' })
    assert.deepEqual(names(wizardCompatible), ['mage-tome', 'travel-cloak', 'wizard-tome'])
    const chronomancerCompatible = await lineageApp.inject({ method: 'GET', url: '/api/equipment?archetype=chronomancer&compatible=true' })
    assert.deepEqual(names(chronomancerCompatible), ['chronomancer-tome', 'mage-tome', 'travel-cloak'])

    const shinobiDetail = await lineageApp.inject({ method: 'GET', url: '/api/archetypes/shinobi' })
    assert.equal(shinobiDetail.statusCode, 200)
    assert.deepEqual(shinobiDetail.json().equipment.map((item: { slug: string }) => item.slug).sort(), ['rogue-dagger', 'shinobi-kunai'])
    const wizardDetail = await lineageApp.inject({ method: 'GET', url: '/api/archetypes/wizard' })
    assert.deepEqual(wizardDetail.json().equipment.map((item: { slug: string }) => item.slug).sort(), ['mage-tome', 'wizard-tome'])

    const shinobiBase = await lineageApp.inject({ method: 'POST', url: '/api/builds', payload: buildPayload('lineage-shinobi-base', 'Shinobi', 'Rogue Dagger') })
    assert.equal(shinobiBase.statusCode, 201)
    const wizardBase = await lineageApp.inject({ method: 'POST', url: '/api/builds', payload: buildPayload('lineage-wizard-base', 'Wizard', 'Mage Tome') })
    assert.equal(wizardBase.statusCode, 201)
    const chronomancerBase = await lineageApp.inject({ method: 'POST', url: '/api/builds', payload: buildPayload('lineage-chronomancer-base', 'Chronomancer', 'Mage Tome') })
    assert.equal(chronomancerBase.statusCode, 201)

    const shinobiBaseSkill = await lineageApp.inject({
      method: 'POST',
      url: '/api/builds',
      payload: buildPayload('lineage-shinobi-base-skill', 'Shinobi', 'Rogue Dagger', 'ShadowStep')
    })
    assert.equal(shinobiBaseSkill.statusCode, 201)
    assert.equal(shinobiBaseSkill.json().skills[0].id, 'ShadowStep')

    const reverse = await lineageApp.inject({ method: 'POST', url: '/api/builds', payload: buildPayload('lineage-rogue-reverse', 'Rogue', 'Shinobi Kunai') })
    assert.equal(reverse.statusCode, 400)
    assert.equal(reverse.json().code, 'EQUIPMENT_ARCHETYPE_MISMATCH')
    const sibling = await lineageApp.inject({ method: 'POST', url: '/api/builds', payload: buildPayload('lineage-shinobi-sibling', 'Shinobi', 'Assassin Dagger') })
    assert.equal(sibling.statusCode, 400)
    assert.equal(sibling.json().code, 'EQUIPMENT_ARCHETYPE_MISMATCH')
    const siblingSkill = await lineageApp.inject({
      method: 'POST',
      url: '/api/builds',
      payload: buildPayload('lineage-shinobi-sibling-skill', 'Shinobi', 'Rogue Dagger', 'Assassin Practice')
    })
    assert.equal(siblingSkill.statusCode, 400)
    assert.equal(siblingSkill.json().code, 'SKILL_ARCHETYPE_MISMATCH')
    const mageReverse = await lineageApp.inject({ method: 'POST', url: '/api/builds', payload: buildPayload('lineage-mage-reverse', 'Mage', 'Wizard Tome') })
    assert.equal(mageReverse.statusCode, 400)
    assert.equal(mageReverse.json().code, 'EQUIPMENT_ARCHETYPE_MISMATCH')
  } finally {
    await lineageApp.close()
  }
})
