import type { OcrRecognitionLayout } from '~/types/ocr'

/** Tesseract page-segmentation modes: AUTO=3, SPARSE_TEXT=11. */
export function ocrPageSegmentationMode(layout: OcrRecognitionLayout): '3' | '11' {
  return layout === 'sparse' ? '11' : '3'
}
