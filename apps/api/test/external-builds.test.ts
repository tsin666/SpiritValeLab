import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { BuildModel } = await import('../src/models/build.js')
const {
  createBuild,
  getBuild,
  listBuilds,
  registerBuildView,
  toggleBuildLike,
  upsertExternalBuild
} = await import('../src/services.js')
const { buildApp } = await import('../src/app.js')

const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const importedAt = '2026-07-24T01:00:00.000Z'

function externalPayload(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'external-provenance-test',
    title: '外部构筑',
    archetype: 'Shinobi',
    difficulty: '进阶',
    role: 'DPS',
    buildType: 'Melee',
    buildFor: 'PvE',
    buildOrientation: 'Solo',
    summary: '经过审核的中文摘要。',
    active: true,
    provenance: {
      site: 'spirit-vale-builder.base44.app',
      sourceId: 'external-provenance-source',
      sourceUrl: 'https://spirit-vale-builder.base44.app/BuildDetail?id=external-provenance-source',
      author: 'Public Author',
      originalLanguage: 'en',
      originalTitle: 'External build',
      originalSummary: 'Original public description.',
      sourceCreatedAt: '2026-07-20T01:00:00.000Z',
      sourceUpdatedAt: '2026-07-23T01:00:00.000Z',
      firstImportedAt: importedAt,
      lastFetchedAt: importedAt,
      contentHash: hashA,
      translation: {
        targetLanguage: 'zh-CN',
        status: 'reviewed',
        method: 'machine-assisted',
        updatedAt: importedAt,
        sourceHash: hashA
      }
    },
    sourceMetrics: {
      likes: 8,
      views: 12,
      comments: 2,
      fetchedAt: importedAt
    },
    ...overrides
  }
}

test('external build model has strict source audit fields and a partial source identity index', async () => {
  const document = new BuildModel({
    ...externalPayload(),
    source: 'external',
    userGenerated: false,
    guideHtmlEn: '<script>unsafe()</script><p>English guide</p>',
    skillTree: [{
      kind: 'active',
      id: 'external-skill',
      level: 1,
      maxLevel: 5,
      treeArchetype: 'Shinobi',
      treeArchetypeSource: 'external-source'
    }]
  })
  await document.validate()
  const value = document.toObject()

  assert.equal(value.source, 'external')
  assert.equal(value.userGenerated, false)
  assert.equal(value.role, 'DPS')
  assert.equal(value.buildType, 'Melee')
  assert.equal(value.buildFor, 'PvE')
  assert.equal(value.buildOrientation, 'Solo')
  assert.equal(value.skillTree[0].treeArchetypeSource, 'external-source')
  assert.doesNotMatch(value.guideHtmlEn, /<script/i)
  assert.match(value.guideHtmlEn, /English guide/)
  assert.equal(BuildModel.schema.path('provenance.contentHash')?.options.select, false)
  assert.equal(BuildModel.schema.path('provenance.translation.sourceHash')?.options.select, false)

  const sourceIndex = BuildModel.schema.indexes().find(([, options]: any) =>
    options.name === 'unique_external_build_source'
  )
  assert.ok(sourceIndex)
  assert.deepEqual(sourceIndex[0], { 'provenance.site': 1, 'provenance.sourceId': 1 })
  assert.equal(sourceIndex[1].unique, true)
  assert.equal(sourceIndex[1].partialFilterExpression.source, 'external')
  assert.equal((BuildModel.schema.path('provenance') as any).schema.options.strict, 'throw')
  assert.equal((BuildModel.schema.path('provenance.translation') as any).schema.options.strict, 'throw')
  assert.equal((BuildModel.schema.path('sourceMetrics') as any).schema.options.strict, 'throw')
})

test('model invariants reject forged, unpublished, stale and malformed source records', async () => {
  const invalidDocuments = [
    new BuildModel({ ...externalPayload(), source: 'external', userGenerated: true }),
    new BuildModel({
      ...externalPayload(),
      source: 'external',
      userGenerated: false,
      provenance: undefined
    }),
    new BuildModel({
      ...externalPayload(),
      source: 'external',
      userGenerated: false,
      provenance: {
        ...(externalPayload().provenance as Record<string, unknown>),
        translation: {
          targetLanguage: 'zh-CN',
          status: 'pending'
        }
      }
    }),
    new BuildModel({
      ...externalPayload(),
      source: 'external',
      userGenerated: false,
      provenance: {
        ...(externalPayload().provenance as Record<string, unknown>),
        translation: {
          targetLanguage: 'zh-CN',
          status: 'reviewed',
          sourceHash: hashB
        }
      }
    }),
    new BuildModel({
      ...externalPayload(),
      source: 'user',
      userGenerated: true
    }),
    new BuildModel({
      ...externalPayload({
        sourceMetrics: { likes: 1.5, fetchedAt: importedAt }
      }),
      source: 'external',
      userGenerated: false
    }),
    new BuildModel({
      ...externalPayload(),
      source: 'external',
      userGenerated: false,
      guideHtmlEn: `<p>${'x'.repeat(10_001)}</p>`
    }),
    new BuildModel({
      ...externalPayload(),
      source: 'external',
      userGenerated: false,
      provenance: {
        ...(externalPayload().provenance as Record<string, unknown>),
        unsupportedAuditField: true,
        translation: {
          ...((externalPayload().provenance as any).translation),
          unsupportedTranslationField: true
        }
      }
    })
  ]

  for (const document of invalidDocuments) {
    await assert.rejects(() => document.validate())
  }
})

test('public build creation cannot forge source identity, source metrics or native engagement', async () => {
  const payload = externalPayload({
    slug: 'user-cannot-forge-external-source',
    source: 'external',
    userGenerated: false,
    views: 9_999,
    likes: 8_888,
    viewedBy: ['raw-visitor'],
    likedBy: ['raw-liker']
  })
  const created = await createBuild(payload)

  assert.equal(created.source, 'user')
  assert.equal(created.userGenerated, true)
  assert.equal(created.views, 0)
  assert.equal(created.likes, 0)
  assert.equal(created.tier, 'Community')
  assert.equal('provenance' in created, false)
  assert.equal('sourceMetrics' in created, false)
  assert.equal('viewedBy' in created, false)
  assert.equal('likedBy' in created, false)
})

test('external upsert is source-idempotent and preserves native likes and views across source updates', async () => {
  const sourceId = 'external-upsert-interaction-isolation'
  const first = externalPayload({
    slug: 'external-upsert-interaction-isolation',
    provenance: {
      ...(externalPayload().provenance as Record<string, unknown>),
      sourceId,
      sourceUrl: `https://spirit-vale-builder.base44.app/BuildDetail?id=${sourceId}`
    }
  })
  const created = await upsertExternalBuild(first as any)

  assert.equal(created.source, 'external')
  assert.equal(created.userGenerated, false)
  assert.equal(created.views, 0)
  assert.equal(created.likes, 0)
  assert.equal(created.sourceMetrics.views, 12)
  assert.equal(created.sourceMetrics.likes, 8)
  assert.equal(created.provenance.sourceId, sourceId)
  assert.equal('contentHash' in created.provenance, false)
  assert.equal('translation' in created.provenance, false)
  assert.equal('firstImportedAt' in created.provenance, false)
  assert.equal('lastFetchedAt' in created.provenance, false)
  assert.equal('originalSummary' in created.provenance, false)

  await registerBuildView(created.slug, 'external-native-visitor')
  await toggleBuildLike(created.slug, 'external-native-visitor')

  const sameHash = await upsertExternalBuild({
    ...first,
    title: '同一源哈希不得替换内容',
    provenance: {
      ...(first.provenance as Record<string, unknown>),
      author: 'Renamed Public Author',
      sourceUpdatedAt: '2026-07-24T02:00:00.000Z',
      lastFetchedAt: '2026-07-24T02:00:00.000Z'
    },
    sourceMetrics: {
      likes: 99,
      views: 123,
      comments: 7,
      fetchedAt: '2026-07-24T02:00:00.000Z'
    }
  } as any)
  assert.equal(sameHash.title, '外部构筑')
  assert.equal(sameHash.views, 1)
  assert.equal(sameHash.likes, 1)
  assert.equal(sameHash.sourceMetrics.views, 123)
  assert.equal(sameHash.sourceMetrics.likes, 99)
  assert.equal(sameHash.provenance.author, 'Renamed Public Author')
  assert.equal(new Date(sameHash.provenance.sourceUpdatedAt).toISOString(), '2026-07-24T02:00:00.000Z')

  const changed = await upsertExternalBuild({
    ...first,
    title: '更新后的中文构筑',
    summary: '源内容变化后的审核译文。',
    provenance: {
      ...(first.provenance as Record<string, unknown>),
      originalTitle: 'Updated external build',
      originalSummary: 'Updated public description.',
      sourceUpdatedAt: '2026-07-24T03:00:00.000Z',
      lastFetchedAt: '2026-07-24T03:00:00.000Z',
      contentHash: hashB,
      translation: {
        targetLanguage: 'zh-CN',
        status: 'reviewed',
        method: 'manual',
        updatedAt: '2026-07-24T03:00:00.000Z',
        sourceHash: hashB
      }
    },
    sourceMetrics: {
      likes: 100,
      views: 130,
      comments: 8,
      fetchedAt: '2026-07-24T03:00:00.000Z'
    }
  } as any)

  assert.equal(changed.slug, created.slug)
  assert.equal(changed.title, '更新后的中文构筑')
  assert.equal(changed.summary, '源内容变化后的审核译文。')
  assert.equal(changed.views, 1)
  assert.equal(changed.likes, 1)
  assert.equal(changed.sourceMetrics.views, 130)
  assert.equal(changed.sourceMetrics.likes, 100)

  const detail = await getBuild(created.slug)
  assert.equal(detail?.title, '更新后的中文构筑')
  assert.equal(detail?.views, 1)
  assert.equal(detail?.likes, 1)
  const matching = (await listBuilds()).filter((build: any) =>
    build.provenance?.site === 'spirit-vale-builder.base44.app'
    && build.provenance?.sourceId === sourceId
  )
  assert.equal(matching.length, 1)
})

test('build directory filters source types and ranks only native engagement', async () => {
  const app = await buildApp({
    equipmentRecords: [],
    archetypeRecords: [],
    skillRecords: []
  })
  try {
    const external = await app.inject({ method: 'GET', url: '/api/builds?origin=external&sort=rank' })
    assert.equal(external.statusCode, 200)
    const externalBuilds = external.json()
    assert.ok(externalBuilds.length >= 1)
    assert.ok(externalBuilds.every((build: any) => build.source === 'external'))
    const updated = externalBuilds.find((build: any) => build.slug === 'external-upsert-interaction-isolation')
    assert.equal(updated.rankScore, 6)
    assert.equal(updated.sourceMetrics.views, 130)

    const user = await app.inject({ method: 'GET', url: '/api/builds?origin=user&sort=rank' })
    assert.equal(user.statusCode, 200)
    assert.ok(user.json().every((build: any) => build.source === 'user'))

    const invalid = await app.inject({ method: 'GET', url: '/api/builds?origin=seed' })
    assert.equal(invalid.statusCode, 400)
  } finally {
    await app.close()
  }
})
