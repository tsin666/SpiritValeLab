import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  OCR_MAX_FILE_BYTES,
  OCR_MAX_SOURCE_EDGE,
  OCR_MAX_SOURCE_PIXELS,
  OcrFileError,
  detectOcrImageMimeType,
  readOcrImageDimensions,
  validateOcrImageFile
} from '../utils/ocr-file.ts'

function setAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index)
  }
}

function setUint24LittleEndian(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
}

function pngBytes(width: number, height: number, byteLength = 24) {
  const bytes = new Uint8Array(byteLength)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  setAscii(bytes, 12, 'IHDR')
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width, false)
  view.setUint32(20, height, false)
  return bytes
}

function jpegBytes(width: number, height: number) {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x02,
    0xff, 0xc0, 0x00, 0x07, 0x08,
    (height >>> 8) & 0xff, height & 0xff,
    (width >>> 8) & 0xff, width & 0xff
  ])
}

function webpBytes(chunkType: 'VP8X' | 'VP8L' | 'VP8 ', payload: Uint8Array) {
  const paddedPayloadLength = payload.length + (payload.length % 2)
  const bytes = new Uint8Array(20 + paddedPayloadLength)
  const view = new DataView(bytes.buffer)
  setAscii(bytes, 0, 'RIFF')
  view.setUint32(4, bytes.length - 8, true)
  setAscii(bytes, 8, 'WEBP')
  setAscii(bytes, 12, chunkType)
  view.setUint32(16, payload.length, true)
  bytes.set(payload, 20)
  return bytes
}

function webpExtendedBytes(width: number, height: number) {
  const payload = new Uint8Array(10)
  setUint24LittleEndian(payload, 4, width - 1)
  setUint24LittleEndian(payload, 7, height - 1)
  return webpBytes('VP8X', payload)
}

function webpLosslessBytes(width: number, height: number) {
  const payload = new Uint8Array(5)
  payload[0] = 0x2f
  const packedDimensions = (width - 1) | ((height - 1) << 14)
  new DataView(payload.buffer).setUint32(1, packedDimensions, true)
  return webpBytes('VP8L', payload)
}

function webpLossyBytes(width: number, height: number) {
  const payload = new Uint8Array(10)
  payload.set([0x9d, 0x01, 0x2a], 3)
  const view = new DataView(payload.buffer)
  view.setUint16(6, width, true)
  view.setUint16(8, height, true)
  return webpBytes('VP8 ', payload)
}

function imageFile(bytes: Uint8Array, name: string, type: string) {
  return new File([bytes], name, { type })
}

async function assertOcrErrorCode(promise: Promise<unknown>, code: OcrFileError['code']) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OcrFileError)
    assert.equal(error.code, code)
    return true
  })
}

test('detects genuine PNG, JPEG, and WebP signatures and reads their dimensions', async () => {
  const fixtures = [
    { bytes: pngBytes(1920, 1080), mimeType: 'image/png' as const, width: 1920, height: 1080 },
    { bytes: jpegBytes(2048, 1536), mimeType: 'image/jpeg' as const, width: 2048, height: 1536 },
    { bytes: webpExtendedBytes(1600, 900), mimeType: 'image/webp' as const, width: 1600, height: 900 },
    { bytes: webpLosslessBytes(1024, 768), mimeType: 'image/webp' as const, width: 1024, height: 768 },
    { bytes: webpLossyBytes(800, 600), mimeType: 'image/webp' as const, width: 800, height: 600 }
  ]

  for (const [index, fixture] of fixtures.entries()) {
    assert.equal(detectOcrImageMimeType(fixture.bytes), fixture.mimeType)
    assert.deepEqual(readOcrImageDimensions(fixture.bytes, fixture.mimeType), {
      width: fixture.width,
      height: fixture.height
    })

    const validated = await validateOcrImageFile(
      imageFile(fixture.bytes, `fixture-${index}.bin`, 'application/octet-stream')
    )
    assert.deepEqual(validated, {
      mimeType: fixture.mimeType,
      width: fixture.width,
      height: fixture.height
    })
  }
})

test('rejects files whose extension or declared MIME type only pretends to be an image', async () => {
  const fakeBytes = new TextEncoder().encode('not an image')
  const fakes = [
    imageFile(fakeBytes, 'fake.png', 'image/png'),
    imageFile(fakeBytes, 'fake.jpg', 'image/jpeg'),
    imageFile(fakeBytes, 'fake.webp', 'image/webp')
  ]

  for (const fake of fakes) {
    await assertOcrErrorCode(validateOcrImageFile(fake), 'unsupported-format')
  }
})

test('rejects an empty file before attempting signature detection', async () => {
  await assertOcrErrorCode(
    validateOcrImageFile(imageFile(new Uint8Array(), 'empty.png', 'image/png')),
    'empty-file'
  )
})

test('accepts exactly 8 MiB and rejects a file one byte over the limit', async () => {
  const atLimit = imageFile(pngBytes(1, 1, OCR_MAX_FILE_BYTES), 'at-limit.png', 'image/png')
  assert.equal(atLimit.size, OCR_MAX_FILE_BYTES)
  assert.deepEqual(await validateOcrImageFile(atLimit), {
    mimeType: 'image/png',
    width: 1,
    height: 1
  })

  const overLimit = imageFile(
    pngBytes(1, 1, OCR_MAX_FILE_BYTES + 1),
    'over-limit.png',
    'image/png'
  )
  assert.equal(overLimit.size, OCR_MAX_FILE_BYTES + 1)
  await assertOcrErrorCode(validateOcrImageFile(overLimit), 'file-too-large')
})

test('accepts the 6000px and 12-million-pixel boundaries', async () => {
  const boundary = await validateOcrImageFile(imageFile(
    pngBytes(OCR_MAX_SOURCE_EDGE, OCR_MAX_SOURCE_PIXELS / OCR_MAX_SOURCE_EDGE),
    'boundary.png',
    'image/png'
  ))

  assert.deepEqual(boundary, {
    mimeType: 'image/png',
    width: 6000,
    height: 2000
  })
})

test('rejects either source edge above 6000px', async () => {
  for (const [width, height] of [[6001, 1], [1, 6001]]) {
    await assertOcrErrorCode(
      validateOcrImageFile(imageFile(pngBytes(width, height), 'edge.png', 'image/png')),
      'edge-too-large'
    )
  }
})

test('rejects decoded pixel counts above 12 million while each edge remains valid', async () => {
  const width = 4001
  const height = 3000
  assert.ok(width <= OCR_MAX_SOURCE_EDGE)
  assert.ok(height <= OCR_MAX_SOURCE_EDGE)
  assert.ok(width * height > OCR_MAX_SOURCE_PIXELS)

  await assertOcrErrorCode(
    validateOcrImageFile(imageFile(pngBytes(width, height), 'too-many-pixels.png', 'image/png')),
    'pixel-count-too-large'
  )
})
