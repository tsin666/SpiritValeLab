import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

type LocaleTree = Record<string, unknown>

function flatten(value: LocaleTree, prefix = '', result = new Map<string, string>()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'string') result.set(path, child)
    else if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child as LocaleTree, path, result)
    else throw new TypeError(`Unsupported locale value at ${path}`)
  }
  return result
}

function placeholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]).sort()
}

async function locale(name: string) {
  const url = new URL(`../i18n/locales/${name}.json`, import.meta.url)
  return flatten(JSON.parse(await readFile(url, 'utf8')) as LocaleTree)
}

test('Chinese and English locale trees stay structurally identical', async () => {
  const [zh, en] = await Promise.all([locale('zh-CN'), locale('en')])
  assert.deepEqual([...zh.keys()].sort(), [...en.keys()].sort())
})

test('translated messages preserve interpolation placeholders', async () => {
  const [zh, en] = await Promise.all([locale('zh-CN'), locale('en')])
  for (const [key, value] of zh) {
    assert.deepEqual(placeholders(value), placeholders(en.get(key) || ''), `Placeholder mismatch at ${key}`)
  }
})
