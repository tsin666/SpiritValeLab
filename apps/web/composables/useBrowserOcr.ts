import { computed, onScopeDispose, readonly, ref } from 'vue'
import type {
  BrowserOcrErrorCode,
  OcrMachineState,
  OcrPhase,
  OcrReviewDraft
} from '~/types/ocr'
import {
  OcrCancellationBoundary,
  OcrOperationCancelledError,
  OcrOperationCoordinator
} from '~/utils/ocr-operation'

interface OcrWorker {
  recognize(image: Blob): Promise<{ data: { text: string } }>
  terminate(): Promise<unknown>
}

interface OcrLoggerMessage {
  progress?: number
  status?: string
}

type ProgressListener = (message: OcrLoggerMessage) => void

let sharedWorker: OcrWorker | null = null
let sharedWorkerPromise: Promise<OcrWorker> | null = null
let sharedTerminationPromise: Promise<void> | null = null
let browserConsumerCount = 0
const progressListeners = new Set<ProgressListener>()
const operationCoordinator = new OcrOperationCoordinator()

function isBrowserRuntime() {
  return typeof document !== 'undefined'
}

export class BrowserOcrError extends Error {
  readonly code: BrowserOcrErrorCode

  constructor(code: BrowserOcrErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BrowserOcrError'
    this.code = code
  }
}

function publishProgress(message: OcrLoggerMessage) {
  for (const listener of progressListeners) listener(message)
}

async function terminateSharedWorker() {
  if (sharedTerminationPromise) return sharedTerminationPromise

  const initializedWorker = sharedWorker
  const initializingWorker = sharedWorkerPromise
  sharedWorker = null
  sharedWorkerPromise = null

  sharedTerminationPromise = (async () => {
    const worker = initializedWorker || await initializingWorker?.catch(() => null)
    if (worker) await worker.terminate().catch(() => undefined)
    if (sharedWorker === worker) sharedWorker = null
  })().finally(() => {
    sharedTerminationPromise = null
  })

  return sharedTerminationPromise
}

async function getSharedWorker(cancellation: OcrCancellationBoundary) {
  if (!isBrowserRuntime()) {
    throw new BrowserOcrError('client-only', 'OCR runs only inside the browser.')
  }

  if (sharedTerminationPromise) await cancellation.waitFor(sharedTerminationPromise)
  cancellation.throwIfCancelled()
  if (sharedWorker) return sharedWorker
  if (sharedWorkerPromise) return cancellation.waitFor(sharedWorkerPromise)

  const initializationPromise = (async () => {
    const { createWorker, OEM } = await import('tesseract.js')
    const worker = await createWorker(['eng', 'chi_sim'], OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      gzip: true,
      workerBlobURL: false,
      logger: publishProgress
    })
    sharedWorker = worker
    return worker
  })().catch((error) => {
    if (sharedWorkerPromise === initializationPromise) sharedWorkerPromise = null
    throw error
  })
  sharedWorkerPromise = initializationPromise

  return cancellation.waitFor(initializationPromise)
}

function normalizedOcrText(value: string) {
  return value
    .replace(/\f/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function useBrowserOcr() {
  const phase = ref<OcrPhase>('idle')
  const progress = ref(0)
  const statusText = ref('')
  const error = ref<string | null>(null)
  const reviewDraft = ref<OcrReviewDraft | null>(null)
  let localOperationId: symbol | null = null
  let disposed = false

  if (isBrowserRuntime()) browserConsumerCount += 1

  const isBusy = computed(() => ['loading', 'recognizing', 'cancelling'].includes(phase.value))
  const state = computed<OcrMachineState>(() => ({
    phase: phase.value,
    progress: progress.value,
    statusText: statusText.value,
    error: error.value
  }))

  function updateFromWorker(message: OcrLoggerMessage) {
    if (!operationCoordinator.isActive(localOperationId) || disposed) return
    const nextProgress = Number(message.progress)
    if (Number.isFinite(nextProgress)) progress.value = Math.max(0, Math.min(1, nextProgress))
    statusText.value = String(message.status || '')
    if (message.status?.toLowerCase().includes('recognizing')) phase.value = 'recognizing'
    else if (phase.value !== 'cancelling') phase.value = 'loading'
  }

  async function recognize(image: Blob): Promise<OcrReviewDraft> {
    if (!isBrowserRuntime()) {
      throw new BrowserOcrError('client-only', 'OCR runs only inside the browser.')
    }
    if (operationCoordinator.busy) {
      error.value = 'Another OCR job is already running.'
      throw new BrowserOcrError('busy', error.value)
    }

    return operationCoordinator.run(async (operation) => {
      localOperationId = operation.id
      phase.value = 'loading'
      progress.value = 0
      statusText.value = 'loading OCR'
      error.value = null
      reviewDraft.value = null
      progressListeners.add(updateFromWorker)

      try {
        const worker = await getSharedWorker(operation.cancellation)

        phase.value = 'recognizing'
        statusText.value = 'recognizing text'
        const result = await operation.cancellation.waitFor(worker.recognize(image))

        const draft = { text: normalizedOcrText(result.data.text || '') }
        reviewDraft.value = draft
        phase.value = 'review'
        progress.value = 1
        statusText.value = 'ready for review'
        return draft
      } catch (caught) {
        if (caught instanceof OcrOperationCancelledError) {
          phase.value = 'cancelled'
          progress.value = 0
          statusText.value = 'cancelled'
          throw new BrowserOcrError('cancelled', 'OCR was cancelled.', { cause: caught })
        }

        // A failed worker is not safe to reuse. Tear it down in the background
        // so the next reviewed screenshot gets a fresh worker instance.
        void terminateSharedWorker().catch(() => undefined)
        const message = caught instanceof Error ? caught.message : 'OCR failed.'
        error.value = message
        phase.value = 'error'
        statusText.value = ''
        throw new BrowserOcrError('worker-failed', message, { cause: caught })
      } finally {
        progressListeners.delete(updateFromWorker)
        if (localOperationId === operation.id) localOperationId = null
      }
    })
  }

  async function cancel() {
    const operationId = localOperationId
    if (!operationId || !operationCoordinator.isActive(operationId)) return

    phase.value = 'cancelling'
    statusText.value = 'cancelling'
    // coordinator.cancel signals synchronously. It settles the local await via
    // the cancellation boundary while worker teardown continues independently.
    const operationFinished = operationCoordinator.cancel(operationId)
    void terminateSharedWorker().catch(() => undefined)
    await operationFinished

    if (!localOperationId || localOperationId === operationId) {
      phase.value = 'cancelled'
      progress.value = 0
      statusText.value = 'cancelled'
    }
  }

  async function terminate() {
    if (operationCoordinator.busy && !operationCoordinator.isActive(localOperationId)) {
      throw new BrowserOcrError('busy', 'Another OCR job is already running.')
    }
    if (localOperationId) await cancel()
    await terminateSharedWorker()
  }

  function reset() {
    if (isBusy.value) return
    phase.value = 'idle'
    progress.value = 0
    statusText.value = ''
    error.value = null
    reviewDraft.value = null
  }

  onScopeDispose(() => {
    disposed = true
    progressListeners.delete(updateFromWorker)

    if (isBrowserRuntime()) {
      browserConsumerCount = Math.max(0, browserConsumerCount - 1)
      if (localOperationId) void cancel()
      else if (browserConsumerCount === 0) void terminateSharedWorker()
    }
  })

  return {
    state,
    phase: readonly(phase),
    progress: readonly(progress),
    statusText: readonly(statusText),
    error: readonly(error),
    reviewDraft: readonly(reviewDraft),
    isBusy,
    recognize,
    cancel,
    terminate,
    reset
  }
}
