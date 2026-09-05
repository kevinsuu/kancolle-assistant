const DEFAULT_TIMEOUT_MS = 30_000
const failure = (code, message) => Object.assign(new Error(message), { code })
const errorMessage = (error) =>
  String(error?.message || error)
    .replace(/\s+/g, ' ')
    .slice(0, 240)

// Each operation owns a lazy worker and a bounded FIFO. A failed execution is never replayed.
export const createRecommendationWorkerService = ({
  createWorker,
  logger = () => {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  queueTimeoutMs = DEFAULT_TIMEOUT_MS,
  maxQueueSize = 16,
  idleTimeoutMs = 60_000,
}) => {
  const lanes = new Map()
  const terminations = new Set()
  let nextRequestId = 1
  let disposed = false
  const fields = (lane, request) => ({
    operation: lane.operation,
    ...(lane.operation === 'maintenance' ? { task: request?.input?.operation } : {}),
    requestId: request?.id,
    queueDepth: lane.queue.length,
    queueWaitMs: request ? (request.startedAt ?? Date.now()) - request.enqueuedAt : 0,
    executionMs: request?.startedAt ? Date.now() - request.startedAt : 0,
  })
  const terminate = (lane) => {
    clearTimeout(lane.idleTimer)
    const worker = lane.worker
    lane.worker = null
    if (!worker) return
    worker.removeAllListeners()
    const promise = Promise.resolve()
      .then(() => worker.terminate())
      .catch((error) => {
        logger('recommendation.worker-termination-failed', {
          operation: lane.operation,
          reasonCode: 'WORKER_TERMINATION_FAILED',
          message: errorMessage(error),
          outcome: 'failed',
        })
      })
    terminations.add(promise)
    promise.then(() => terminations.delete(promise))
  }
  const finish = (lane, error, result, discard = false) => {
    const request = lane.active
    lane.active = null
    if (discard) terminate(lane)
    if (request) {
      clearTimeout(request.timer)
      logger('recommendation.worker-completed', {
        ...fields(lane, request),
        outcome: error ? 'failed' : 'success',
        reasonCode: error?.code ?? (error ? 'WORKER_FAILED' : null),
        affectedRequestCount: 1,
      })
      if (error) request.reject(error)
      else request.resolve(result)
    }
    pump(lane)
    if (!lane.active && !lane.queue.length && lane.worker) {
      lane.idleTimer = setTimeout(() => {
        logger('recommendation.worker-idle-disposed', {
          operation: lane.operation,
          idleTimeoutMs,
          outcome: 'disposed',
        })
        terminate(lane)
      }, idleTimeoutMs)
      lane.idleTimer.unref?.()
    }
  }
  const pump = (lane) => {
    if (disposed || lane.active || !lane.queue.length) return
    clearTimeout(lane.idleTimer)
    const request = lane.queue.shift()
    clearTimeout(request.timer)
    lane.active = request
    request.startedAt = Date.now()
    try {
      if (!lane.worker) {
        const worker = createWorker(lane.operation)
        lane.worker = worker
        worker.on('message', (message) => {
          if (lane.worker !== worker || message?.id !== lane.active?.id) return
          if (message.type === 'recommendation:result') finish(lane, null, message.result)
          else if (message.type === 'recommendation:error')
            finish(
              lane,
              failure(
                message.error?.code || 'WORKER_OPERATION_FAILED',
                errorMessage(message.error),
              ),
            )
        })
        worker.on('error', (error) => {
          if (lane.worker !== worker) return
          logger('recommendation.worker-error', {
            ...fields(lane, lane.active),
            message: errorMessage(error),
            outcome: 'failed',
          })
          finish(lane, failure('WORKER_FAILED', errorMessage(error)), null, true)
        })
        worker.on('exit', (code) => {
          if (lane.worker !== worker || disposed) return
          logger('recommendation.worker-exit', {
            ...fields(lane, lane.active),
            code,
            outcome: 'failed',
          })
          finish(
            lane,
            failure('WORKER_EXITED', `Recommendation worker exited with code ${code}`),
            null,
            true,
          )
        })
      }
      request.timer = setTimeout(() => {
        logger('recommendation.worker-timeout', {
          ...fields(lane, request),
          timeoutMs: request.timeoutMs,
          reasonCode: 'WORKER_TIMEOUT',
          outcome: 'failed',
          affectedRequestCount: 1,
        })
        finish(
          lane,
          failure('WORKER_TIMEOUT', `Recommendation worker timed out after ${request.timeoutMs}ms`),
          null,
          true,
        )
      }, request.timeoutMs)
      lane.worker.postMessage({
        type: 'recommendation:run',
        id: request.id,
        operation: lane.operation,
        input: request.input,
      })
    } catch (error) {
      logger('recommendation.worker-dispatch-failed', {
        ...fields(lane, request),
        outcome: 'failed',
        message: errorMessage(error),
      })
      finish(lane, failure('WORKER_UNAVAILABLE', errorMessage(error)), null, true)
    }
  }
  const run = (operation, input, options = {}) =>
    new Promise((resolve, reject) => {
      if (disposed)
        return reject(failure('WORKER_DISPOSED', 'Recommendation worker service has been disposed'))
      if (!lanes.has(operation))
        lanes.set(operation, { operation, queue: [], active: null, worker: null })
      const lane = lanes.get(operation)
      if (lane.active && lane.queue.length >= maxQueueSize) {
        logger('recommendation.worker-queue-full', {
          ...fields(lane),
          limit: maxQueueSize,
          outcome: 'rejected',
          reasonCode: 'WORKER_QUEUE_FULL',
        })
        return reject(failure('WORKER_QUEUE_FULL', 'Recommendation worker queue is full'))
      }
      const request = {
        id: nextRequestId++,
        input,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timeoutMs: options.timeoutMs ?? timeoutMs,
      }
      request.timer = setTimeout(() => {
        const index = lane.queue.indexOf(request)
        if (index < 0) return
        lane.queue.splice(index, 1)
        logger('recommendation.worker-queue-timeout', {
          ...fields(lane, request),
          outcome: 'rejected',
          reasonCode: 'WORKER_QUEUE_TIMEOUT',
        })
        reject(failure('WORKER_QUEUE_TIMEOUT', 'Recommendation worker queue wait timed out'))
      }, options.queueTimeoutMs ?? queueTimeoutMs)
      lane.queue.push(request)
      pump(lane)
    })
  const dispose = () => {
    disposed = true
    for (const lane of lanes.values()) {
      const requests = [...lane.queue, ...(lane.active ? [lane.active] : [])]
      logger('recommendation.worker-disposed', {
        operation: lane.operation,
        affectedRequestCount: requests.length,
        outcome: 'disposed',
      })
      lane.queue = []
      lane.active = null
      for (const request of requests) {
        clearTimeout(request.timer)
        request.reject(failure('WORKER_DISPOSED', 'Recommendation worker service disposed'))
      }
      terminate(lane)
    }
    return Promise.all([...terminations])
  }
  const recommendFleet = (input, options) => run('fleet', input, options)
  return {
    runMaintenance: (input, options) => run('maintenance', input, options),
    recommend: recommendFleet,
    recommendFleet,
    planExpeditions: (input, options) => run('expedition', input, options),
    summarizeResourceLedger: (input, options) => run('resource-ledger', input, options),
    dispose,
  }
}
