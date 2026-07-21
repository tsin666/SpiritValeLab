import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { BuildModel } from '../src/models/build.js'

process.env.NODE_ENV = 'test'
delete process.env.MONGODB_URI
delete process.env.REDIS_URL

const { buildApp } = await import('../src/app.js')
const app = await buildApp()
let difficulty = ''

before(async () => {
  await app.ready()
  const options = await app.inject({ method: 'GET', url: '/api/builder/options' })
  difficulty = options.json().difficulties[0]
})
after(async () => app.close())

function payload(slug: string) {
  return {
    slug,
    title: `Rich guide ${slug}`,
    archetype: 'wizard',
    difficulty,
    summary: 'A complete rich-text guide used by the API test suite.',
    guide: ['Legacy step remains available.'],
    tags: ['guide'],
    skills: [{ id: 'Meteor' }],
    createdBy: 'guide-html-test'
  }
}

test('rich guide HTML is sanitized, persisted and returned alongside legacy guide steps', async () => {
  const guideHtml = '<h2>Opening</h2><p>Use <strong>Meteor</strong><br>now.</p>'
    + '<blockquote><em>Wait for the group.</em></blockquote>'
    + '<div>Browser output: <b>bold</b> and <i>italic</i>.</div>'
    + '<a href="https://example.com/guide" title="Source">Source</a>'
  const created = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload('rich-guide-roundtrip'), guideHtml }
  })

  assert.equal(created.statusCode, 201)
  assert.equal(
    created.json().guideHtml,
    '<h2>Opening</h2><p>Use <strong>Meteor</strong><br />now.</p>'
      + '<blockquote><em>Wait for the group.</em></blockquote>'
      + '<p>Browser output: <strong>bold</strong> and <em>italic</em>.</p>'
      + '<a href="https://example.com/guide" title="Source" rel="noopener noreferrer nofollow">Source</a>'
  )
  assert.deepEqual(created.json().guide, ['Legacy step remains available.'])

  const detail = await app.inject({ method: 'GET', url: '/api/builds/rich-guide-roundtrip' })
  assert.equal(detail.statusCode, 200)
  assert.equal(detail.json().guideHtml, created.json().guideHtml)
  assert.deepEqual(detail.json().guide, ['Legacy step remains available.'])
})

test('builds that only use the legacy guide array remain compatible', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: payload('legacy-guide-compatible')
  })

  assert.equal(created.statusCode, 201)
  assert.deepEqual(created.json().guide, ['Legacy step remains available.'])
  assert.equal(created.json().guideHtml, undefined)
})

test('markup-only rich guide values normalize to the same empty state as an omitted guide', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload('empty-rich-guide'), guideHtml: '<p><br></p><div><br></div>' }
  })

  assert.equal(created.statusCode, 201)
  assert.equal(created.json().guideHtml, undefined)
})

test('rich guide limit counts Unicode code points after removing markup', async () => {
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload('rich-guide-code-points'), guideHtml: `<p>${'😀'.repeat(10_000)}</p>` }
  })
  assert.equal(accepted.statusCode, 201)

  const rejected = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload('rich-guide-too-long'), guideHtml: `<p>${'字'.repeat(10_001)}</p>` }
  })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.json().code, 'VALIDATION_ERROR')
  assert.deepEqual(rejected.json().details[0].path, ['guideHtml'])
  assert.match(rejected.json().details[0].message, /at most 10000 characters/)
})

test('rich guide sanitizer removes executable markup and only keeps safe HTTP links', async () => {
  const dangerous = '<script>alert("script")</script><style>body{display:none}</style>'
    + '<p onclick="alert(1)">Safe<img src=x onerror="alert(2)"></p>'
    + '<a href="javascript:alert(3)" onmouseover="alert(4)">Bad link</a>'
    + '<a href="/relative" rel="opener">Relative link</a>'
    + '<a href="https://example.com/safe" rel="opener" onclick="alert(5)">Safe link</a>'
  const created = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload('rich-guide-xss'), guideHtml: dangerous }
  })

  assert.equal(created.statusCode, 201)
  const clean = created.json().guideHtml as string
  assert.doesNotMatch(clean, /script|style|onclick|onerror|onmouseover|javascript:|<img/i)
  assert.doesNotMatch(clean, /alert\(|display:none/)
  assert.match(clean, /<p>Safe<\/p>/)
  assert.match(clean, /<a rel="noopener noreferrer nofollow">Bad link<\/a>/)
  assert.match(clean, /<a rel="noopener noreferrer nofollow">Relative link<\/a>/)
  assert.match(clean, /<a href="https:\/\/example\.com\/safe" rel="noopener noreferrer nofollow">Safe link<\/a>/)
})

test('rich guide addition preserves strict request validation', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/builds',
    payload: { ...payload('rich-guide-unknown-field'), guideHtml: '<p>Valid</p>', unknownField: true }
  })
  assert.equal(response.statusCode, 400)
  assert.equal(response.json().code, 'VALIDATION_ERROR')
})

test('Mongo build schema retains sanitized guide HTML', async () => {
  const document = new BuildModel({
    slug: 'mongo-rich-guide',
    title: 'Mongo rich guide',
    archetype: 'Wizard',
    difficulty: 'advanced',
    guideHtml: '<p onclick="alert(1)">Persisted <b>guide</b>.<img src=x onerror="alert(2)"></p>'
  })
  await document.validate()
  assert.equal(document.toObject().guideHtml, '<p>Persisted <strong>guide</strong>.</p>')
})
