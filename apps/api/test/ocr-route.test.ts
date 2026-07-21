import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { buildApp } = await import('../src/app.js')
const app = await buildApp()
before(async () => app.ready())
after(async () => app.close())

type OcrLine = {
  lineId: string
  query: string
  normalizedQuery: string
  status: 'suggested' | 'ambiguous' | 'unmatched'
  candidates: Array<{ kind: string; id: string; matchType: string; score: number }>
}

type OcrRequestLine = { id: string; text: string; kinds?: string[]; [key: string]: unknown }

function validBody(lines: OcrRequestLine[] = [{ id: 'one', text: 'Paladin' }]) {
  return { lines }
}

test('OCR matcher accepts text only, returns all catalog kinds, and always requires review', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    payload: validBody([
      { id: 'archetype', text: 'Paladin' },
      { id: 'skill', text: 'Aegis of Light' },
      { id: 'skillPassive', text: 'Scripture of Mercy' },
      { id: 'equipment', text: '3D Glasses' },
      { id: 'artifact', text: 'Holy Vow' },
      { id: 'gem', text: 'Aerial Shot Gem' },
      { id: 'card', text: 'Abomination Card' }
    ])
  })

  assert.equal(response.statusCode, 200)
  const body = response.json() as {
    source: string
    reviewRequired: boolean
    selectionsAccepted: boolean
    lines: OcrLine[]
  }
  assert.equal(body.source, 'text-only')
  assert.equal(body.reviewRequired, true)
  assert.equal(body.selectionsAccepted, false)
  assert.deepEqual(body.lines.map(line => line.lineId), [
    'archetype', 'skill', 'skillPassive', 'equipment', 'artifact', 'gem', 'card'
  ])
  assert.deepEqual(
    body.lines.map(line => line.candidates[0]?.kind),
    ['archetype', 'skill', 'skillPassive', 'equipment', 'artifact', 'gem', 'card']
  )
  assert.ok(body.lines.every(line => line.candidates.length > 0 && line.candidates[0]?.matchType === 'exact'))
  assert.equal(body.lines.find(line => line.lineId === 'skillPassive')?.status, 'ambiguous')
})

test('OCR matcher preserves real Acolyte ambiguity, supports kind narrowing, and caps candidates', async () => {
  const ambiguous = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    payload: validBody([{ id: 'acolyte', text: 'Acolyte' }])
  })
  assert.equal(ambiguous.statusCode, 200)
  const line = (ambiguous.json().lines as OcrLine[])[0]
  assert.equal(line.status, 'ambiguous')
  assert.deepEqual(line.candidates.map(candidate => candidate.kind), ['archetype', 'artifact'])

  const capped = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    payload: { ...validBody([{ id: 'capped-acolyte', text: 'Acolyte' }]), maxCandidates: 1 }
  })
  assert.equal(capped.statusCode, 200)
  const cappedLine = (capped.json().lines as OcrLine[])[0]
  assert.equal(cappedLine.status, 'ambiguous')
  assert.deepEqual(cappedLine.candidates.map(candidate => candidate.kind), ['archetype'])

  const narrowed = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    payload: { ...validBody([{ id: 'acolyte-artifact', text: 'Acolyte', kinds: ['artifact'] }]), maxCandidates: 5 }
  })
  assert.equal(narrowed.statusCode, 200)
  const narrowedLine = (narrowed.json().lines as OcrLine[])[0]
  assert.equal(narrowedLine.status, 'suggested')
  assert.deepEqual(narrowedLine.candidates.map(candidate => candidate.kind), ['artifact'])

  const unmatched = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    payload: validBody([{ id: 'noise', text: 'qxzv plutonium dishwasher' }])
  })
  assert.equal(unmatched.statusCode, 200)
  assert.equal((unmatched.json().lines as OcrLine[])[0]?.status, 'unmatched')
  assert.deepEqual((unmatched.json().lines as OcrLine[])[0]?.candidates, [])
})

test('OCR matcher uses the custom buildApp resource directories', async () => {
  const fixtures = [
    ['archetype', 'FixtureArchetype', 'Fixture Archetype'],
    ['skill', 'FixtureSkill', 'Fixture Skill'],
    ['skillPassive', 'FixturePassive', 'Fixture Passive'],
    ['equipment', 'FixtureEquipment', 'Fixture Equipment'],
    ['artifact', 'FixtureArtifact', 'Fixture Artifact'],
    ['gem', 'FixtureGem', 'Fixture Gem'],
    ['card', 'FixtureCard', 'Fixture Card']
  ] as const
  const customApp = await buildApp({
    ocrCatalogSources: Object.fromEntries(fixtures.map(([kind, id, displayName]) => [kind, [{
      id,
      slug: id.replace(/[A-Z]/g, (letter, index) => `${index ? '-' : ''}${letter.toLowerCase()}`),
      displayName,
      name: { en: displayName }
    }]]))
  })
  await customApp.ready()
  try {
    const response = await customApp.inject({
      method: 'POST',
      url: '/api/ocr/match',
      payload: validBody(fixtures.map(([kind, _id, displayName]) => ({ id: kind, text: displayName })))
    })
    assert.equal(response.statusCode, 200)
    const lines = response.json().lines as OcrLine[]
    assert.deepEqual(lines.map(line => [line.candidates[0]?.kind, line.candidates[0]?.id]),
      fixtures.map(([kind, id]) => [kind, id]))

    const runtimeNamesMustNotLeak = await customApp.inject({
      method: 'POST',
      url: '/api/ocr/match',
      payload: validBody([
        { id: 'runtime-archetype', text: 'Paladin' },
        { id: 'runtime-skill', text: 'Aegis of Light' },
        { id: 'runtime-passive', text: 'Scripture of Mercy' },
        { id: 'runtime-equipment', text: '3D Glasses' },
        { id: 'runtime-artifact', text: 'Holy Vow' },
        { id: 'runtime-gem', text: 'Aerial Shot Gem' },
        { id: 'runtime-card', text: 'Abomination Card' }
      ])
    })
    assert.equal(runtimeNamesMustNotLeak.statusCode, 200)
    assert.ok((runtimeNamesMustNotLeak.json().lines as OcrLine[]).every(line => line.status === 'unmatched'))
  } finally {
    await customApp.close()
  }
})

test('OCR matcher rejects image-like payloads and all invalid text-only input boundaries', async () => {
  const invalidBodies: unknown[] = [
    { ...validBody(), image: 'data:image/png;base64,AAA' },
    { ...validBody(), base64: 'AAA' },
    { ...validBody(), url: 'https://example.invalid/character.png' },
    { ...validBody(), file: 'character.png' },
    { ...validBody(), rawText: 'Paladin' },
    validBody([{ id: 'one', text: 'Paladin', image: 'data:image/png;base64,AAA' }]),
    { lines: [] },
    validBody([{ id: 'bad/id', text: 'Paladin' }]),
    validBody([{ id: 'one', text: '' }]),
    validBody([{ id: 'one', text: 'x'.repeat(241) }]),
    validBody([{ id: 'one', text: 'Paladin', kinds: [] }]),
    validBody([{ id: 'one', text: 'Paladin', kinds: ['not-a-kind'] }]),
    validBody([{ id: 'one', text: 'Paladin', kinds: Array.from({ length: 8 }, () => 'archetype') }]),
    validBody([{ id: 'same', text: 'Paladin' }, { id: ' same ', text: 'Aegis of Light' }]),
    validBody(Array.from({ length: 65 }, (_, index) => ({ id: `line-${index}`, text: 'Paladin' }))),
    { ...validBody(), maxCandidates: 0 },
    { ...validBody(), maxCandidates: 6 }
  ]

  for (const payload of invalidBodies) {
    const response = await app.inject({ method: 'POST', url: '/api/ocr/match', payload })
    assert.equal(response.statusCode, 400, JSON.stringify(payload).slice(0, 160))
    assert.equal(response.json().code, 'VALIDATION_ERROR')
  }

  const multipart = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    headers: { 'content-type': 'multipart/form-data; boundary=ocr-boundary' },
    payload: '--ocr-boundary\r\nContent-Disposition: form-data; name="image"\r\n\r\nignored\r\n--ocr-boundary--\r\n'
  })
  assert.equal(multipart.statusCode, 415)
  assert.deepEqual(multipart.json(), { error: 'Unsupported media type', code: 'UNSUPPORTED_MEDIA_TYPE' })

  const tooLarge = await app.inject({
    method: 'POST',
    url: '/api/ocr/match',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify(validBody([{ id: 'large', text: 'x'.repeat(33 * 1024) }]))
  })
  assert.equal(tooLarge.statusCode, 413)
  assert.deepEqual(tooLarge.json(), { error: 'Request body is too large', code: 'BODY_TOO_LARGE' })
})

test('OCR matcher limits one caller after 30 requests without affecting isolated app coverage', async () => {
  const limitedApp = await buildApp()
  await limitedApp.ready()
  try {
    for (let index = 0; index < 30; index += 1) {
      const response = await limitedApp.inject({
        method: 'POST',
        url: '/api/ocr/match',
        payload: validBody([{ id: `line-${index}`, text: 'Paladin' }])
      })
      assert.equal(response.statusCode, 200, `request ${index + 1}`)
    }
    const limited = await limitedApp.inject({
      method: 'POST',
      url: '/api/ocr/match',
      payload: validBody([{ id: 'limit', text: 'Paladin' }])
    })
    assert.equal(limited.statusCode, 429)
    assert.deepEqual(limited.json(), { error: 'Too many requests', code: 'RATE_LIMITED' })
    assert.equal(limited.headers['x-ratelimit-limit'], '30')
    assert.equal(limited.headers['x-ratelimit-remaining'], '0')
    assert.match(limited.headers['x-ratelimit-reset'] || '', /^\d+$/)
    assert.match(limited.headers['retry-after'] || '', /^\d+$/)
  } finally {
    await limitedApp.close()
  }
})
