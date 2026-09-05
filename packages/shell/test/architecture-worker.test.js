import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createRecommendationWorkerService } from '../browser/recommendation/recommendation-worker-service'

class Worker extends EventEmitter {
  messages = []
  postMessage(message) {
    this.messages.push(message)
  }
  terminate() {
    this.terminated = true
    return Promise.resolve(0)
  }
  complete() {
    const message = this.messages.at(-1)
    this.emit('message', {
      type: 'recommendation:result',
      id: message.id,
      result: message.operation,
    })
  }
}

test('a fleet timeout leaves expedition and ledger requests alive', async () => {
  const workers = new Map(),
    logs = []
  const service = createRecommendationWorkerService({
    createWorker: (operation) => {
      const worker = new Worker()
      workers.set(operation, worker)
      return worker
    },
    logger: (event, data) => logs.push({ event, data }),
    timeoutMs: 1000,
  })
  try {
    const failed = assert.rejects(service.recommend({}, { timeoutMs: 5 }), /timed out/)
    const expedition = service.planExpeditions({}),
      ledger = service.summarizeResourceLedger({})
    // Attach rejection handlers before waiting, including with the pre-fix implementation.
    const others = Promise.allSettled([expedition, ledger])
    await failed
    workers.get('expedition')?.complete()
    workers.get('resource-ledger')?.complete()
    assert.deepEqual(
      (await others).map((result) => result.status),
      ['fulfilled', 'fulfilled'],
    )
    assert.equal(
      logs.find((log) => log.event === 'recommendation.worker-timeout').data.operation,
      'fleet',
    )
  } finally {
    await service.dispose()
  }
})

test('bounded queues recover after failure without consuming execution timeout while waiting', async () => {
  const workers = [],
    logs = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new Worker()
      workers.push(worker)
      return worker
    },
    maxQueueSize: 1,
    logger: (event, data) => logs.push({ event, data }),
  })
  try {
    const first = assert.rejects(service.recommend({}, { timeoutMs: 20 }), /timed out/)
    const second = service.recommend({}, { timeoutMs: 10 })
    await assert.rejects(service.recommend({}), { code: 'WORKER_QUEUE_FULL' })
    await first
    workers.at(-1).complete()
    assert.equal(await second, 'fleet')
    assert.equal(workers.length, 2)
    assert.ok(
      logs.some(
        (log) => log.event === 'recommendation.worker-completed' && log.data.queueWaitMs >= 0,
      ),
    )
  } finally {
    await service.dispose()
  }
})

test('dispose rejects queued requests, removes listeners and never creates another worker', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const w = new Worker()
      workers.push(w)
      return w
    },
    logger: () => {},
  })
  const pending = Promise.allSettled([service.recommend({}), service.recommend({})])
  await service.dispose()
  assert.deepEqual(
    (await pending).map((result) => result.status),
    ['rejected', 'rejected'],
  )
  await assert.rejects(service.recommend({}), /disposed/)
  assert.equal(workers.length, 1)
  assert.equal(workers[0].listenerCount('message'), 0)
})

test('queue timeout leaves the active request running and idle workers are reclaimed', async () => {
  const workers = [],
    logs = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const w = new Worker()
      workers.push(w)
      return w
    },
    logger: (event, data) => logs.push({ event, data }),
    idleTimeoutMs: 5,
  })
  try {
    const active = service.recommend({})
    await assert.rejects(service.recommend({}, { queueTimeoutMs: 5 }), {
      code: 'WORKER_QUEUE_TIMEOUT',
    })
    workers[0].complete()
    assert.equal(await active, 'fleet')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(workers[0].terminated, true)
    assert.ok(logs.some((log) => log.event === 'recommendation.worker-idle-disposed'))
    assert.ok(
      logs.some(
        (log) =>
          log.event === 'recommendation.worker-queue-timeout' && log.data.operation === 'fleet',
      ),
    )
  } finally {
    await service.dispose()
  }
})
test('creation, dispatch and termination errors remain observable', async () => {
  const logs = []
  let attempts = 0
  const service = createRecommendationWorkerService({
    logger: (event, data) => logs.push({ event, data }),
    createWorker: () => {
      if (++attempts === 1) throw new Error('create fixture')
      const worker = new Worker()
      worker.postMessage = () => {
        throw new Error('clone fixture')
      }
      worker.terminate = () => Promise.reject(new Error('terminate fixture'))
      return worker
    },
  })
  await assert.rejects(service.recommend({}), /create fixture/)
  await assert.rejects(service.recommend({}), /clone fixture/)
  await service.dispose()
  assert.equal(
    logs.filter((log) => log.event === 'recommendation.worker-dispatch-failed').length,
    2,
  )
  assert.ok(
    logs.some(
      (log) =>
        log.event === 'recommendation.worker-termination-failed' &&
        log.data.reasonCode === 'WORKER_TERMINATION_FAILED',
    ),
  )
})

test('unexpected worker exit preserves queued work and ignores the old worker results', async () => {
  const workers = [],
    logs = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new Worker()
      workers.push(worker)
      return worker
    },
    logger: (event, data) => logs.push({ event, data }),
  })
  try {
    const first = assert.rejects(service.recommend({}), { code: 'WORKER_EXITED' })
    const queued = service.recommend({})
    workers[0].emit('exit', 7)
    await first
    workers[0].complete()
    workers[1].complete()
    assert.equal(await queued, 'fleet')
    assert.ok(logs.some((log) => log.event === 'recommendation.worker-exit' && log.data.code === 7))
  } finally {
    await service.dispose()
  }
})
