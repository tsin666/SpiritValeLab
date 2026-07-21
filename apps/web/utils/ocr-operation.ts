const CANCELLED_OUTCOME = Symbol('ocr-operation-cancelled')

export class OcrOperationCancelledError extends Error {
  constructor(message = 'OCR operation was cancelled.') {
    super(message)
    this.name = 'OcrOperationCancelledError'
  }
}

export class OcrOperationBusyError extends Error {
  constructor(message = 'Another OCR operation is already running.') {
    super(message)
    this.name = 'OcrOperationBusyError'
  }
}

/**
 * A cancellation boundary for promises that cannot be cancelled themselves.
 *
 * Tesseract terminates its Worker without settling jobs that were already sent
 * to that Worker. Racing every external wait against this local signal keeps
 * our state machine bounded even when the abandoned library promise never
 * resolves. Promise.race also installs rejection handlers on the abandoned
 * promise, so a late worker failure cannot become an unhandled rejection.
 */
export class OcrCancellationBoundary {
  readonly #cancelledPromise: Promise<typeof CANCELLED_OUTCOME>
  #resolveCancelled!: (outcome: typeof CANCELLED_OUTCOME) => void
  #cancelled = false

  constructor() {
    this.#cancelledPromise = new Promise((resolve) => {
      this.#resolveCancelled = resolve
    })
  }

  get cancelled() {
    return this.#cancelled
  }

  cancel() {
    if (this.#cancelled) return false
    this.#cancelled = true
    this.#resolveCancelled(CANCELLED_OUTCOME)
    return true
  }

  throwIfCancelled() {
    if (this.#cancelled) throw new OcrOperationCancelledError()
  }

  async waitFor<T>(promise: PromiseLike<T>): Promise<T> {
    this.throwIfCancelled()

    const outcome = await Promise.race([
      Promise.resolve(promise).then(value => ({ value })),
      this.#cancelledPromise
    ])

    if (outcome === CANCELLED_OUTCOME) throw new OcrOperationCancelledError()
    return outcome.value
  }
}

export interface OcrOperationContext {
  readonly id: symbol
  readonly cancellation: OcrCancellationBoundary
}

interface ActiveOcrOperation extends OcrOperationContext {
  readonly finished: Promise<void>
  finish: () => void
}

/**
 * Coordinates the single shared OCR Worker without depending on Vue or any
 * browser API. Keeping exclusivity and cancellation here makes the important
 * retry guarantees directly testable in Node.
 */
export class OcrOperationCoordinator {
  #active: ActiveOcrOperation | null = null

  get busy() {
    return this.#active !== null
  }

  isActive(id: symbol | null) {
    return Boolean(id && this.#active?.id === id)
  }

  async run<T>(work: (operation: OcrOperationContext) => Promise<T>): Promise<T> {
    if (this.#active) throw new OcrOperationBusyError()

    let resolveFinished!: () => void
    const operation: ActiveOcrOperation = {
      id: Symbol('ocr-operation'),
      cancellation: new OcrCancellationBoundary(),
      finished: new Promise(resolve => {
        resolveFinished = resolve
      }),
      finish: resolveFinished
    }
    this.#active = operation

    try {
      return await work(operation)
    } finally {
      if (this.#active === operation) this.#active = null
      operation.finish()
    }
  }

  async cancel(id: symbol): Promise<boolean> {
    const operation = this.#active
    if (!operation || operation.id !== id) return false

    operation.cancellation.cancel()
    await operation.finished
    return true
  }
}
