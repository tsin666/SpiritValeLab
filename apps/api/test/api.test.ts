import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { buildApp } = await import('../src/app.js')
const app = await buildApp()
before(async () => app.ready())
after(async () => app.close())

test('health reports fallback services and catalog count', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/health' })
  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.equal(body.ok, true)
  assert.equal(body.services.mongo, false)
  assert.equal(body.localizedCatalogEntries, 7_218)
  assert.equal(body.equipmentEntries, 647)
  assert.equal(body.archetypeEntries, 31)
  assert.equal(body.archetypeSkillRelationEntries, 56)
  assert.equal(body.equipmentSetEntries, 24)
  assert.equal(body.substatPoolEntries, 9)
  assert.equal(body.skillEntries, 279)
  assert.equal(body.skillPassiveEntries, 111)
  assert.equal(body.artifactEntries, 45)
  assert.equal(body.gemEntries, 129)
  assert.equal(body.cardEntries, 327)
  assert.equal(body.monsterArchetypeEntries, 13)
  assert.equal(body.monsterEntries, 330)
  assert.equal(body.statusEntries, 185)
  assert.equal(body.weaponEntries, 23)
  assert.equal(body.runtimeCatalogCollections, 14)
  assert.equal(body.runtimeCatalogEntries, 2_209)
  assert.equal(body.runtimeSpriteEntries, 1_179)
})

test('build list starts without synthetic demo builds and accepts filters', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/builds?archetype=paladin&q=Paladin' })
  assert.equal(response.statusCode, 200)
  const body = response.json()
  assert.deepEqual(body, [])
})

test('unknown build returns structured 404', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/builds/does-not-exist' })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().code, 'BUILD_NOT_FOUND')
})

test('catalog paginates and rejects invalid input', async () => {
  const ok = await app.inject({ method: 'GET', url: '/api/catalog/skills?limit=2&offset=1' })
  assert.equal(ok.statusCode, 200)
  assert.equal(ok.json().items.length, 2)
  assert.equal(ok.json().limit, 2)

  const invalid = await app.inject({ method: 'GET', url: '/api/catalog/skills?limit=0' })
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.json().code, 'VALIDATION_ERROR')

  const detail = await app.inject({ method: 'GET', url: '/api/catalog/skills/meteor' })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().id, 'Meteor')
  assert.equal(detail.json().catalogKind, 'skills')

  const missing = await app.inject({ method: 'GET', url: '/api/catalog/gems/does-not-exist' })
  assert.equal(missing.statusCode, 404)
  assert.equal(missing.json().code, 'CATALOG_ENTRY_NOT_FOUND')
})

test('runtime catalog exposes all 14 source collections with stable list and detail identities', async () => {
  const kinds: Record<string, number> = {
    equips: 647,
    'equipment-sets': 24,
    'substat-pools': 9,
    archetypes: 31,
    'archetype-skill-relations': 56,
    skills: 279,
    skillPassives: 111,
    artifacts: 45,
    gems: 129,
    cards: 327,
    'monster-archetypes': 13,
    monsters: 330,
    statuses: 185,
    weapons: 23
  }

  for (const [kind, total] of Object.entries(kinds)) {
    const list = await app.inject({ method: 'GET', url: `/api/catalog/${kind}?limit=1` })
    assert.equal(list.statusCode, 200, kind)
    assert.equal(list.json().total, total, kind)
    const item = list.json().items[0]
    assert.equal(typeof item.id, 'string', `${kind} id`)
    assert.ok(item.id, `${kind} id`)
    assert.equal(typeof item.slug, 'string', `${kind} slug`)
    assert.ok(item.slug, `${kind} slug`)

    const detail = await app.inject({ method: 'GET', url: `/api/catalog/${kind}/${item.slug}` })
    assert.equal(detail.statusCode, 200, `${kind} detail`)
    assert.equal(detail.json().id, item.id, `${kind} detail id`)
  }

  const set = await app.inject({ method: 'GET', url: '/api/catalog/equipment-sets/arcane' })
  assert.equal(set.json().memberCount, 4)
  assert.ok(set.json().fullSet.length > 0)

  const pool = await app.inject({ method: 'GET', url: '/api/catalog/substat-pools/accessory' })
  assert.ok(pool.json().groups.length > 0)

  const relation = await app.inject({ method: 'GET', url: '/api/catalog/archetype-skill-relations/acolyte-barrier' })
  assert.equal(relation.json().archetypeId, 'Acolyte')
  assert.equal(relation.json().skillId, 'Barrier')

  const monsterArchetype = await app.inject({ method: 'GET', url: '/api/catalog/monster-archetypes/defender' })
  assert.equal(monsterArchetype.json().id, 'Defender')
  assert.equal(monsterArchetype.json().attributes.def, 5)

  const weapon = await app.inject({ method: 'GET', url: '/api/catalog/weapons/axe' })
  assert.equal(weapon.json().id, 'Axe')
  assert.equal(typeof weapon.json().attackDelay, 'number')
})

test('runtime catalog exposes real skill, artifact, gem, card, monster and status attributes', async () => {
  const skill = await app.inject({ method: 'GET', url: '/api/catalog/skills/aegis' })
  assert.equal(skill.statusCode, 200)
  assert.equal(skill.json().runtime, true)
  assert.equal(skill.json().maxLevel, 5)
  assert.equal(skill.json().scaledValues.cooldown.base, 80)
  assert.ok(skill.json().requirements.some((entry: any) => entry.skillId === 'HolyShield'))
  assert.match(skill.json().icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const passive = await app.inject({ method: 'GET', url: '/api/catalog/skillPassives/acolyte-1' })
  assert.equal(passive.statusCode, 200)
  assert.ok(passive.json().stats.length > 0)

  const artifact = await app.inject({ method: 'GET', url: '/api/catalog/artifacts/acolyte' })
  assert.equal(artifact.statusCode, 200)
  assert.equal(artifact.json().parts.length, 4)
  assert.ok(artifact.json().stats.length > 0)

  const gem = await app.inject({ method: 'GET', url: '/api/catalog/gems/aerialshot-gem' })
  assert.equal(gem.statusCode, 200)
  assert.equal(gem.json().stats[0].type, 'SkillDamage')

  const card = await app.inject({ method: 'GET', url: '/api/catalog/cards/abomination' })
  assert.equal(card.statusCode, 200)
  assert.equal(card.json().equipClass, 'Chest')
  assert.ok(card.json().stats.length > 0)

  const monster = await app.inject({ method: 'GET', url: '/api/catalog/monsters/abomination' })
  assert.equal(monster.statusCode, 200)
  assert.equal(monster.json().archetypeId, 'Defender')
  assert.equal(monster.json().archetype.id, 'Defender')
  assert.equal(monster.json().archetype.attributes.def, 5)
  assert.ok(monster.json().skills.length > 0)
  assert.ok(monster.json().drops.equipment.some((entry: any) => entry.id === 'BerserkFeet'))

  const status = await app.inject({ method: 'GET', url: '/api/catalog/statuses/aegis' })
  assert.equal(status.statusCode, 200)
  assert.equal(status.json().fixedDuration, true)
  assert.equal(status.json().stats[0].type, 'FinalDamageReduction')
})

test('equipment library paginates, exposes combinable facets and links matching builds', async () => {
  const list = await app.inject({ method: 'GET', url: '/api/equipment?page=1&pageSize=12&category=offhand' })
  assert.equal(list.statusCode, 200)
  const body = list.json()
  assert.equal(body.page, 1)
  assert.equal(body.pageSize, 12)
  assert.ok(body.total > 0)
  assert.ok(Array.isArray(body.facets.categories))
  assert.ok(Array.isArray(body.facets.slots))
  assert.ok(body.items.every((item: any) => item.category === 'offhand'))
  assert.ok(Array.isArray(body.items[0].stats))
  assert.ok(Array.isArray(body.items[0].affixes))
  assert.ok(Array.isArray(body.items[0].availableAffixes))

  const detail = await app.inject({ method: 'GET', url: '/api/equipment/holy-shield' })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().id, 'Holy Shield')
  assert.deepEqual(detail.json().relatedBuilds, [])

  const invalid = await app.inject({ method: 'GET', url: '/api/equipment?page=0&unknown=yes' })
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.json().code, 'VALIDATION_ERROR')
})

test('equipment full-text and enriched filters include affixes, archetypes, slots and sets', async () => {
  const enrichedApp = await buildApp({
    equipmentRecords: [
      {
        id: 'Mage_Relic',
        slug: 'mage-relic',
        name: { zh: '风暴遗物', en: 'Storm Relic' },
        description: { zh: '一件测试装备。', en: 'An enriched test item.' },
        slots: ['off-hand'],
        type: 'focus',
        element: 'Wind',
        levelRequired: 12,
        allowedArchetypes: ['Mage'],
        setId: 'tempest-set',
        set: { id: 'tempest-set', name: { zh: '风暴套装', en: 'Tempest Set' } },
        stats: [{ key: 'focus', value: 4 }],
        affixes: [{ id: 'stormcall', name: { en: 'Stormcall' } }],
        setBonuses: [{ pieces: 2, description: { en: 'Test bonus' } }]
      },
      { id: 'Plain Sword', slug: 'plain-sword', name: { en: 'Plain Sword' }, description: { en: 'Simple blade' } }
    ]
  })
  await enrichedApp.ready()
  try {
    const search = await enrichedApp.inject({ method: 'GET', url: '/api/equipment?q=Stormcall' })
    assert.equal(search.statusCode, 200)
    assert.equal(search.json().total, 1)
    assert.equal(search.json().items[0].slug, 'mage-relic')

    const filtered = await enrichedApp.inject({
      method: 'GET',
      url: '/api/equipment?archetype=mage&slot=off-hand&type=focus&element=wind&level=12&setId=tempest-set'
    })
    assert.equal(filtered.statusCode, 200)
    assert.equal(filtered.json().total, 1)
    assert.equal(filtered.json().items[0].stats[0].value, 4)
    assert.equal(filtered.json().facets.sets[0].value, 'tempest-set')
  } finally {
    await enrichedApp.close()
  }
})

test('runtime equipment exposes verified stats, candidate affix pools, type-derived slots and complete sets', async () => {
  const affixSearch = await app.inject({ method: 'GET', url: '/api/equipment?q=Crit_10&pageSize=10' })
  assert.equal(affixSearch.statusCode, 200)
  assert.ok(affixSearch.json().total > 0)
  assert.ok(affixSearch.json().items.some((item: any) => item.availableAffixes.some((affix: any) => affix.name === 'Crit_10')))

  const detail = await app.inject({ method: 'GET', url: '/api/equipment/abyss-shard' })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().id, 'Abyss Shard')
  assert.equal(detail.json().type, 'dagger')
  assert.equal(detail.json().slot, 'main-hand')
  assert.equal(detail.json().fieldSources.slot, 'type-derived')
  assert.equal(detail.json().runtimeSlots, 2)
  assert.ok(detail.json().stats.length > 0)
  assert.deepEqual(detail.json().affixes, [])
  assert.ok(detail.json().availableAffixes.some((affix: any) => affix.type === 'Crit'))
  assert.equal(detail.json().fieldSources.availableAffixes, 'pool-derived')
  assert.match(detail.json().icon, /^\/game-assets\/runtime-icons\/.+\.png$/)

  const set = await app.inject({ method: 'GET', url: '/api/equipment?setId=Arcane&pageSize=10' })
  assert.equal(set.statusCode, 200)
  assert.equal(set.json().total, 4)
  assert.ok(set.json().items.every((item: any) => item.set?.id === 'Arcane'))
  assert.ok(set.json().items.every((item: any) => item.setBonuses.length > 0))
  assert.equal(set.json().items[0].set.memberCount, 4)
})

test('archetype library supports roles and returns linked skills and builds', async () => {
  const list = await app.inject({ method: 'GET', url: '/api/archetypes?role=magic&pageSize=10' })
  assert.equal(list.statusCode, 200)
  assert.ok(list.json().items.some((item: any) => item.slug === 'wizard'))
  assert.ok(list.json().items.every((item: any) => item.role === 'magic'))
  assert.ok(list.json().facets.roles.length > 1)
  assert.ok(list.json().facets.stages.some((facet: any) => facet.value === 'advanced' && facet.count === 16))

  const advanced = await app.inject({ method: 'GET', url: '/api/archetypes?stage=advanced&pageSize=40' })
  assert.equal(advanced.statusCode, 200)
  assert.equal(advanced.json().total, 16)
  assert.ok(advanced.json().items.every((item: any) => item.stage === 'advanced' && item.requiredClassId))

  const detail = await app.inject({ method: 'GET', url: '/api/archetypes/wizard' })
  assert.equal(detail.statusCode, 200)
  assert.equal('skills' in detail.json(), false)
  assert.deepEqual(detail.json().previewSkills.map((skill: any) => skill.id), ['Meteor', 'FreezingField', 'ChainLightning', 'TetraVortex'])
  assert.deepEqual(detail.json().buildReferencedSkills, [])
  assert.equal(detail.json().previewSkills.some((skill: any) => skill.id === 'MeteorStorm'), false)
  assert.deepEqual(detail.json().relatedBuilds, [])
  assert.equal(detail.json().stage, 'advanced')
  assert.equal(detail.json().requiredClassId, 'Mage')
  assert.equal(detail.json().requiredClass.id, 'Mage')
  assert.deepEqual(detail.json().advancesTo, [])
  assert.equal(detail.json().lineageSource.method, 'Formula.GetRequiredClass')

  const acolyte = await app.inject({ method: 'GET', url: '/api/archetypes/acolyte' })
  assert.equal(acolyte.statusCode, 200)
  assert.equal(acolyte.json().maxJobLevel, 50)
  assert.match(acolyte.json().icon, /^\/game-assets\/runtime-icons\/.+\.png$/)
  assert.deepEqual(acolyte.json().previewSkills.map((skill: any) => skill.id), ['HolyLight', 'Blessing', 'Barrier', 'Grace'])
  assert.deepEqual(acolyte.json().buildReferencedSkills, [])
  assert.ok(acolyte.json().equipment.some((item: any) => item.id === 'Acolyte_1'))
  assert.equal(acolyte.json().stage, 'base')
  assert.deepEqual(acolyte.json().advancesTo.map((item: any) => item.id), ['Priest', 'Monk', 'Warlock'])

  const warrior = await app.inject({ method: 'GET', url: '/api/archetypes/warrior' })
  assert.equal(warrior.statusCode, 200)
  assert.deepEqual(warrior.json().advancementOptions.map((item: any) => [item.id, item.configPresent]), [
    ['Berserker', true],
    ['BladeMaster', false],
    ['Mechanist', false]
  ])

  const professions = await app.inject({ method: 'GET', url: '/api/archetypes?stage=profession&pageSize=40' })
  assert.equal(professions.statusCode, 200)
  assert.equal(professions.json().total, 7)
  assert.ok(professions.json().items.every((item: any) => item.role === 'profession'))
  const artificer = professions.json().items.find((item: any) => item.id === 'Artificer')
  assert.equal(artificer.icon, null)
  assert.match(artificer.fallbackIcon, /^\/game-assets\/runtime-icons\/.+\.png$/)
  assert.equal(artificer.fallbackIconBasis, 'npc-config-same-id')
  assert.equal(artificer.fallbackIconSource.configClass, 'NpcConfig')
  assert.equal(artificer.fallbackIconSource.configId, 'Artificer')
  assert.equal(artificer.fallbackIconSource.configSourcePathId, 83754)
  assert.equal(artificer.fallbackIconSource.sourcePathId, 9669)
  const cardweaver = professions.json().items.find((item: any) => item.id === 'Cardweaver')
  assert.equal(cardweaver.icon, null)
  assert.equal(cardweaver.fallbackIcon, null)
  assert.equal(cardweaver.fallbackIconBasis, null)

  const invalidStage = await app.inject({ method: 'GET', url: '/api/archetypes?stage=made-up' })
  assert.equal(invalidStage.statusCode, 400)
})

test('builder options are compact and a user build publishes into fallback search immediately', async () => {
  const options = await app.inject({ method: 'GET', url: '/api/builder/options' })
  assert.equal(options.statusCode, 200)
  assert.ok(options.json().archetypes.length > 20)
  assert.ok(options.json().skills.some((skill: any) => skill.id === 'Meteor'))
  assert.ok(options.json().skills.find((skill: any) => skill.id === 'Meteor').recommendedArchetypes.includes('Wizard'))
  assert.ok(options.json().equipment.some((item: any) => item.id === 'Meteoric Staff'))

  const payload = {
    slug: 'community-meteor-test',
    title: '社区陨星测试构筑',
    archetype: 'wizard',
    difficulty: '进阶',
    summary: '用于验证本地用户构筑发布、检索与详情读取。',
    guide: ['先聚怪，再释放陨星。'],
    tags: ['社区', '陨星'],
    skills: [{ id: 'Meteor' }],
    equipment: [{ id: 'meteoric-staff', slot: '主手' }],
    createdBy: 'api-test'
  }
  const created = await app.inject({ method: 'POST', url: '/api/builds', payload })
  assert.equal(created.statusCode, 201)
  assert.equal(created.json().source, 'user')
  assert.equal(created.json().userGenerated, true)
  assert.equal(created.json().tier, 'Community')
  assert.equal(created.json().skills[0].name, 'Meteor')
  assert.equal(created.json().skills[0].slug, 'meteor')
  assert.equal(created.json().equipment[0].slug, 'meteoric-staff')

  const search = await app.inject({ method: 'GET', url: '/api/builds?q=社区陨星' })
  assert.equal(search.statusCode, 200)
  assert.ok(search.json().some((build: any) => build.slug === payload.slug))

  const detail = await app.inject({ method: 'GET', url: `/api/builds/${payload.slug}` })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().createdBy, 'api-test')
  assert.equal('likedBy' in detail.json(), false)
  assert.equal('viewedBy' in detail.json(), false)

  const visitorOne = { visitorId: '00000000-0000-4000-8000-000000000001' }
  const visitorTwo = { visitorId: '00000000-0000-4000-8000-000000000002' }
  const firstView = await app.inject({ method: 'POST', url: `/api/builds/${payload.slug}/view`, payload: visitorOne })
  assert.equal(firstView.statusCode, 200)
  assert.equal(firstView.json().views, 1)
  const duplicateView = await app.inject({ method: 'POST', url: `/api/builds/${payload.slug}/view`, payload: visitorOne })
  assert.equal(duplicateView.json().views, 1)
  const liked = await app.inject({ method: 'POST', url: `/api/builds/${payload.slug}/like`, payload: visitorOne })
  assert.equal(liked.statusCode, 200)
  assert.equal(liked.json().likes, 1)
  assert.equal(liked.json().liked, true)

  const secondPayload = { ...payload, slug: 'community-meteor-second', title: '第二套真实互动测试构筑' }
  const secondCreated = await app.inject({ method: 'POST', url: '/api/builds', payload: secondPayload })
  assert.equal(secondCreated.statusCode, 201)
  await app.inject({ method: 'POST', url: `/api/builds/${secondPayload.slug}/view`, payload: visitorOne })
  await app.inject({ method: 'POST', url: `/api/builds/${secondPayload.slug}/view`, payload: visitorTwo })

  const ranked = await app.inject({ method: 'GET', url: '/api/builds?sort=rank' })
  assert.equal(ranked.statusCode, 200)
  assert.equal(ranked.json()[0].slug, payload.slug)
  assert.equal(ranked.json()[0].rankScore, 6)
  assert.equal('likedBy' in ranked.json()[0], false)
  const mostViewed = await app.inject({ method: 'GET', url: '/api/builds?sort=views' })
  assert.equal(mostViewed.json()[0].slug, secondPayload.slug)

  const unliked = await app.inject({ method: 'POST', url: `/api/builds/${payload.slug}/like`, payload: visitorOne })
  assert.equal(unliked.json().likes, 0)
  assert.equal(unliked.json().liked, false)
  const invalidVisitor = await app.inject({ method: 'POST', url: `/api/builds/${payload.slug}/view`, payload: { visitorId: 'not-a-uuid' } })
  assert.equal(invalidVisitor.statusCode, 400)

  const duplicate = await app.inject({ method: 'POST', url: '/api/builds', payload })
  assert.equal(duplicate.statusCode, 409)
  assert.equal(duplicate.json().code, 'BUILD_SLUG_EXISTS')

  const invalid = await app.inject({ method: 'POST', url: '/api/builds', payload: { ...payload, extra: true } })
  assert.equal(invalid.statusCode, 400)
  assert.equal(invalid.json().code, 'VALIDATION_ERROR')

  const incompatible = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload, slug: 'incompatible-build-test', equipment: [{ id: 'Acolyte_1' }] }
  })
  assert.equal(incompatible.statusCode, 400)
  assert.equal(incompatible.json().code, 'EQUIPMENT_ARCHETYPE_MISMATCH')

  const duplicateSkill = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload, slug: 'duplicate-skill-test', skills: [{ id: 'Meteor' }, { id: 'meteor' }] }
  })
  assert.equal(duplicateSkill.statusCode, 400)
  assert.equal(duplicateSkill.json().code, 'VALIDATION_ERROR')
  assert.equal(duplicateSkill.json().details[0].message, 'Duplicate skill selection')

  const duplicateEquipment = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload, slug: 'duplicate-equipment-test', equipment: [{ id: 'Meteoric Staff' }, { id: 'meteoric-staff' }] }
  })
  assert.equal(duplicateEquipment.statusCode, 400)
  assert.equal(duplicateEquipment.json().code, 'VALIDATION_ERROR')
  assert.equal(duplicateEquipment.json().details[0].message, 'Duplicate equipment selection')
})

test('unknown route returns structured 404', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/nope' })
  assert.equal(response.statusCode, 404)
  assert.equal(response.json().code, 'NOT_FOUND')
})
