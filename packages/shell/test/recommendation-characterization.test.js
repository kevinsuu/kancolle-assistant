import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getResourceLedgerWindow,
  parseKC3ExpeditionPlannerSnapshot,
  parseKC3ResourceLedgerSnapshot,
  planExpeditions,
  summarizeResourceLedger,
} from '@kancolle-assistant/recommendation-core'
import { kc3ExpeditionPlannerMainWorld } from '../browser/recommendation/kc3-expedition-planner.js'
import { kc3ResourceLedgerMainWorld } from '../browser/recommendation/kc3-resource-ledger.js'
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
  resourceWeights: { fuel: 1, ammo: 1, steel: 0, bauxite: 0 },
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

const runResourceLedger = (range) =>
  withRuntime(createLedgerWindow(), async () => {
    const window = getResourceLedgerWindow(range, FIXED_NOW)
    const snapshot = parseKC3ResourceLedgerSnapshot(
      await kc3ResourceLedgerMainWorld({ range, ...window, now: FIXED_NOW }),
    )
    return summarizeResourceLedger({ snapshot, range, now: FIXED_NOW })
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
      [1, 4],
      [2, 2],
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
  assert.equal(buckets.plans[0].bucketPotentialHourly, 2)
})

test('KC3 expedition snapshot keeps current missions separate from recommendations', async () => {
  const snapshot = await withRuntime(createExpeditionWindow(), () =>
    parseKC3ExpeditionPlannerSnapshot(kc3ExpeditionPlannerMainWorld(baseRequest)),
  )
  const recommendedExpedition = snapshot.candidates.find((candidate) => candidate.id === 2)
  const busyFleet = recommendedExpedition.fleetChecks.find((fleet) => fleet.fleetNumber === 3)

  assert.equal(recommendedExpedition.displayNo, '02')
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
})
