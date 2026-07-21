import type {
  OcrFileErrorCode,
  OcrImageDimensions,
  PreparedOcrImage
} from '~/types/ocr'

export const OCR_MAX_FILE_BYTES = 8 * 1024 * 1024
export const OCR_MAX_SOURCE_PIXELS = 12_000_000
export const OCR_MAX_SOURCE_EDGE = 6_000
export const OCR_MAX_OUTPUT_EDGE = 2_400

type SupportedImageMimeType = PreparedOcrImage['sourceMimeType']

export class OcrFileError extends Error {
  readonly code: OcrFileErrorCode

  constructor(code: OcrFileErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'OcrFileError'
    this.code = code
  }
}

export function detectOcrImageMimeType(bytes: Uint8Array): SupportedImageMimeType | null {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png'

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12
    && ascii(bytes, 0, 4) === 'RIFF'
    && ascii(bytes, 8, 4) === 'WEBP'
  ) return 'image/webp'

  return null
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

function uint16BigEndian(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! << 8) | bytes[offset + 1]!
}

function uint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset]! * 0x1000000)
    + (bytes[offset + 1]! << 16)
    + (bytes[offset + 2]! << 8)
    + bytes[offset + 3]!
  )
}

function uint24LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

function uint32LittleEndian(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]!
    | (bytes[offset + 1]! << 8)
    | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)
  ) >>> 0
}

function pngDimensions(bytes: Uint8Array): OcrImageDimensions | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
  return {
    width: uint32BigEndian(bytes, 16),
    height: uint32BigEndian(bytes, 20)
  }
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf
])

function jpegDimensions(bytes: Uint8Array): OcrImageDimensions | null {
  let offset = 2

  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) break

    const marker = bytes[offset]!
    offset += 1

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }

    if (offset + 1 >= bytes.length) break
    const segmentLength = uint16BigEndian(bytes, offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null

    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) return null
      return {
        width: uint16BigEndian(bytes, offset + 5),
        height: uint16BigEndian(bytes, offset + 3)
      }
    }

    offset += segmentLength
  }

  return null
}

function webpDimensions(bytes: Uint8Array): OcrImageDimensions | null {
  let offset = 12

  while (offset + 8 <= bytes.length) {
    const chunkType = ascii(bytes, offset, 4)
    const chunkLength = uint32LittleEndian(bytes, offset + 4)
    const dataOffset = offset + 8
    const chunkEnd = dataOffset + chunkLength
    if (chunkEnd > bytes.length) return null

    if (chunkType === 'VP8X' && chunkLength >= 10) {
      return {
        width: uint24LittleEndian(bytes, dataOffset + 4) + 1,
        height: uint24LittleEndian(bytes, dataOffset + 7) + 1
      }
    }

    if (chunkType === 'VP8L' && chunkLength >= 5 && bytes[dataOffset] === 0x2f) {
      const packedDimensions = uint32LittleEndian(bytes, dataOffset + 1)
      return {
        width: (packedDimensions & 0x3fff) + 1,
        height: ((packedDimensions >>> 14) & 0x3fff) + 1
      }
    }

    if (
      chunkType === 'VP8 '
      && chunkLength >= 10
      && bytes[dataOffset + 3] === 0x9d
      && bytes[dataOffset + 4] === 0x01
      && bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        width: (bytes[dataOffset + 6]! | (bytes[dataOffset + 7]! << 8)) & 0x3fff,
        height: (bytes[dataOffset + 8]! | (bytes[dataOffset + 9]! << 8)) & 0x3fff
      }
    }

    offset = chunkEnd + (chunkLength % 2)
  }

  return null
}

export function readOcrImageDimensions(bytes: Uint8Array, mimeType: SupportedImageMimeType) {
  if (mimeType === 'image/png') return pngDimensions(bytes)
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes)
  return webpDimensions(bytes)
}

function assertDimensions({ width, height }: OcrImageDimensions) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new OcrFileError('invalid-image', 'The image dimensions are invalid.')
  }
  if (width > OCR_MAX_SOURCE_EDGE || height > OCR_MAX_SOURCE_EDGE) {
    throw new OcrFileError('edge-too-large', `Image edges must not exceed ${OCR_MAX_SOURCE_EDGE} pixels.`)
  }
  if (width * height > OCR_MAX_SOURCE_PIXELS) {
    throw new OcrFileError('pixel-count-too-large', `Images must not exceed ${OCR_MAX_SOURCE_PIXELS} decoded pixels.`)
  }
}

export async function validateOcrImageFile(file: File) {
  if (!file.size) throw new OcrFileError('empty-file', 'Choose a non-empty image file.')
  if (file.size > OCR_MAX_FILE_BYTES) {
    throw new OcrFileError('file-too-large', `Image files must not exceed ${OCR_MAX_FILE_BYTES} bytes.`)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const mimeType = detectOcrImageMimeType(bytes)
  if (!mimeType) {
    throw new OcrFileError('unsupported-format', 'Only genuine PNG, JPEG, and WebP images are accepted.')
  }

  const dimensions = readOcrImageDimensions(bytes, mimeType)
  if (!dimensions) throw new OcrFileError('invalid-image', 'The image header is incomplete or invalid.')
  assertDimensions(dimensions)

  return { mimeType, ...dimensions }
}

function outputDimensions(width: number, height: number) {
  const scale = Math.min(1, OCR_MAX_OUTPUT_EDGE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

function applyOcrContrast(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data

  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (pixels[index]! * 0.299) + (pixels[index + 1]! * 0.587) + (pixels[index + 2]! * 0.114)
    const contrasted = Math.max(0, Math.min(255, Math.round(128 + ((luminance - 128) * 1.28))))
    pixels[index] = contrasted
    pixels[index + 1] = contrasted
    pixels[index + 2] = contrasted
  }

  context.putImageData(imageData, 0, 0)
}

function canvasToPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new OcrFileError('canvas-failed', 'The browser could not prepare this image for OCR.'))
    }, 'image/png')
  })
}

async function loadHtmlImage(file: File) {
  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  image.decoding = 'async'

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new OcrFileError('decode-failed', 'The browser could not decode this image.'))
      image.src = objectUrl
    })
    return image
  } catch (error) {
    image.src = ''
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

/**
 * Decodes, bounds-checks, strips metadata, downsizes, and increases text
 * contrast entirely inside the browser. The returned PNG blob is never sent
 * anywhere by this utility.
 */
export async function prepareOcrImage(file: File): Promise<PreparedOcrImage> {
  const validated = await validateOcrImageFile(file)
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new OcrFileError('browser-unsupported', 'Image preparation is available only in a browser.')
  }

  let source: ImageBitmap | HTMLImageElement | null = null
  let fallbackObjectUrl: string | null = null
  const canvas = document.createElement('canvas')

  try {
    if (typeof createImageBitmap === 'function') {
      source = await createImageBitmap(file)
    } else {
      source = await loadHtmlImage(file)
      fallbackObjectUrl = source.src
    }

    const isHtmlImage = typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement
    const decodedWidth = isHtmlImage ? source.naturalWidth : source.width
    const decodedHeight = isHtmlImage ? source.naturalHeight : source.height
    assertDimensions({ width: decodedWidth, height: decodedHeight })

    const target = outputDimensions(decodedWidth, decodedHeight)
    canvas.width = target.width
    canvas.height = target.height

    const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
    if (!context) throw new OcrFileError('canvas-failed', 'Canvas processing is unavailable in this browser.')

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, target.width, target.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(source, 0, 0, target.width, target.height)
    applyOcrContrast(context, target.width, target.height)

    return {
      blob: await canvasToPng(canvas),
      width: target.width,
      height: target.height,
      originalWidth: decodedWidth,
      originalHeight: decodedHeight,
      sourceMimeType: validated.mimeType
    }
  } catch (error) {
    if (error instanceof OcrFileError) throw error
    throw new OcrFileError('decode-failed', 'The browser could not decode this image.', { cause: error })
  } finally {
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) source.close()
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) source.src = ''
    if (fallbackObjectUrl) URL.revokeObjectURL(fallbackObjectUrl)
    canvas.width = 0
    canvas.height = 0
  }
}
