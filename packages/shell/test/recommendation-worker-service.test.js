import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { ACCOUNT_CHANNEL, RECOMMEND_CHANNEL } from '../browser/recommendation/channels.js'
import { registerRecommendationIpc } from '../browser/recommendation/recommendation-ipc.js'
import {
  readKC3AccountSnapshot,
  readKC3CombatEvaluations,
} from '../browser/recommendation/kc3-bridge.js'
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

  service.warmUp()
  assert.equal(workers.length, 1)
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

test('fleet recommendations reuse the KC3 account snapshot until an explicit refresh', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const recommendedSnapshots = []
  const candidateLimits = []
  let snapshotCount = 0

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => {
      snapshotCount += 1
      return {
        generatedAt: `2026-08-26T00:00:0${snapshotCount}.000Z`,
        ships: Array.from({ length: snapshotCount }, (_, index) => ({ id: index + 1 })),
        equipment: [],
        metadata: { capabilities: {} },
      }
    },
    recommend: async (input) => {
      recommendedSnapshots.push(input.account)
      candidateLimits.push(input.candidateLimit)
      return {
        status: 'no-solution',
        analysis: { reasons: [] },
        elapsedMs: 0,
        solverVersion: 'fixture',
      }
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const accountResult = await handlers.get(ACCOUNT_CHANNEL)(event)
  const firstResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'balanced',
    avoidCurrentFleetEquipment: false,
  })
  const secondResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
    avoidCurrentFleetEquipment: false,
  })
  const cachedResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
    avoidCurrentFleetEquipment: false,
  })
  const refreshedAccountResult = await handlers.get(ACCOUNT_CHANNEL)(event, {
    forceRefresh: true,
  })
  const refreshedResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
    avoidCurrentFleetEquipment: false,
  })

  assert.equal(accountResult.account.shipCount, 1)
  assert.deepEqual(
    recommendedSnapshots.map((snapshot) => snapshot.ships.length),
    [1, 1, 2],
  )
  assert.equal(firstResult.account.shipCount, 1)
  assert.equal(secondResult.account.shipCount, 1)
  assert.equal(cachedResult.account.shipCount, 1)
  assert.equal(refreshedAccountResult.account.shipCount, 2)
  assert.equal(refreshedResult.account.shipCount, 2)
  assert.equal(snapshotCount, 2)
  assert.deepEqual(candidateLimits, [18, 18, 18])
})

test('KC3 account snapshot yields between expensive renderer batches', async () => {
  let script = ''
  const webContents = {
    executeJavaScript: async (source) => {
      script = source
      throw new Error('fixture stop')
    },
  }

  await assert.rejects(readKC3AccountSnapshot(webContents), /fixture stop/)
  assert.match(script, /^\(async \(\) => \{/)
  assert.match(script, /await mapResponsively\(shipList/)
  assert.match(script, /await mapResponsively\(gearList/)
  assert.match(script, /window\.setTimeout\(resolve, 0\)/)
  assert.doesNotThrow(() => new Function(script))
})

test('KC3 combat evaluation probes complete loadouts with current KC3 formulas', async () => {
  let script = ''
  const webContents = {
    executeJavaScript: async (source) => {
      script = source
      return []
    },
  }
  const result = await readKC3CombatEvaluations(webContents, [
    {
      id: 'fixture',
      mapId: '4-5',
      route: { tags: ['anti-installation'] },
      ships: [
        {
          ship: {
            id: 7,
            level: 99,
            stats: { hp: 50, firepower: 60, torpedo: 40, armor: 70, evasion: 80, asw: 20 },
            slotSizes: [18, 12],
          },
          equipment: [
            { id: 101, masterId: 1001, improvement: 7, proficiency: 0 },
            { id: 102, masterId: 1002, improvement: 0, proficiency: 7 },
          ],
          expansionSlot: { id: 103, masterId: 1003, improvement: 0, proficiency: -1 },
        },
      ],
    },
    {
      id: 'equivalent-instance-fixture',
      mapId: '4-5',
      route: { tags: ['anti-installation'] },
      ships: [
        {
          ship: {
            id: 7,
            level: 99,
            stats: { hp: 50, firepower: 60, torpedo: 40, armor: 70, evasion: 80, asw: 20 },
            slotSizes: [18, 12],
          },
          equipment: [
            { id: 201, masterId: 1001, improvement: 7, proficiency: 0 },
            { id: 202, masterId: 1002, improvement: 0, proficiency: 7 },
          ],
          expansionSlot: { id: 203, masterId: 1003, improvement: 0, proficiency: -1 },
        },
      ],
    },
  ])

  assert.deepEqual(result, [])
  assert.match(script, /equipmentTotalStats/)
  assert.match(script, /['"]both['"]/)
  assert.match(script, /shellingAccuracy/)
  assert.match(script, /antiLandWarfarePowerMods|applyPrecapModifiers/)
  assert.match(script, /antiSubWarfarePower/)
  assert.match(script, /"equipmentIds":\[101,102\]/)
  assert.match(script, /__dameconCombatEvaluationCache/)
  assert.equal(script.match(/"shipId":7/g)?.length, 1)
  assert.doesNotThrow(() => new Function(script))
})
