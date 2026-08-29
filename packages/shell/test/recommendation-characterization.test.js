import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getResourceLedgerWindow,
  parseKC3ExpeditionPlannerSnapshot,
  parseKC3ResourceLedgerSnapshot,
  planExpeditions,
  summarizeResourceLedger,
} from '@kancolle-assistant/recommendation-core'
import {
  installOptimizerDebugConsoleHelper,
  logOptimizationDebugReport,
} from '../browser/recommendation/expedition-optimizer-debug.js'
import { kc3ExpeditionPlannerMainWorld } from '../browser/recommendation/kc3-expedition-planner.js'
import {
  kc3ResourceLedgerMainWorld,
  readKC3ResourceLedgerSummary,
} from '../browser/recommendation/kc3-resource-ledger.js'
import { createExpeditionWindow, createLedgerWindow, FIXED_NOW } from './fixtures/kc3-runtime.js'

const withRuntime = async (runtime, operation) => {
  const OriginalDate = globalThis.Date
  const originalWindow = globalThis.window
  class FixedDate extends OriginalDate {
    constructor(value) {
      super(typeof value === 'undefined' ? FIXED_NOW : value)
    }

    static now() {
      return FIXED_NOW
    }
  }
  globalThis.Date = FixedDate
  globalThis.window = runtime
  try {
    return await operation()
  } finally {
    globalThis.Date = OriginalDate
    globalThis.window = originalWindow
  }
}

const baseRequest = {
  mode: 'plan',
  resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
  afkMinutes: 0,
  fleetCount: 2,
  candidateIds: [1, 2, 3],
  bucketWeight: 0,
  incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
}

const runExpeditionPlanner = (request) =>
  withRuntime(createExpeditionWindow(), () => {
    const snapshot = parseKC3ExpeditionPlannerSnapshot(kc3ExpeditionPlannerMainWorld(request))
    return planExpeditions({ snapshot, request })
  })

const runResourceLedger = (range, granularity = 'hourly') =>
  withRuntime(createLedgerWindow(), async () => {
    const window = getResourceLedgerWindow(range, FIXED_NOW)
    const snapshot = parseKC3ResourceLedgerSnapshot(
      await kc3ResourceLedgerMainWorld({ range, ...window, now: FIXED_NOW }),
    )
    return summarizeResourceLedger({ snapshot, range, now: FIXED_NOW, granularity })
  })

test('KC3 resource ledger summary reuses snapshots across granularity changes', async () => {
  const calls = []
  const webContents = {
    executeJavaScript: async (source) => {
      calls.push(source)
      const request = JSON.parse(source.match(/\)\((\{[\s\S]*\})\)$/)[1])
      return {
        generatedAt: new Date(request.now).toISOString(),
        ...request,
        current: {
          fuel: 1000,
          ammo: 2000,
          steel: 3000,
          bauxite: 4000,
          torch: 10,
          bucket: 20,
          devmat: 30,
          screws: 40,
        },
        records: [
          {
            hour: request.startHour,
            minute: request.startHour * 60 + 1,
            type: 'exped-return',
            data: [10, 0, 0, 0, 0, 0, 0, 0],
          },
        ],
        materialSnapshots: [],
        consumableSnapshots: [],
      }
    },
  }

  const hourly = await readKC3ResourceLedgerSummary(webContents, {
    range: 'today',
    granularity: 'hourly',
  })
  const minute = await readKC3ResourceLedgerSummary(webContents, {
    range: 'today',
    granularity: 'minute',
  })
  const refreshed = await readKC3ResourceLedgerSummary(webContents, {
    range: 'today',
    granularity: 'minute',
    forceRefresh: true,
  })

  assert.equal(hourly.summary.fuel.gained, 10)
  assert.equal(minute.summary.fuel.gained, 10)
  assert.equal(refreshed.summary.fuel.gained, 10)
  assert.equal(calls.length, 2)
})

test('KC3 expedition summary reloads current resources and preserves timestamp', async () => {
  const runtime = createExpeditionWindow()
  runtime.PlayerManager.hq.lastMaterial = [997, 1995, 2996, 4000]
  runtime.PlayerManager.hq.load = () => {
    runtime.PlayerManager.hq.lastMaterial = [1000, 2000, 3000, 4000]
  }
  const result = await withRuntime(runtime, () =>
    kc3ExpeditionPlannerMainWorld({ mode: 'summary' }),
  )
  assert.deepEqual(result, {
    generatedAt: '2026-08-24T17:15:00.000Z',
    current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
    maxResource: 350000,
  })
})

test('KC3 expedition planner preserves pairing, costs, modifiers, and tie-breakers', async () => {
  const normal = await runExpeditionPlanner(baseRequest)
  assert.equal(normal.status, 'success')
  assert.equal(normal.plans.length, 1)
  assert.deepEqual(
    normal.plans[0].pairings.map(({ expedition, fleet }) => [expedition.id, fleet.fleetNumber]),
    [
      [2, 2],
      [3, 3],
    ],
  )
  const bucketExpedition = normal.plans[0].pairings.find(({ expedition }) => expedition.id === 2)
  assert.deepEqual(bucketExpedition.expedition.estimatedResupplyCost, {
    fuel: 5,
    ammo: 7,
  })
  assert.deepEqual(bucketExpedition.expedition.netIncome, {
    fuel: 95,
    ammo: -7,
    steel: 0,
    bauxite: 0,
  })
  assert.equal(bucketExpedition.expedition.modifier.factor, 1)

  const modified = await runExpeditionPlanner({
    ...baseRequest,
    fleetCount: 1,
    candidateIds: [1],
    incomeModifier: { greatSuccess: true, daihatsuCount: 3 },
  })
  assert.equal(modified.status, 'success')
  assert.equal(modified.settings.incomeModifier.factor, 1.7249999999999999)
  assert.deepEqual(modified.plans[0].pairings[0].expedition.netIncome, {
    fuel: 49,
    ammo: 48,
    steel: 0,
    bauxite: 0,
  })

  const buckets = await runExpeditionPlanner({
    ...baseRequest,
    fleetCount: 1,
    bucketWeight: 5,
  })
  assert.equal(buckets.status, 'success')
  assert.equal(buckets.plans[0].pairings[0].expedition.id, 2)
  assert.equal(buckets.plans[0].bucketPotentialHourly, 1)

  const debug = await runExpeditionPlanner({ ...baseRequest, debug: true })
  assert.equal(debug.status, 'success')
  assert.equal(debug.optimizationDebug.topCombinations[0].rank, 1)
  assert.deepEqual(debug.optimizationDebug.topCombinations[0].expeditionIds, ['02', '03'])
})

test('expedition optimizer debug log emits copyable tables and full JSON', async () => {
  const result = await runExpeditionPlanner({ ...baseRequest, debug: true })
  const capturedLogs = []
  const capturedTables = []
  const capturedGroups = []
  const capturedWarnings = []
  const originalConsole = {
    group: console.group,
    groupEnd: console.groupEnd,
    info: console.info,
    log: console.log,
    table: console.table,
    warn: console.warn,
  }

  console.group = (...values) => capturedGroups.push(values.map(String).join(' '))
  console.groupEnd = () => {}
  console.info = (...values) => capturedLogs.push(values.map(String).join(' '))
  console.log = (...values) => capturedLogs.push(values.map(String).join(' '))
  console.table = (rows) => capturedTables.push(rows)
  console.warn = (...values) => capturedWarnings.push(values.map(String).join(' '))

  try {
    installOptimizerDebugConsoleHelper()
    globalThis.KancolleOptimizerDebug.enable()
    logOptimizationDebugReport(result)
  } finally {
    console.group = originalConsole.group
    console.groupEnd = originalConsole.groupEnd
    console.info = originalConsole.info
    console.log = originalConsole.log
    console.table = originalConsole.table
    console.warn = originalConsole.warn
    delete globalThis.KancolleOptimizerDebug
    delete globalThis.compareOptimizationCombinations
    delete globalThis.__KANCOLLE_OPTIMIZER_DEBUG__
  }

  assert.ok(capturedGroups.some((item) => item.includes('[KancolleOptimizer] Rank #1 Breakdown')))
  assert.ok(
    capturedTables.some((rows) =>
      rows.some?.((row) => row.rank === 1 && Object.hasOwn(row, 'fuelPerHour')),
    ),
  )
  assert.ok(
    capturedTables.some((rows) =>
      rows.some?.((row) => Object.hasOwn(row, 'totalCombinationCount')),
    ),
  )
  assert.ok(
    capturedTables.some((rows) =>
      rows.some?.(
        (row) =>
          Object.hasOwn(row, 'Fuel Satisfaction') && Object.hasOwn(row, 'Bucket Contribution'),
      ),
    ),
  )
  const fullDebugLog = capturedLogs.find((item) =>
    item.startsWith('[KancolleOptimizer] FULL_SCORE_DEBUG\n'),
  )
  assert.ok(fullDebugLog)
  assert.doesNotMatch(fullDebugLog, /\[Array\]|\[Object\]/)
  const fullDebug = JSON.parse(fullDebugLog.slice(fullDebugLog.indexOf('\n') + 1))
  assert.equal(fullDebug.top10[0].rank, 1)
  assert.equal(fullDebug.pareto.watchedCombinations.length, 5)
  assert.ok(Object.hasOwn(fullDebug.requestedCombinationSummary[0], 'Fuel Satisfaction'))
  assert.equal(fullDebug.bucketDebug.length, 6)
  assert.ok(capturedWarnings.length > 0)
})

test('KC3 expedition snapshot keeps current missions separate from recommendations', async () => {
  const snapshot = await withRuntime(createExpeditionWindow(), () =>
    parseKC3ExpeditionPlannerSnapshot(kc3ExpeditionPlannerMainWorld(baseRequest)),
  )
  const recommendedExpedition = snapshot.candidates.find((candidate) => candidate.id === 2)
  const busyFleet = recommendedExpedition.fleetChecks.find((fleet) => fleet.fleetNumber === 3)

  assert.equal(recommendedExpedition.displayNo, '02')
  assert.deepEqual(recommendedExpedition.bucketReward, {
    item: 'bucket',
    min: 0,
    max: 1,
    itemSlot: 'left',
    rewardRule: 'random',
    acquisitionProbability: null,
  })
  assert.equal(busyFleet.busy, true)
  assert.deepEqual(busyFleet.currentMission, {
    id: 3,
    displayNo: '03',
    name: 'Ammo voyage',
    completesAt: FIXED_NOW + 60 * 60 * 1000,
  })

  const runtimeWithStaleMission = createExpeditionWindow()
  runtimeWithStaleMission.PlayerManager.fleets[1].mission = [0, 3, FIXED_NOW + 60 * 60 * 1000]
  const staleSnapshot = await withRuntime(runtimeWithStaleMission, () =>
    parseKC3ExpeditionPlannerSnapshot(kc3ExpeditionPlannerMainWorld(baseRequest)),
  )
  const freeFleet = staleSnapshot.candidates[0].fleetChecks.find((fleet) => fleet.fleetNumber === 2)

  assert.equal(freeFleet.busy, false)
  assert.equal(freeFleet.currentMission, null)

  const runtimeWithIncompleteMission = createExpeditionWindow()
  runtimeWithIncompleteMission.PlayerManager.fleets[2].mission = [1, 0, 0]
  await assert.rejects(
    withRuntime(runtimeWithIncompleteMission, () => kc3ExpeditionPlannerMainWorld(baseRequest)),
    /mission data is incomplete/,
  )
})

test('KC3 expedition planner preserves no-solution outcomes', async () => {
  const tooManyFleets = await runExpeditionPlanner({ ...baseRequest, fleetCount: 4 })
  assert.equal(tooManyFleets.status, 'no-solution')
  assert.equal(tooManyFleets.reasonCode, 'INSUFFICIENT_FLEETS')

  const tooFewCandidates = await runExpeditionPlanner({
    ...baseRequest,
    fleetCount: 2,
    candidateIds: [1],
  })
  assert.equal(tooFewCandidates.status, 'no-solution')
  assert.equal(tooFewCandidates.reasonCode, 'INSUFFICIENT_EXPEDITIONS')
})

test('KC3 resource ledger preserves ranges, categories, and inventory carry-forward', async () => {
  const today = await runResourceLedger('today')
  assert.equal(today.generatedAt, '2026-08-24T17:15:00.000Z')
  assert.equal(today.entryCount, 2)
  assert.deepEqual(today.summary.fuel, { gained: 10, spent: 4, net: 6, current: 1000 })
  assert.deepEqual(today.summary.bucket, { gained: 0, spent: 2, net: -2, current: 21 })
  assert.deepEqual(
    today.sources.map(({ key, entryCount }) => ({ key, entryCount })),
    [
      { key: 'expedition', entryCount: 1 },
      { key: 'repair', entryCount: 1 },
    ],
  )
  assert.deepEqual(today.inventoryHours[0].values, {
    fuel: 900,
    ammo: 1900,
    steel: 2900,
    bauxite: 3900,
    torch: 10,
    bucket: 20,
    devmat: 30,
    screws: 40,
  })
  assert.deepEqual(today.inventoryHours.at(-1).values, {
    fuel: 1000,
    ammo: 2000,
    steel: 3000,
    bauxite: 4000,
    torch: 11,
    bucket: 21,
    devmat: 31,
    screws: 41,
  })

  const yesterday = await runResourceLedger('yesterday')
  assert.equal(yesterday.entryCount, 1)
  assert.deepEqual(yesterday.summary.steel, { gained: 5, spent: 0, net: 5, current: 3000 })
  assert.equal(yesterday.inventoryHours.length, 24)

  const rolling = await runResourceLedger('rolling24')
  assert.equal(rolling.range.key, 'rolling24')
  assert.equal(rolling.hours.length, 24)
  assert.equal(rolling.inventoryHours.length, 24)

  const thirtyMinute = await runResourceLedger('today', 'thirtyMinute')
  assert.equal(thirtyMinute.granularity.key, 'thirtyMinute')
  assert.equal(thirtyMinute.hours[0].gained.fuel, 10)
  assert.equal(thirtyMinute.hours[3].spent.fuel, 4)
})
