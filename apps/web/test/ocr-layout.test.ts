import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ocrPageSegmentationMode } from '../utils/ocr-layout.ts'

test('maps document tooltips to AUTO and full-screen sparse layouts to SPARSE_TEXT', () => {
  assert.equal(ocrPageSegmentationMode('document'), '3')
  assert.equal(ocrPageSegmentationMode('sparse'), '11')
})
