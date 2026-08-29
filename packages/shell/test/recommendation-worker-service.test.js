import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  ACCOUNT_CHANNEL,
  EXPEDITION_PLAN_CHANNEL,
  RECOMMEND_CHANNEL,
} from '../browser/recommendation/channels.js'
import {
  applyCombatEvaluations,
  registerRecommendationIpc,
} from '../browser/recommendation/recommendation-ipc.js'
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

test('recommendation worker service supports per-request timeout overrides', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new WorkerDouble((target, message) => {
        if (workers.length === 1) return
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
    timeoutMs: 50,
  })

  await assert.rejects(service.recommendFleet({}, { timeoutMs: 1 }), /timed out after 1ms/)
  assert.equal(workers[0].terminated, true)
  assert.equal(await service.planExpeditions({}), 'recovered')
  assert.equal(workers.length, 2)
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
  const recommendationInputs = []
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
      recommendationInputs.push(input)
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
  })
  const secondResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
  })
  const cachedResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
  })
  const selectedRouteResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'boss-clear',
  })
  const refreshedAccountResult = await handlers.get(ACCOUNT_CHANNEL)(event, {
    forceRefresh: true,
  })
  const refreshedResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
  })

  assert.equal(accountResult.account.shipCount, 1)
  assert.deepEqual(
    recommendationInputs
      .filter((input) => !input.routeId && input.candidateLimit !== 1)
      .map((input) => input.account.ships.length),
    [1, 1, 2],
  )
  assert.equal(firstResult.account.shipCount, 1)
  assert.equal(secondResult.account.shipCount, 1)
  assert.equal(cachedResult.account.shipCount, 1)
  assert.equal(selectedRouteResult.account.shipCount, 1)
  assert.equal(refreshedAccountResult.account.shipCount, 2)
  assert.equal(refreshedResult.account.shipCount, 2)
  assert.equal(snapshotCount, 2)
  assert.deepEqual(
    recommendationInputs
      .filter((input) => !input.routeId && input.candidateLimit !== 1)
      .map((input) => input.candidateLimit),
    [18, 18, 18],
  )
})

test('foreground selected-route recommendations log slow work but wait for the result', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const strategySender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const strategyEvent = {
    sender: strategySender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const recommendationInputs = []
  let resolveRecommendation

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    recommendationSlowThresholdMs: 1,
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async (input) => {
      recommendationInputs.push(input)
      return new Promise((resolve) => {
        resolveRecommendation = resolve
      })
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  let settled = false
  const resultPromise = handlers
    .get(RECOMMEND_CHANNEL)(strategyEvent, {
      mapId: '1-1',
      routeId: '1-1-guide-dd4',
      objective: 'balanced',
    })
    .finally(() => {
      settled = true
    })

  await new Promise((resolve) => setTimeout(resolve, 5))

  assert.equal(settled, false)
  assert.equal(recommendationInputs.length, 1)
  assert.equal(recommendationInputs[0].routeId, '1-1-guide-dd4')
  assert.equal(recommendationInputs[0].candidateLimit, 3)
  assert.equal(
    logs.some((log) => log.eventName === 'recommendation.slow'),
    true,
  )

  resolveRecommendation({
    status: 'no-solution',
    analysis: {
      reasons: [
        {
          code: 'AIR_POWER_INSUFFICIENT',
          values: { best: 412, minimum: 430 },
        },
      ],
    },
    diagnostics: {
      routeCandidateCount: 1,
      availableRouteCount: 1,
      evaluatedFleetCandidateCount: 6,
      gearSolutionCount: 18,
      recommendationCandidateCount: 0,
      bestAirPower: 412,
      airPowerMinimum: 430,
      reasonCodes: ['AIR_POWER_INSUFFICIENT'],
    },
    elapsedMs: 5,
    solverVersion: 'fixture',
  })

  const result = await resultPromise

  assert.equal(result.status, 'no-solution')
  assert.equal(result.account.shipCount, 1)
  assert.equal(
    logs.some((log) => log.eventName === 'recommendation.request-slow-completed'),
    true,
  )
  const completed = logs.find((log) => log.eventName === 'recommendation.completed')
  assert.equal(completed.data.routeId, '1-1-guide-dd4')
  assert.equal(completed.data.evaluatedFleetCandidateCount, 6)
  assert.equal(completed.data.gearSolutionCount, 18)
  assert.equal(completed.data.bestAirPower, 412)
  assert.equal(completed.data.airPowerMinimum, 430)
  assert.deepEqual(completed.data.reasonCodes, ['AIR_POWER_INSUFFICIENT'])
})

test('successful recommendation logs bounded solver diagnostics', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const event = {
    sender: { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' },
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    readCombatEvaluations: async () => [],
    recommend: async () => ({
      status: 'success',
      recommendations: [],
      diagnostics: {
        routeCandidateCount: 1,
        availableRouteCount: 1,
        evaluatedFleetCandidateCount: 4,
        gearSolutionCount: 12,
        recommendationCandidateCount: 3,
        bestAirPower: 448,
        airPowerMinimum: 430,
        reasonCodes: [],
      },
      elapsedMs: 8,
      solverVersion: 'fixture',
    }),
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  const result = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'balanced',
  })

  assert.equal(result.status, 'success')
  const completed = logs.find((log) => log.eventName === 'recommendation.completed')
  assert.equal(completed.data.evaluatedFleetCandidateCount, 4)
  assert.equal(completed.data.gearSolutionCount, 12)
  assert.equal(completed.data.recommendationCandidateCount, 3)
  assert.equal(completed.data.bestAirPower, 448)
  assert.equal(completed.data.airPowerMinimum, 430)
  assert.deepEqual(completed.data.reasonCodes, [])
})

test('selected opening-ASW routes retain the full KC3 validation candidate pool', async () => {
  const handlers = new Map()
  const inputs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const event = {
    sender: { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' },
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async (input) => {
      inputs.push(input)
      return { status: 'no-solution', analysis: { reasons: [] } }
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-5',
    routeId: '1-5-boss-light',
    objective: 'balanced',
  })

  assert.equal(inputs[0].candidateLimit, 18)
})

test('fleet recommendation IPC preserves the worker defensive timeout', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const strategySender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const strategyEvent = {
    sender: strategySender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    recommendationSlowThresholdMs: 1,
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async () => {
      throw new Error('Recommendation worker timed out after 30000ms')
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const result = await handlers.get(RECOMMEND_CHANNEL)(strategyEvent, {
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'RECOMMENDATION_TIMEOUT')
  assert.doesNotMatch(result.error.message, /3 秒/)
})

test('expedition planner IPC logs flattened summary and copyable JSON details', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = {
    getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html',
    executeJavaScript: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
      maxResource: 350000,
      modifierFactor: 1,
      accountShips: [],
      fleetNumbers: [2],
      candidates: [
        {
          id: 1,
          displayNo: '01',
          name: 'Practice voyage',
          durationMinutes: 20,
          baseIncome: { fuel: 30, ammo: 30, steel: 0, bauxite: 0 },
          bucketMaxPerTrip: 0,
          bucketReward: null,
          fuelPercent: 0.1,
          ammoPercent: 0.1,
          requirements: {
            flagShipLevel: 1,
            flagShipTypeOf: null,
            shipCount: 2,
            levelCount: null,
            totalAsw: null,
            totalLos: null,
            totalAa: null,
            totalFp: null,
            totalTorp: null,
            drumCount: null,
            drumCarrierCount: null,
            fleetSType: [],
            sampleFleet: [],
          },
          greatSuccessCondition: { type: 'unknown' },
          monthly: false,
          fleetChecks: [],
        },
      ],
    }),
  }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const scoreDetails = {
    expectedNetYield: { fuel: 10, ammo: 20, steel: 0, bauxite: 0, bucket: 0 },
    benchmark: { fuel: 10, ammo: 20, steel: 0, bauxite: 0, bucket: 0 },
    satisfaction: { fuel: 1, ammo: 1, steel: 0, bauxite: 0, bucket: 0 },
    utility: { fuel: 1, ammo: 1, steel: 0, bauxite: 0, bucket: 0 },
    normalizedWeight: { fuel: 0.5, ammo: 0.5, steel: 0, bauxite: 0, bucket: 0 },
    weightedContribution: { fuel: 0.5, ammo: 0.5, steel: 0, bauxite: 0, bucket: 0 },
    totalScore: 1,
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({ status: 'error' }),
    recommend: async () => ({ status: 'no-solution', analysis: { reasons: [] } }),
    planExpeditions: async ({ request }) => {
      assert.equal(request.debug, true)
      return {
        status: 'success',
        generatedAt: '2026-08-29T00:00:00.000Z',
        current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
        resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
        maxResource: 350000,
        candidateCount: 1,
        combinationCount: 1,
        prunedCombinationCount: 1,
        settings: {
          afkMinutes: 0,
          fleetCount: 1,
          comparisonWindowMinutes: 60,
          resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
          bucketWeight: 0,
          mode: 'online',
          incomeModifier: { greatSuccess: false, daihatsuCount: 0, factor: 1 },
          usesExpeditionTableCostConfig: false,
          resupplyCostModel: 'kancepts-account',
        },
        plans: [
          {
            pairings: [
              {
                expedition: { displayNo: '01', name: 'Practice voyage' },
                fleet: { fleetNumber: 2 },
              },
            ],
            scoreDetails,
          },
        ],
        optimizationDebug: {
          context: {
            totalCombinationCount: 1,
            paretoRemovedCount: 0,
            remainingCombinationCount: 1,
          },
          topCombinations: [{ expeditionIds: ['01'], totalScore: 1 }],
        },
      }
    },
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  const result = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
    afkMinutes: 0,
    fleetCount: 1,
    candidateIds: [1],
    bucketWeight: 0,
    debug: true,
    incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  })

  assert.equal(result.status, 'success')
  const completed = logs.find((log) => log.eventName === 'expedition-planner.completed')
  assert.ok(completed)
  assert.equal(completed.data.scoring[0].expeditions, '01')
  assert.equal(Object.hasOwn(completed.data.scoring[0], 'scoreDetails'), false)
  const scoringJsonLog = logs.find(
    (log) => log.eventName === 'expedition-planner.completed.scoring-json',
  )
  assert.ok(scoringJsonLog)
  assert.doesNotMatch(scoringJsonLog.data, /\[Array\]|\[Object\]/)
  const scoringJson = JSON.parse(scoringJsonLog.data.trim())
  assert.equal(scoringJson.plans[0].resources.fuel.expectedNetYield, 10)
  const optimizationJsonLog = logs.find(
    (log) => log.eventName === 'expedition-planner.completed.optimization-debug-json',
  )
  assert.ok(optimizationJsonLog)
  assert.doesNotMatch(optimizationJsonLog.data, /\[Array\]|\[Object\]/)
  assert.equal(JSON.parse(optimizationJsonLog.data.trim()).context.totalCombinationCount, 1)
})

test('expedition planner IPC accepts only five-step weights from -5 to 20', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = {
    getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html',
    executeJavaScript: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
      maxResource: 350000,
      modifierFactor: 1,
      accountShips: [],
      fleetNumbers: [],
      candidates: [],
    }),
  }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const calls = []
  const baseRequest = {
    resourceWeights: { fuel: 0, ammo: 0, steel: 0, bauxite: 0 },
    afkMinutes: 0,
    fleetCount: 1,
    candidateIds: [1],
    bucketWeight: 0,
    debug: false,
    incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({ status: 'error' }),
    recommend: async () => ({ status: 'no-solution', analysis: { reasons: [] } }),
    planExpeditions: async ({ request }) => {
      calls.push(request)
      return {
        status: 'no-solution',
        reason: 'fixture',
        reasonCode: 'INSUFFICIENT_EXPEDITIONS',
        reasonValues: {},
        generatedAt: '2026-08-29T00:00:00.000Z',
        current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
        maxResource: 350000,
      }
    },
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const invalid = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    resourceWeights: { ...baseRequest.resourceWeights, fuel: 3 },
  })
  assert.equal(invalid.status, 'error')
  assert.equal(invalid.error.code, 'INVALID_REQUEST')
  assert.equal(calls.length, 0)

  const valid = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    resourceWeights: { ...baseRequest.resourceWeights, fuel: -5 },
    bucketWeight: -5,
  })
  assert.equal(valid.status, 'no-solution')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].resourceWeights.fuel, -5)
  assert.equal(calls[0].bucketWeight, -5)
})

test('expedition planner IPC converts priority preferences before planning', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = {
    getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html',
    executeJavaScript: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
      maxResource: 350000,
      modifierFactor: 1,
      accountShips: [],
      fleetNumbers: [],
      candidates: [],
    }),
  }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const calls = []
  const baseRequest = {
    preference: {
      mode: 'priority',
      priorities: { bucket: 1, fuel: 2, bauxite: 3, ammo: 4, steel: 5 },
    },
    afkMinutes: 0,
    fleetCount: 1,
    candidateIds: [1],
    debug: false,
    incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({ status: 'error' }),
    recommend: async () => ({ status: 'no-solution', analysis: { reasons: [] } }),
    planExpeditions: async ({ request }) => {
      calls.push(request)
      return {
        status: 'no-solution',
        reason: 'fixture',
        reasonCode: 'INSUFFICIENT_EXPEDITIONS',
        reasonValues: {},
        generatedAt: '2026-08-29T00:00:00.000Z',
        current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
        maxResource: 350000,
      }
    },
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const valid = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, baseRequest)
  assert.equal(valid.status, 'no-solution')
  assert.deepEqual(calls[0].resourceWeights, { fuel: 70, ammo: 25, steel: 10, bauxite: 45 })
  assert.equal(calls[0].bucketWeight, 100)
  assert.deepEqual(calls[0].preference, {
    mode: 'priority',
    preferences: {
      bucket: { mode: 'optimize', rank: 1 },
      fuel: { mode: 'optimize', rank: 2 },
      bauxite: { mode: 'optimize', rank: 3 },
      ammo: { mode: 'optimize', rank: 4 },
      steel: { mode: 'optimize', rank: 5 },
    },
  })

  const constrained = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    preference: {
      mode: 'priority',
      preferences: {
        fuel: { mode: 'optimize', rank: 1 },
        bauxite: { mode: 'optimize', rank: 2 },
        ammo: { mode: 'constraint', minimumNetYieldPerHour: 0 },
        steel: { mode: 'ignore' },
        bucket: { mode: 'ignore' },
      },
    },
  })
  assert.equal(constrained.status, 'no-solution')
  assert.deepEqual(calls[1].resourceWeights, { fuel: 100, ammo: 0, steel: 0, bauxite: 70 })
  assert.equal(calls[1].bucketWeight, 0)
  assert.deepEqual(calls[1].preference.preferences.ammo, {
    mode: 'constraint',
    minimumNetYieldPerHour: 0,
  })

  const duplicate = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    preference: {
      mode: 'priority',
      priorities: { bucket: 1, fuel: 1, bauxite: 2, ammo: null, steel: null },
    },
  })
  assert.equal(duplicate.status, 'error')
  assert.equal(duplicate.error.code, 'INVALID_REQUEST')

  const skipped = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    preference: {
      mode: 'priority',
      priorities: { bucket: 1, fuel: 3, bauxite: null, ammo: null, steel: null },
    },
  })
  assert.equal(skipped.status, 'error')
  assert.equal(skipped.error.code, 'INVALID_REQUEST')
})

test('fleet recommendation renderer payload omits internal scores', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async () => ({
      status: 'success',
      recommendations: [
        {
          id: 'fixture-recommendation',
          title: 'Fixture',
          mapId: '1-1',
          route: {
            id: 'fixture-route',
            name: 'Fixture route',
            nodes: ['A', 'B'],
            description: 'Use the source route notes.',
            metadata: {
              confidence: 'verified',
              source: ['https://example.com/wiki', 'https://example.com/guide'],
              guideSources: ['https://example.com/guide'],
              lastVerified: '2026-08-29',
            },
          },
          ships: [
            {
              role: 'escort-destroyer',
              ship: {
                id: 1,
                name: 'Fubuki',
                level: 12,
                speed: 'fast',
                speedValue: 10,
                slotSizes: [0, 0],
                fastPlusPatterns: [],
              },
              equipment: [],
              expansionSlot: null,
            },
          ],
          metrics: {
            airPower: 0,
            airPowerRequired: false,
            airPowerMinimum: 0,
            los33: 0,
            losRequired: false,
            losMinimum: 0,
            openingAswCount: 0,
            openingAswRequired: false,
            openingAswMinimum: 0,
            estimatedFuelCost: 1,
            estimatedAmmoCost: 1,
            estimatedResourceGain: null,
            estimatedNetResourceGain: null,
            resourceTarget: null,
            landingCraftCount: 0,
            drumCount: 0,
            finalSpeedClass: 'fast',
          },
          score: { total: 99.9 },
          reasons: [
            { code: 'EQUIPMENT_INSTANCES_UNIQUE', message: 'internal' },
            { code: 'ROUTE_FIXED_COMPOSITION', message: 'visible' },
          ],
          warnings: [
            { code: 'HEURISTIC_COMBAT_SCORE', message: 'internal' },
            { code: 'LOW_LOS_MARGIN', message: 'visible' },
          ],
        },
      ],
      elapsedMs: 0,
      solverVersion: 'fixture',
    }),
    readCombatEvaluations: async () => {
      throw new Error('skip exact combat in fixture')
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const result = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'balanced',
  })

  assert.equal(result.status, 'success')
  assert.equal(Object.hasOwn(result.recommendations[0], 'score'), false)
  assert.equal(result.recommendations[0].route.description, 'Use the source route notes.')
  assert.deepEqual(result.recommendations[0].route.sources, ['https://example.com/guide'])
  assert.deepEqual(
    result.recommendations[0].reasons.map((reason) => reason.code),
    ['ROUTE_FIXED_COMPOSITION'],
  )
  assert.deepEqual(
    result.recommendations[0].warnings.map((warning) => warning.code),
    ['LOW_LOS_MARGIN'],
  )
})

const exactOaswFixture = () => {
  const stats = {
    hp: 30,
    firepower: 20,
    torpedo: 20,
    antiAir: 20,
    armor: 20,
    evasion: 40,
    asw: 80,
    los: 20,
    luck: 10,
  }
  const route = {
    id: '1-5-oasw-fixture',
    tags: ['oasw'],
    calculatedConstraints: [{ kind: 'opening-asw', minimum: 1 }],
  }
  const recommendation = (index) => ({
    id: `oasw-fixture-${index}`,
    mapId: '1-5',
    route,
    ships: [
      {
        role: 'anti-submarine',
        ship: { id: index, stats, fuelCost: 5, ammoCost: 5 },
        equipment: [],
        expansionSlot: null,
      },
    ],
    metrics: {
      airPower: 0,
      airPowerRequired: false,
      airPowerMinimum: 0,
      airPowerRecommended: 0,
      los33: 0,
      losRequired: false,
      losMinimum: 0,
      openingAswCount: 1,
      openingAswRequired: true,
      openingAswMinimum: 1,
      estimatedFuelCost: 5,
      estimatedAmmoCost: 5,
      estimatedResourceGain: null,
      estimatedNetResourceGain: null,
      resourceTarget: null,
      landingCraftCount: 0,
      drumCount: 0,
      nightCutInCandidates: 0,
      finalSpeedClass: 'fast',
    },
    reasons: [],
    warnings: [],
  })
  return {
    status: 'success',
    recommendations: [recommendation(1), recommendation(2)],
    diagnostics: {
      routeCandidateCount: 1,
      availableRouteCount: 1,
      evaluatedFleetCandidateCount: 2,
      gearSolutionCount: 2,
      recommendationCandidateCount: 2,
      bestAirPower: 0,
      airPowerMinimum: null,
      reasonCodes: [],
    },
    elapsedMs: 4,
    solverVersion: 'fixture',
  }
}

const exactCombatShip = (openingAswCapable) => ({
  effectiveStats: {
    firepower: 20,
    torpedo: 20,
    antiAir: 20,
    armor: 20,
    asw: 100,
    los: 20,
    bombing: 0,
    accuracy: 0,
    evasion: 40,
  },
  equipmentBonus: {
    firepower: 0,
    torpedo: 0,
    antiAir: 0,
    armor: 0,
    asw: 0,
    los: 0,
    bombing: 0,
    accuracy: 0,
    evasion: 0,
  },
  daySurfacePower: 0,
  nightSurfacePower: 0,
  antiInstallationDayPower: 0,
  antiInstallationNightPower: 0,
  antiSubmarineAttackCapable: true,
  openingAswCapable,
  antiSubmarinePower: 100,
  shellingAccuracy: 100,
})

test('exact KC3 loadout validation keeps only opening-ASW-capable candidates and logs the branch', () => {
  const logs = []
  const result = applyCombatEvaluations(
    exactOaswFixture(),
    [
      { id: 'oasw-fixture-1', ships: [exactCombatShip(false)] },
      { id: 'oasw-fixture-2', ships: [exactCombatShip(true)] },
    ],
    'balanced',
    {
      logger: (eventName, data) => logs.push({ eventName, data }),
      logContext: { mapId: '1-5', routeId: '1-5-oasw-fixture', objective: 'balanced' },
      elapsedMs: 7,
    },
  )

  assert.equal(result.status, 'success')
  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    ['oasw-fixture-2'],
  )
  assert.equal(result.recommendations[0].metrics.openingAswCount, 1)
  const completed = logs.find(
    ({ eventName }) => eventName === 'recommendation.oasw-loadout-validation-completed',
  )
  assert.equal(completed.data.candidateCount, 2)
  assert.equal(completed.data.rejectedCandidateCount, 1)
  assert.equal(completed.data.bestObservedOpeningAsw, 1)
  assert.equal(completed.data.requiredMinimum, 1)
  assert.equal(completed.data.outcome, 'passed')
  assert.equal(completed.data.elapsedMs, 7)
})

test('exact KC3 loadout validation returns diagnostic OASW failure when every candidate fails', () => {
  const logs = []
  const result = applyCombatEvaluations(
    exactOaswFixture(),
    [
      { id: 'oasw-fixture-1', ships: [exactCombatShip(false)] },
      { id: 'oasw-fixture-2', ships: [exactCombatShip(false)] },
    ],
    'balanced',
    { logger: (eventName, data) => logs.push({ eventName, data }) },
  )

  assert.equal(result.status, 'no-solution')
  assert.equal(result.analysis.reasons[0].code, 'OASW_INSUFFICIENT')
  assert.deepEqual(result.analysis.reasons[0].values, { best: 0, minimum: 1 })
  assert.equal(result.diagnostics.bestOpeningAsw, 0)
  assert.equal(result.diagnostics.openingAswMinimum, 1)
  const completed = logs.find(
    ({ eventName }) => eventName === 'recommendation.oasw-loadout-validation-completed',
  )
  assert.equal(completed.data.outcome, 'rejected-all')
  assert.deepEqual(completed.data.reasonCodes, ['OASW_INSUFFICIENT'])
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

test('KC3 account snapshot logs bounded opening-ASW probe fallback diagnostics', async () => {
  const logs = []
  const rawSnapshot = {
    generatedAt: '2026-08-29T00:00:00.000Z',
    hqLevel: 120,
    ships: [
      {
        id: 1,
        masterId: 141,
        name: 'Fixture ship',
        level: 99,
        shipTypeId: 3,
        shipType: 'CL',
        speedValue: 10,
        stats: {
          hp: 30,
          firepower: 20,
          torpedo: 20,
          antiAir: 20,
          armor: 20,
          evasion: 40,
          asw: 80,
          los: 20,
          luck: 10,
        },
        nakedLos: 20,
        slotSizes: [0, 0, 0],
        equippedItemIds: [0, 0, 0],
        expansionSlotItemId: 0,
        expansionSlotUnlocked: false,
        expansionEquipableEquipmentIds: [],
        regularEquipableMasterIds: [1],
        openingAswRules: [],
        fastPlusPatterns: [],
        nightCarrierPatterns: [],
        locked: true,
        morale: 49,
        eventTag: 0,
        fuelCost: 15,
        ammoCost: 20,
      },
    ],
    equipment: [
      {
        id: 101,
        masterId: 1,
        name: 'Fixture gear',
        typeId: 14,
        iconTypeId: 14,
        type: '14',
        improvement: 0,
        proficiency: -1,
        locked: true,
        currentlyEquippedBy: 0,
        antiInstallationAircraft: false,
        stats: {
          firepower: 0,
          torpedo: 0,
          antiAir: 0,
          armor: 0,
          asw: 10,
          los: 0,
          bombing: 0,
          accuracy: 1,
          evasion: 0,
        },
        losImprovement: 0,
        airPowerBySlotSize: { 0: 0 },
      },
    ],
    currentFleetShipIds: [],
    capabilities: {
      accountShips: true,
      accountEquipment: true,
      masterData: true,
      currentFleet: true,
    },
    diagnostics: {
      openingAswProbe: {
        attemptedShipCount: 1,
        failedShipCount: 1,
        noEquipmentRuleCount: 0,
        sonarRuleCount: 0,
        failureMessages: ['fixture calculator error'],
        elapsedMs: 12,
      },
    },
  }
  const account = await readKC3AccountSnapshot(
    { executeJavaScript: async () => rawSnapshot },
    (eventName, data) => logs.push({ eventName, data }),
  )

  assert.equal(account.ships.length, 1)
  const completed = logs.find(
    ({ eventName }) => eventName === 'recommendation.oasw-snapshot-probe-completed',
  )
  assert.equal(completed.data.attemptedShipCount, 1)
  assert.equal(completed.data.failedShipCount, 1)
  assert.equal(completed.data.fallbackResult, 'generic-core-threshold')
  assert.deepEqual(completed.data.reasonCodes, ['KC3_OASW_PROBE_FAILED'])
  assert.deepEqual(completed.data.messages, ['fixture calculator error'])
  assert.equal(completed.data.elapsedMs, 12)
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
  assert.match(script, /canDoOASW/)
  assert.match(script, /canDoASW\(\)/)
  assert.match(script, /openingAswCapable/)
  assert.match(script, /antiSubmarineAttackCapable/)
  assert.match(script, /antiSubWarfarePower/)
  assert.match(script, /"equipmentIds":\[101,102\]/)
  assert.match(script, /__dameconCombatEvaluationCache/)
  assert.equal(script.match(/"shipId":7/g)?.length, 1)
  assert.doesNotThrow(() => new Function(script))
})
