const DEFAULT_TIMEOUT_MS = 30_000

const asError = (value, fallback) =>
  value instanceof Error ? value : new Error(value?.message || String(value || fallback))

export const createRecommendationWorkerService = ({ createWorker, logger, timeoutMs }) => {
  const pending = new Map()
  const requestTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS
  let nextRequestId = 1
  let worker = null
  let disposed = false

  const rejectPending = (error) => {
    pending.forEach(({ reject, timer }) => {
      clearTimeout(timer)
      reject(error)
    })
    pending.clear()
  }

  const discardWorker = (error, targetWorker = worker) => {
    if (!targetWorker || targetWorker !== worker) return
    worker = null
    targetWorker.removeAllListeners()
    rejectPending(error)
    Promise.resolve(targetWorker.terminate()).catch(() => {})
  }

  const getWorker = () => {
    if (disposed) throw new Error('Recommendation worker service has been disposed')
    if (worker) return worker

    const nextWorker = createWorker()
    worker = nextWorker
    nextWorker.on('message', (message) => {
      if (!message || typeof message.id !== 'number') return
      const request = pending.get(message.id)
      if (!request) return
      clearTimeout(request.timer)
      pending.delete(message.id)
      if (message.type === 'recommendation:result') request.resolve(message.result)
      else request.reject(asError(message.error, 'Recommendation worker failed'))
    })
    nextWorker.on('error', (error) => {
      logger('recommendation.worker-error', { message: error?.message || String(error) })
      discardWorker(asError(error, 'Recommendation worker failed'), nextWorker)
    })
    nextWorker.on('exit', (code) => {
      if (nextWorker !== worker || disposed) return
      const error = new Error(`Recommendation worker exited with code ${code}`)
      logger('recommendation.worker-exit', { code })
      discardWorker(error, nextWorker)
    })
    return nextWorker
  }

  const run = (operation, input) =>
    new Promise((resolve, reject) => {
      const requestId = nextRequestId
      nextRequestId += 1
      let targetWorker
      try {
        targetWorker = getWorker()
      } catch (error) {
        reject(asError(error, 'Recommendation worker unavailable'))
        return
      }
      const timer = setTimeout(() => {
        const error = new Error(`Recommendation worker timed out after ${requestTimeoutMs}ms`)
        logger('recommendation.worker-timeout', { requestId, timeoutMs: requestTimeoutMs })
        discardWorker(error, targetWorker)
      }, requestTimeoutMs)
      pending.set(requestId, { resolve, reject, timer })
      try {
        targetWorker.postMessage({ type: 'recommendation:run', id: requestId, operation, input })
      } catch (error) {
        discardWorker(asError(error, 'Recommendation worker unavailable'), targetWorker)
      }
    })

  const dispose = () => {
    disposed = true
    if (worker) discardWorker(new Error('Recommendation worker service disposed'), worker)
  }

  const recommendFleet = (input) => run('fleet', input)
  return {
    warmUp: () => {
      getWorker()
    },
    recommend: recommendFleet,
    recommendFleet,
    planExpeditions: (input) => run('expedition', input),
    summarizeResourceLedger: (input) => run('resource-ledger', input),
    dispose,
  }
}
