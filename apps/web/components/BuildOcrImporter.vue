<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { BrowserOcrError, useBrowserOcr } from '~/composables/useBrowserOcr'
import type { OcrPhase, OcrReviewDraft, PreparedOcrImage } from '~/types/ocr'
import {
  OcrFileError,
  prepareOcrImage
} from '~/utils/ocr-file'

interface OcrImporterLabels {
  title: string
  description: string
  privacy: string
  chooseFile: string
  replaceFile: string
  supportedFiles: string
  previewAlt: string
  start: string
  runAgain: string
  cancel: string
  clear: string
  validating: string
  preprocessing: string
  loading: string
  recognizing: string
  reviewTitle: string
  reviewDescription: string
  recognizedText: string
  characterCount: string
  confirm: string
  emptyText: string
  fileTooLarge: string
  unsupportedFormat: string
  invalidImage: string
  dimensionsExceeded: string
  browserUnsupported: string
  genericError: string
}

const DEFAULT_LABELS: OcrImporterLabels = {
  title: 'Import from screenshot',
  description: 'Choose an equipment screenshot, recognize its text locally, then review every field before confirming.',
  privacy: 'The image stays in this browser. It is never uploaded or stored by this component.',
  chooseFile: 'Choose screenshot',
  replaceFile: 'Replace screenshot',
  supportedFiles: 'PNG, JPEG, or WebP · up to 8 MiB',
  previewAlt: 'OCR-ready screenshot preview',
  start: 'Recognize text',
  runAgain: 'Recognize again',
  cancel: 'Cancel OCR',
  clear: 'Clear',
  validating: 'Checking image…',
  preprocessing: 'Preparing image locally…',
  loading: 'Loading local OCR…',
  recognizing: 'Recognizing Chinese and English text…',
  reviewTitle: 'Review recognized text',
  reviewDescription: 'OCR can make mistakes. Correct the text before confirming it.',
  recognizedText: 'Recognized text',
  characterCount: '{count} / {max}',
  confirm: 'Confirm reviewed text',
  emptyText: 'Enter or recognize some text before confirming.',
  fileTooLarge: 'The screenshot must be 8 MiB or smaller.',
  unsupportedFormat: 'Choose a genuine PNG, JPEG, or WebP image.',
  invalidImage: 'This image is incomplete or could not be decoded.',
  dimensionsExceeded: 'The decoded image is too large. Use at most 12 megapixels and 6000 pixels per edge.',
  browserUnsupported: 'This browser cannot prepare images for OCR.',
  genericError: 'OCR could not process this screenshot. Try a clearer crop.'
}

const props = withDefaults(defineProps<{
  labels?: Partial<OcrImporterLabels>
  maxTextLength?: number
}>(), {
  maxTextLength: 10_000
})

const emit = defineEmits<{
  confirm: [draft: OcrReviewDraft]
}>()

const labels = computed<OcrImporterLabels>(() => ({ ...DEFAULT_LABELS, ...props.labels }))
const fileInput = ref<HTMLInputElement | null>(null)
const preparedImage = ref<PreparedOcrImage | null>(null)
const previewUrl = ref('')
const selectedFileName = ref('')
const reviewText = ref('')
const localError = ref('')
const preparationPhase = ref<OcrPhase>('idle')
let selectionToken = 0

const ocr = useBrowserOcr()
const isPreparing = computed(() => ['validating', 'preprocessing'].includes(preparationPhase.value))
const isBusy = computed(() => isPreparing.value || ocr.isBusy.value)
const canConfirm = computed(() => Boolean(reviewText.value.trim()) && !isBusy.value)
const hasReview = computed(() => ocr.phase.value === 'review' || Boolean(reviewText.value))
const characterCount = computed(() => labels.value.characterCount
  .replace('{count}', String(reviewText.value.length))
  .replace('{max}', String(props.maxTextLength)))
const statusMessage = computed(() => {
  if (preparationPhase.value === 'validating') return labels.value.validating
  if (preparationPhase.value === 'preprocessing') return labels.value.preprocessing
  if (ocr.phase.value === 'loading') return labels.value.loading
  if (ocr.phase.value === 'recognizing' || ocr.phase.value === 'cancelling') return labels.value.recognizing
  return ''
})

function releasePreview() {
  if (previewUrl.value && typeof URL !== 'undefined') URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  preparedImage.value = null
}

function fileErrorMessage(error: OcrFileError) {
  if (error.code === 'file-too-large') return labels.value.fileTooLarge
  if (error.code === 'unsupported-format') return labels.value.unsupportedFormat
  if (error.code === 'edge-too-large' || error.code === 'pixel-count-too-large') return labels.value.dimensionsExceeded
  if (error.code === 'browser-unsupported') return labels.value.browserUnsupported
  return labels.value.invalidImage
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const currentToken = ++selectionToken
  if (ocr.isBusy.value) await ocr.cancel()
  releasePreview()
  ocr.reset()
  reviewText.value = ''
  localError.value = ''
  selectedFileName.value = file.name
  preparationPhase.value = 'validating'

  try {
    // prepareOcrImage validates magic bytes and decoded dimensions before the
    // local canvas output is handed to Tesseract.
    preparationPhase.value = 'preprocessing'
    const prepared = await prepareOcrImage(file)
    if (currentToken !== selectionToken) return

    preparedImage.value = prepared
    previewUrl.value = URL.createObjectURL(prepared.blob)
    preparationPhase.value = 'ready'
  } catch (caught) {
    if (currentToken !== selectionToken) return
    preparationPhase.value = 'error'
    localError.value = caught instanceof OcrFileError
      ? fileErrorMessage(caught)
      : labels.value.genericError
  }
}

async function runOcr() {
  if (!preparedImage.value || isBusy.value) return
  localError.value = ''
  reviewText.value = ''

  try {
    const draft = await ocr.recognize(preparedImage.value.blob)
    reviewText.value = draft.text.slice(0, props.maxTextLength)
  } catch (caught) {
    if (caught instanceof BrowserOcrError && caught.code === 'cancelled') return
    localError.value = labels.value.genericError
  }
}

async function cancelOcr() {
  await ocr.cancel()
}

async function clearImporter() {
  selectionToken += 1
  if (ocr.isBusy.value) await ocr.cancel()
  releasePreview()
  ocr.reset()
  selectedFileName.value = ''
  reviewText.value = ''
  localError.value = ''
  preparationPhase.value = 'idle'
  if (fileInput.value) fileInput.value.value = ''
}

function confirmReview() {
  const text = reviewText.value.trim()
  if (!text) {
    localError.value = labels.value.emptyText
    return
  }

  // Intentionally emit only reviewed text. The source image, object URL, and
  // filename remain private to this short-lived browser component.
  emit('confirm', { text })
}

onBeforeUnmount(() => {
  selectionToken += 1
  releasePreview()
})
</script>

<template>
  <section class="ocr-importer" :aria-busy="isBusy">
    <header class="ocr-importer__header">
      <div>
        <p class="ocr-importer__eyebrow">OCR</p>
        <h3>{{ labels.title }}</h3>
        <p>{{ labels.description }}</p>
      </div>
      <p class="ocr-importer__privacy">
        <span aria-hidden="true">⌁</span>
        {{ labels.privacy }}
      </p>
    </header>

    <label class="ocr-importer__picker" :class="{ 'ocr-importer__picker--ready': preparedImage }">
      <input
        ref="fileInput"
        class="ocr-importer__file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :disabled="isBusy"
        @change="handleFileChange"
      >
      <span class="ocr-importer__picker-icon" aria-hidden="true">＋</span>
      <span class="ocr-importer__picker-copy">
        <strong>{{ preparedImage ? labels.replaceFile : labels.chooseFile }}</strong>
        <small>{{ labels.supportedFiles }}</small>
      </span>
    </label>

    <div v-if="previewUrl && preparedImage" class="ocr-importer__preview">
      <img :src="previewUrl" :alt="labels.previewAlt">
      <div>
        <strong>{{ selectedFileName }}</strong>
        <span>{{ preparedImage.width }} × {{ preparedImage.height }}</span>
      </div>
    </div>

    <p v-if="localError" class="ocr-importer__error" role="alert">
      {{ localError }}
    </p>

    <div v-if="statusMessage" class="ocr-importer__progress" aria-live="polite">
      <div>
        <span>{{ statusMessage }}</span>
        <strong>{{ Math.round(ocr.progress.value * 100) }}%</strong>
      </div>
      <progress :value="ocr.progress.value" max="1">{{ Math.round(ocr.progress.value * 100) }}%</progress>
    </div>

    <div class="ocr-importer__actions">
      <button
        v-if="preparedImage && !ocr.isBusy.value"
        class="ocr-importer__button ocr-importer__button--primary"
        type="button"
        :disabled="isPreparing"
        @click="runOcr"
      >
        {{ hasReview ? labels.runAgain : labels.start }}
      </button>
      <button
        v-if="ocr.isBusy.value"
        class="ocr-importer__button ocr-importer__button--danger"
        type="button"
        @click="cancelOcr"
      >
        {{ labels.cancel }}
      </button>
      <button
        v-if="preparedImage || selectedFileName || reviewText"
        class="ocr-importer__button ocr-importer__button--quiet"
        type="button"
        :disabled="isPreparing"
        @click="clearImporter"
      >
        {{ labels.clear }}
      </button>
    </div>

    <div v-if="hasReview" class="ocr-importer__review">
      <div class="ocr-importer__review-heading">
        <div>
          <h4>{{ labels.reviewTitle }}</h4>
          <p>{{ labels.reviewDescription }}</p>
        </div>
        <span>{{ characterCount }}</span>
      </div>
      <label>
        <span class="ocr-importer__label">{{ labels.recognizedText }}</span>
        <textarea
          v-model="reviewText"
          :maxlength="maxTextLength"
          rows="10"
          spellcheck="false"
        />
      </label>
      <button
        class="ocr-importer__button ocr-importer__button--confirm"
        type="button"
        :disabled="!canConfirm"
        @click="confirmReview"
      >
        {{ labels.confirm }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.ocr-importer {
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 2.5vw, 1.5rem);
  color: #e9fffb;
  background:
    radial-gradient(circle at 85% 0%, rgba(52, 211, 184, 0.12), transparent 34%),
    #102033;
  border: 1px solid rgba(137, 219, 207, 0.18);
  border-radius: 1.25rem;
}

.ocr-importer__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(15rem, 0.65fr);
  gap: 1.25rem;
  align-items: start;
}

.ocr-importer__header h3,
.ocr-importer__header p,
.ocr-importer__review h4,
.ocr-importer__review p {
  margin: 0;
}

.ocr-importer__header h3 {
  margin-top: 0.2rem;
  font-size: clamp(1.15rem, 2vw, 1.45rem);
}

.ocr-importer__header > div > p:last-child,
.ocr-importer__review p {
  margin-top: 0.4rem;
  color: #9eb7be;
  line-height: 1.55;
}

.ocr-importer__eyebrow {
  color: #72e3d4;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.ocr-importer__privacy {
  display: flex;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem;
  color: #bfe5df;
  background: rgba(4, 48, 50, 0.62);
  border: 1px solid rgba(93, 214, 195, 0.18);
  border-radius: 0.9rem;
  font-size: 0.82rem;
  line-height: 1.45;
}

.ocr-importer__picker {
  display: flex;
  gap: 0.8rem;
  align-items: center;
  min-height: 5rem;
  padding: 0.9rem 1rem;
  border: 1px dashed rgba(111, 219, 203, 0.45);
  border-radius: 1rem;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.ocr-importer__picker:hover,
.ocr-importer__picker:focus-within {
  background: rgba(40, 151, 139, 0.1);
  border-color: #63decf;
  transform: translateY(-1px);
}

.ocr-importer__picker--ready {
  border-style: solid;
}

.ocr-importer__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ocr-importer__picker-icon {
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  color: #78e5d6;
  background: rgba(77, 203, 185, 0.12);
  border-radius: 0.8rem;
  font-size: 1.5rem;
}

.ocr-importer__picker-copy {
  display: grid;
  gap: 0.2rem;
}

.ocr-importer__picker-copy small {
  color: #8ea8b0;
}

.ocr-importer__preview {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  min-width: 0;
  padding: 0.7rem;
  background: rgba(4, 15, 30, 0.42);
  border-radius: 0.95rem;
}

.ocr-importer__preview img {
  width: 5rem;
  height: 5rem;
  object-fit: cover;
  background: #fff;
  border-radius: 0.7rem;
}

.ocr-importer__preview div {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.ocr-importer__preview strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocr-importer__preview span {
  color: #8ea8b0;
  font-size: 0.8rem;
}

.ocr-importer__error {
  margin: 0;
  padding: 0.75rem 0.9rem;
  color: #ffd8d2;
  background: rgba(182, 63, 50, 0.18);
  border: 1px solid rgba(255, 133, 116, 0.28);
  border-radius: 0.8rem;
}

.ocr-importer__progress {
  display: grid;
  gap: 0.5rem;
}

.ocr-importer__progress div {
  display: flex;
  justify-content: space-between;
  color: #c3dbdf;
  font-size: 0.85rem;
}

.ocr-importer__progress progress {
  width: 100%;
  height: 0.55rem;
  overflow: hidden;
  accent-color: #45cfbd;
  border-radius: 999px;
}

.ocr-importer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.ocr-importer__button {
  min-height: 2.75rem;
  padding: 0.65rem 1rem;
  color: #eafffb;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}

.ocr-importer__button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.ocr-importer__button--primary,
.ocr-importer__button--confirm {
  color: #052b2b;
  background: #71dfd0;
}

.ocr-importer__button--danger {
  color: #ffd8d2;
  border-color: rgba(255, 133, 116, 0.42);
}

.ocr-importer__button--quiet {
  color: #b5cbd0;
  border-color: rgba(170, 202, 207, 0.2);
}

.ocr-importer__review {
  display: grid;
  gap: 0.8rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(153, 205, 207, 0.14);
}

.ocr-importer__review-heading {
  display: flex;
  gap: 1rem;
  align-items: start;
  justify-content: space-between;
}

.ocr-importer__review-heading > span {
  flex: 0 0 auto;
  color: #8ea8b0;
  font-size: 0.78rem;
}

.ocr-importer__label {
  display: block;
  margin-bottom: 0.4rem;
  color: #cfe5e6;
  font-size: 0.82rem;
  font-weight: 750;
}

.ocr-importer__review textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 13rem;
  resize: vertical;
  padding: 0.85rem;
  color: #effffc;
  background: rgba(3, 14, 28, 0.68);
  border: 1px solid rgba(139, 198, 202, 0.25);
  border-radius: 0.85rem;
  font: 0.9rem/1.6 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.ocr-importer__review textarea:focus {
  border-color: #63decf;
  outline: 3px solid rgba(99, 222, 207, 0.12);
}

.ocr-importer__button--confirm {
  justify-self: start;
}

@media (max-width: 700px) {
  .ocr-importer__header {
    grid-template-columns: 1fr;
  }

  .ocr-importer__privacy {
    margin: 0;
  }

  .ocr-importer__button,
  .ocr-importer__button--confirm {
    flex: 1 1 10rem;
    justify-self: stretch;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ocr-importer__picker {
    transition: none;
  }
}
</style>
