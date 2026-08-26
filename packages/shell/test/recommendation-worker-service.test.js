import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createRecommendationWorkerService } from '../browser/recommendation/recommendation-worker-service.js'

class WorkerDouble extends EventEmitter {
  constructor(handler) {
    super()
    this.handler = handler
    this.messages = []
    this.terminated = false
  }

  postMessage(message) {
    this.messages.push(message)
    this.handler?.(this, message)
  }

  terminate() {
    this.terminated = true
    return Promise.resolve(0)
  }
}

test('recommendation worker service shares IDs and one worker across all operations', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new WorkerDouble((target, message) =>
        queueMicrotask(() =>
          target.emit('message', {
            type: 'recommendation:result',
            id: message.id,
            result: { operation: message.operation, input: message.input },
          }),
        ),
      )
      workers.push(worker)
      return worker
    },
    logger: () => {},
  })

  assert.deepEqual(await service.recommendFleet({ value: 1 }), {
    operation: 'fleet',
    input: { value: 1 },
  })
  assert.deepEqual(await service.planExpeditions({ value: 2 }), {
    operation: 'expedition',
    input: { value: 2 },
  })
  assert.deepEqual(await service.summarizeResourceLedger({ value: 3 }), {
    operation: 'resource-ledger',
    input: { value: 3 },
  })
  assert.deepEqual(
    workers[0].messages.map(({ id, operation }) => ({ id, operation })),
    [
      { id: 1, operation: 'fleet' },
      { id: 2, operation: 'expedition' },
      { id: 3, operation: 'resource-ledger' },
    ],
  )
  assert.equal(workers.length, 1)
  service.dispose()
  assert.equal(workers[0].terminated, true)
})

test('recommendation worker service rebuilds after a worker error', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new WorkerDouble((target, message) => {
        if (workers.length === 1) {
          queueMicrotask(() => target.emit('error', new Error('fixture failure')))
          return
        }
        queueMicrotask(() =>
          target.emit('message', {
            type: 'recommendation:result',
            id: message.id,
            result: 'recovered',
          }),
        )
      })
      workers.push(worker)
      return worker
    },
    logger: () => {},
  })

  await assert.rejects(service.recommendFleet({}), /fixture failure/)
  assert.equal(await service.planExpeditions({}), 'recovered')
  assert.equal(workers.length, 2)
  assert.equal(workers[0].terminated, true)
  service.dispose()
})
