import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  OcrOperationBusyError,
  OcrOperationCancelledError,
  OcrOperationCoordinator
} from '../utils/ocr-operation.ts'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function within<T>(promise: Promise<T>, milliseconds = 200): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Operation did not settle within ${milliseconds}ms.`)), milliseconds)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

test('cancelling during worker initialization settles the task and releases exclusivity', async () => {
  const coordinator = new OcrOperationCoordinator()
  const initialization = deferred<object>()
  let operationId: symbol | undefined

  const task = coordinator.run(async (operation) => {
    operationId = operation.id
    return operation.cancellation.waitFor(initialization.promise)
  })

  assert.ok(operationId)
  const cancellation = coordinator.cancel(operationId)

  await assert.rejects(within(task), OcrOperationCancelledError)
  assert.equal(await within(cancellation), true)
  assert.equal(coordinator.busy, false)

  // A library initialization may finish after our cancellation boundary won.
  // Its late settlement must not change the coordinator back to busy.
  initialization.resolve({})
  await Promise.resolve()
  assert.equal(coordinator.busy, false)
})

test('cancelling a pending recognition settles even when the library job never does', async () => {
  const coordinator = new OcrOperationCoordinator()
  const recognition = deferred<string>()
  const recognitionStarted = deferred<void>()
  let operationId: symbol | undefined

  const task = coordinator.run(async (operation) => {
    operationId = operation.id
    await operation.cancellation.waitFor(Promise.resolve('worker'))
    recognitionStarted.resolve()
    return operation.cancellation.waitFor(recognition.promise)
  })

  await recognitionStarted.promise
  assert.ok(operationId)
  const cancellation = coordinator.cancel(operationId)

  await assert.rejects(within(task), OcrOperationCancelledError)
  assert.equal(await within(cancellation), true)
  assert.equal(coordinator.busy, false)
})

test('unmount-style cancellation is idempotent and a new recognition can run', async () => {
  const coordinator = new OcrOperationCoordinator()
  const abandonedJob = deferred<string>()
  let firstOperationId: symbol | undefined

  const firstTask = coordinator.run(async (operation) => {
    firstOperationId = operation.id
    return operation.cancellation.waitFor(abandonedJob.promise)
  })

  assert.ok(firstOperationId)
  const firstCancellation = coordinator.cancel(firstOperationId)
  const duplicateCancellation = coordinator.cancel(firstOperationId)
  await assert.rejects(within(firstTask), OcrOperationCancelledError)
  assert.equal(await within(firstCancellation), true)
  assert.equal(await within(duplicateCancellation), true)

  const nextResult = await within(coordinator.run(async (operation) => (
    operation.cancellation.waitFor(Promise.resolve('recognized after retry'))
  )))
  assert.equal(nextResult, 'recognized after retry')
  assert.equal(coordinator.busy, false)
})

test('only the owner can cancel and concurrent runs remain rejected', async () => {
  const coordinator = new OcrOperationCoordinator()
  const pending = deferred<void>()
  let operationId: symbol | undefined

  const task = coordinator.run(async (operation) => {
    operationId = operation.id
    return operation.cancellation.waitFor(pending.promise)
  })

  assert.ok(operationId)
  assert.equal(await coordinator.cancel(Symbol('not-the-owner')), false)
  await assert.rejects(
    coordinator.run(async () => 'unexpected'),
    OcrOperationBusyError
  )

  const cancellation = coordinator.cancel(operationId)
  await assert.rejects(within(task), OcrOperationCancelledError)
  assert.equal(await within(cancellation), true)
})
