const assert = require('node:assert/strict')
const test = require('node:test')
const { parseKC3ExpeditionPlannerSnapshot, planExpeditions } = require('../dist/index.js')

const resources = (fuel, ammo, steel = 0, bauxite = 0) => ({
  fuel,
  ammo,
  steel,
  bauxite,
})

const nullableResult = {
  flagShipTypeOf: null,
  levelCount: null,
  totalAsw: null,
  totalLos: null,
  totalAa: null,
  totalFp: null,
  totalTorp: null,
  drumCount: null,
  drumCarrierCount: null,
  fleetSType: [],
}

const actual = (shipCount) => ({
  flagShipLevel: 80,
  flagShipType: 'SType 2',
  shipCount,
  levelCount: shipCount * 80,
  totalAsw: shipCount * 12,
  totalLos: shipCount * 10,
  totalAa: shipCount * 15,
  totalFp: shipCount * 20,
  totalTorp: shipCount * 30,
  drumCount: 0,
  drumCarrierCount: 0,
  sparkledCount: 0,
  types: Array.from({ length: shipCount }, () => 'SType 2'),
})

const fleetCheck = (fleetNumber, shipCount, requiredShipCount) => ({
  fleetNumber,
  fleetName: `Fleet ${fleetNumber}`,
  busy: fleetNumber === 3,
  currentMission:
    fleetNumber === 3
      ? { id: 3, displayNo: '03', name: 'Ammo voyage', completesAt: 1787595300000 }
      : null,
  shipCount,
  isSupplied: fleetNumber !== 3,
  actual: actual(shipCount),
  result: {
    flagShipLevel: true,
    shipCount: shipCount >= requiredShipCount,
    ...nullableResult,
  },
})

const requirements = (shipCount) => ({
  flagShipLevel: 1,
  flagShipTypeOf: null,
  shipCount,
  levelCount: null,
  totalAsw: null,
  totalLos: null,
  totalAa: null,
  totalFp: null,
  totalTorp: null,
  drumCount: null,
  drumCarrierCount: null,
  fleetSType: [],
  sampleFleet: ['SType 2', 'SType 2'],
})

const candidate = (id, durationMinutes, baseIncome, shipCount, bucketMaxPerTrip = 0) => ({
  id,
  displayNo: String(id).padStart(2, '0'),
  name: `Expedition ${id}`,
  durationMinutes,
  baseIncome,
  bucketMaxPerTrip,
  fuelPercent: 0.1,
  ammoPercent: 0.1,
  requirements: requirements(shipCount),
  greatSuccessCondition: bucketMaxPerTrip ? { type: 'all-sparkle' } : { type: 'unknown' },
  monthly: false,
  fleetChecks: [
    fleetCheck(2, 4, shipCount),
    fleetCheck(3, 3, shipCount),
    fleetCheck(4, 2, shipCount),
  ],
})

const rawSnapshot = {
  generatedAt: '2026-08-24T17:15:00.000Z',
  current: resources(1000, 2000, 3000, 4000),
  maxResource: 350000,
  modifierFactor: 1,
  accountShips: [
    { masterId: 101, level: 120, stype: 2, maxFuel: 20, maxAmmo: 20 },
    { masterId: 102, level: 80, stype: 2, maxFuel: 15, maxAmmo: 20 },
    { masterId: 103, level: 70, stype: 2, maxFuel: 15, maxAmmo: 25 },
    { masterId: 104, level: 60, stype: 2, maxFuel: 20, maxAmmo: 25 },
    { masterId: 105, level: 50, stype: 2, maxFuel: 25, maxAmmo: 30 },
    { masterId: 106, level: 40, stype: 2, maxFuel: 30, maxAmmo: 30 },
  ],
  fleetNumbers: [2, 3, 4],
  candidates: [
    candidate(1, 20, resources(30, 30), 2),
    candidate(2, 30, resources(100, 0), 4, 1),
    candidate(3, 40, resources(0, 100), 3),
  ],
}

const request = (overrides = {}) => ({
  resourceWeights: resources(1, 1),
  afkMinutes: 0,
  fleetCount: 2,
  candidateIds: [1, 2, 3],
  bucketWeight: 0,
  incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  ...overrides,
})

const plan = (requestOverrides = {}, snapshotOverrides = {}) => {
  const raw = { ...rawSnapshot, ...snapshotOverrides }
  const input = request(requestOverrides)
  raw.modifierFactor =
    (input.incomeModifier.greatSuccess ? 1.5 : 1) * (1 + input.incomeModifier.daihatsuCount * 0.05)
  return planExpeditions({ snapshot: parseKC3ExpeditionPlannerSnapshot(raw), request: input })
}

test('plans one to three fleets with stable expedition and fleet permutations', () => {
  assert.deepEqual(
    plan({ fleetCount: 1 }).plans[0].pairings.map(({ expedition, fleet }) => [
      expedition.id,
      fleet.fleetNumber,
    ]),
    [[1, 2]],
  )
  assert.deepEqual(
    plan({ fleetCount: 2 }).plans[0].pairings.map(({ expedition, fleet }) => [
      expedition.id,
      fleet.fleetNumber,
    ]),
    [
      [1, 4],
      [2, 2],
    ],
  )
  assert.deepEqual(
    plan({ fleetCount: 3 }).plans[0].pairings.map(({ expedition, fleet }) => [
      expedition.id,
      fleet.fleetNumber,
    ]),
    [
      [1, 4],
      [2, 2],
      [3, 3],
    ],
  )
})

test('rejects inconsistent or incomplete busy-fleet mission state', () => {
  const inconsistent = structuredClone(rawSnapshot)
  inconsistent.candidates[0].fleetChecks[0].busy = true
  assert.throws(() => parseKC3ExpeditionPlannerSnapshot(inconsistent), /busy.*currentMission/)

  const incomplete = structuredClone(rawSnapshot)
  incomplete.candidates[0].fleetChecks[1].currentMission.completesAt = 0
  assert.throws(() => parseKC3ExpeditionPlannerSnapshot(incomplete), /currentMission.*不完整/)
})

test('does not treat a busy fleet current supply as post-return readiness', () => {
  const suppliedBusyCandidates = structuredClone(rawSnapshot.candidates)
  suppliedBusyCandidates.forEach((item) => {
    item.fleetChecks.find((fleet) => fleet.fleetNumber === 3).isSupplied = true
  })

  const currentSupply = plan({ fleetCount: 3 }, { candidates: suppliedBusyCandidates })
  const depletedSupply = plan({ fleetCount: 3 })

  assert.equal(currentSupply.plans[0].pairingScore, depletedSupply.plans[0].pairingScore)
})

test('preserves great-success, 0-4 daihatsu, resupply, and marriage rounding order', () => {
  for (let daihatsuCount = 0; daihatsuCount <= 4; daihatsuCount += 1) {
    const result = plan({
      fleetCount: 1,
      candidateIds: [1],
      incomeModifier: { greatSuccess: true, daihatsuCount },
    })
    const expedition = result.plans[0].pairings[0].expedition
    const gross = Math.floor(30 * 1.5 * (1 + daihatsuCount * 0.05))
    assert.deepEqual(expedition.estimatedResupplyCost, { fuel: 2, ammo: 3 })
    assert.deepEqual(expedition.netIncome, resources(gross - 2, gross - 3))
  }
})

test('preserves operation intervals, resource and bucket weights, and no-solution codes', () => {
  const afk = plan({ fleetCount: 1, afkMinutes: 120 })
  assert.equal(afk.settings.mode, 'afk')
  assert.equal(afk.plans[0].comparisonWindowMinutes, 120)

  for (const [durationMinutes, effectiveCycleMinutes] of [
    [30, 60],
    [55, 60],
    [90, 120],
    [140, 180],
    [175, 180],
  ]) {
    const hourlyCollection = plan(
      { fleetCount: 1, candidateIds: [1], afkMinutes: 60 },
      { candidates: [candidate(1, durationMinutes, resources(120, 0), 2)] },
    )
    const hourlyExpedition = hourlyCollection.plans[0].pairings[0].expedition
    assert.equal(hourlyExpedition.effectiveCycleMinutes, effectiveCycleMinutes)
    assert.equal(
      hourlyExpedition.hourlyIncome.fuel,
      (hourlyExpedition.netIncome.fuel * 60) / effectiveCycleMinutes,
    )
  }

  const fuelWeighted = plan({ fleetCount: 1, resourceWeights: resources(20, -5) })
  assert.equal(fuelWeighted.plans[0].pairings[0].expedition.id, 2)
  const buckets = plan({ fleetCount: 1, bucketWeight: 5 })
  assert.equal(buckets.plans[0].pairings[0].expedition.id, 2)

  const bucketOnly = candidate(6, 30, resources(0, 0), 4, 2)
  const resourceOnly = candidate(7, 30, resources(200, 200), 6)
  const balanced = plan(
    { fleetCount: 2, candidateIds: [2, 6, 7], bucketWeight: 5 },
    { candidates: [rawSnapshot.candidates[1], bucketOnly, resourceOnly] },
  )
  assert.equal(balanced.status, 'success', JSON.stringify(balanced))
  assert.deepEqual(balanced.plans[0].pairings.map(({ expedition }) => expedition.id).sort(), [2, 6])
  assert.equal(balanced.settings.bucketWeight, 5)

  const fuelFirst = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      resourceWeights: resources(20, -5, -5, -5),
      bucketWeight: 5,
    },
    {
      candidates: [candidate(1, 30, resources(200, 0), 2), candidate(2, 30, resources(0, 0), 4, 1)],
    },
  )
  assert.equal(fuelFirst.plans[0].pairings[0].expedition.id, 1)

  const slightlyFuelFirst = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      resourceWeights: resources(20, 0, 0, 0),
      bucketWeight: 15,
    },
    {
      candidates: [candidate(1, 30, resources(200, 0), 2), candidate(2, 30, resources(0, 0), 4, 1)],
    },
  )
  assert.equal(slightlyFuelFirst.plans[0].pairings[0].expedition.id, 1)

  const bucketFirst = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      resourceWeights: resources(5, -5, -5, -5),
      bucketWeight: 20,
    },
    {
      candidates: [candidate(1, 30, resources(200, 0), 2), candidate(2, 30, resources(0, 0), 4, 1)],
    },
  )
  assert.equal(bucketFirst.plans[0].pairings[0].expedition.id, 2)

  const bucketFocused = plan(
    { fleetCount: 2, candidateIds: [2, 6, 7], bucketWeight: 20 },
    { candidates: [rawSnapshot.candidates[1], bucketOnly, resourceOnly] },
  )
  assert.deepEqual(
    bucketFocused.plans[0].pairings.map(({ expedition }) => expedition.id).sort(),
    [2, 6],
  )

  const bucketAvoiding = plan(
    { fleetCount: 2, candidateIds: [2, 6, 7], bucketWeight: -5 },
    { candidates: [rawSnapshot.candidates[1], bucketOnly, resourceOnly] },
  )
  assert.deepEqual(
    bucketAvoiding.plans[0].pairings.map(({ expedition }) => expedition.id).sort(),
    [2, 7],
  )

  assert.equal(plan({ fleetCount: 3 }, { fleetNumbers: [2, 3] }).reasonCode, 'INSUFFICIENT_FLEETS')
  assert.equal(
    plan({ fleetCount: 2, candidateIds: [1] }, { candidates: [rawSnapshot.candidates[0]] })
      .reasonCode,
    'INSUFFICIENT_EXPEDITIONS',
  )
})
