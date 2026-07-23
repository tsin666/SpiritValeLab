export const OCR_PHASES = [
  'idle',
  'validating',
  'preprocessing',
  'ready',
  'loading',
  'recognizing',
  'review',
  'cancelling',
  'cancelled',
  'error'
] as const

export type OcrPhase = typeof OCR_PHASES[number]

export interface OcrMachineState {
  phase: OcrPhase
  progress: number
  statusText: string
  error: string | null
}

/**
 * The only value allowed to leave the OCR review boundary. Images and file
 * metadata deliberately never become part of a build draft.
 */
export interface OcrReviewDraft {
  text: string
}

export interface EquipmentOcrParse {
  nameCandidates: string[]
  refineLevel?: number
  potential?: number
}

export type OcrRecognitionLayout = 'document' | 'sparse'
export type BuildCatalogOcrKind = 'equipment' | 'artifact' | 'grimoire'

export interface BuildCatalogOcrKindLabels {
  singular: string
  plural: string
  screenshot: string
}

export interface BuildCatalogOcrParsedLine {
  id: string
  text: string
  refineLevel?: number
  potential?: number
  partIndex?: 0 | 1 | 2 | 3
  sourceSlot?: string
  suffixText?: string
}

export interface BuildCatalogOcrParseResult {
  lines: BuildCatalogOcrParsedLine[]
}

export type BuildCatalogOcrParser = (text: string) => BuildCatalogOcrParseResult

export type OcrCatalogMatchType = 'exact' | 'fuzzy'

export interface OcrCatalogCandidate {
  key: string
  kind: string
  id: string
  slug: string
  displayName: string
  matchedAlias: string
  matchType: OcrCatalogMatchType
  score: number
}

export interface OcrCatalogLineMatch {
  lineId: string
  query: string
  normalizedQuery: string
  status: 'suggested' | 'ambiguous' | 'unmatched'
  candidates: OcrCatalogCandidate[]
}

export interface OcrCatalogMatchResponse {
  source: 'text-only'
  reviewRequired: true
  selectionsAccepted: false
  lines: OcrCatalogLineMatch[]
}

export type OcrFileErrorCode =
  | 'empty-file'
  | 'file-too-large'
  | 'unsupported-format'
  | 'invalid-image'
  | 'edge-too-large'
  | 'pixel-count-too-large'
  | 'browser-unsupported'
  | 'decode-failed'
  | 'canvas-failed'

export type BrowserOcrErrorCode =
  | 'client-only'
  | 'busy'
  | 'cancelled'
  | 'worker-failed'

export interface OcrImageDimensions {
  width: number
  height: number
}

export interface PreparedOcrImage extends OcrImageDimensions {
  blob: Blob
  originalWidth: number
  originalHeight: number
  sourceMimeType: 'image/png' | 'image/jpeg' | 'image/webp'
}
