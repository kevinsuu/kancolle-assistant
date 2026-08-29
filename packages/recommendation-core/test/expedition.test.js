const assert = require('node:assert/strict')
const test = require('node:test')
const {
  calculateBucketExpectedPerRun,
  calculateCombinationScore,
  calculatePlanScoreDetails,
  calculateResourceBenchmarks,
  calculateResourceYieldMaximums,
  calculateSatisfaction,
  calculateUtilityScore,
  compareOptimizationCombinations,
  normalizeResourceWeights,
  normalizeResourceYield,
  parseKC3ExpeditionPlannerSnapshot,
  planExpeditions,
  PRIORITY_WEIGHT_BY_RANK,
  priorityPreferenceToWeights,
  priorityRankToWeight,
  resourcePreferencesFromPriorityMap,
  resourcePreferencesToWeights,
  resourceUtility,
  satisfiesResourceConstraints,
  validateResourcePriorityMap,
  validateResourcePreferenceMap,
  validateOptimizationDebugReport,
} = require('../dist/index.js')

const resources = (fuel, ammo, steel = 0, bauxite = 0) => ({
  fuel,
  ammo,
  steel,
  bauxite,
})

const vector = ({ fuel = 0, ammo = 0, steel = 0, bauxite = 0, bucket = 0 } = {}) => ({
  fuel,
  ammo,
  steel,
  bauxite,
  bucket,
})

const priorities = ({ fuel = null, ammo = null, steel = null, bauxite = null, bucket = null }) => ({
  fuel,
  ammo,
  steel,
  bauxite,
  bucket,
})

const resourcePreferences = ({
  fuel = { mode: 'ignore' },
  ammo = { mode: 'ignore' },
  steel = { mode: 'ignore' },
  bauxite = { mode: 'ignore' },
  bucket = { mode: 'ignore' },
} = {}) => ({
  fuel,
  ammo,
  steel,
  bauxite,
  bucket,
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

const bucketReward = (itemSlot, rewardRule = 'random', max = 1) => ({
  item: 'bucket',
  min: 0,
  max,
  itemSlot,
  rewardRule,
  acquisitionProbability: null,
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

const planKey = (item) =>
  item.pairings
    .map(({ expedition }) => expedition.id)
    .sort((left, right) => left - right)
    .join('+')

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
      [2, 2],
      [3, 3],
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

test('normalizes expedition utility by each resource maximum before applying concave utility', () => {
  const ammoHeavy = vector({ fuel: 100, ammo: 200, bauxite: 20 })
  const bauxiteHeavy = vector({ fuel: 100, ammo: 50, bauxite: 100 })
  const maximums = calculateResourceYieldMaximums([ammoHeavy, bauxiteHeavy])
  const weights = vector({ fuel: 0, ammo: 5, bauxite: 20 })

  const ammoHeavyScore = calculateUtilityScore(normalizeResourceYield(ammoHeavy, maximums), weights)
  const bauxiteHeavyScore = calculateUtilityScore(
    normalizeResourceYield(bauxiteHeavy, maximums),
    weights,
  )

  assert.ok(bauxiteHeavyScore > ammoHeavyScore)
  assert.ok(Math.abs(bauxiteHeavyScore - 0.8875) < 1e-12)
  assert.ok(Math.abs(ammoHeavyScore - 0.488) < 1e-12)
})

test('zero weights remove a resource from expedition utility scoring', () => {
  const normalAmmo = vector({ ammo: 10 })
  const extremeAmmo = vector({ ammo: 1000 })
  const maximums = calculateResourceYieldMaximums([normalAmmo, extremeAmmo])
  const weights = vector({ ammo: 0 })

  assert.equal(
    calculateUtilityScore(normalizeResourceYield(normalAmmo, maximums), weights),
    calculateUtilityScore(normalizeResourceYield(extremeAmmo, maximums), weights),
  )
})

test('bucket utility uses normalized hourly yield without a fixed conversion multiplier', () => {
  const highBucket = vector({ bucket: 0.8 })
  const lowBucket = vector({ bucket: 0.1 })
  const maximums = calculateResourceYieldMaximums([highBucket, lowBucket])
  const weights = vector({ bucket: 20 })

  assert.equal(normalizeResourceYield(highBucket, maximums).bucket, 1)
  assert.equal(calculateUtilityScore(normalizeResourceYield(highBucket, maximums), weights), 1)
  assert.equal(
    calculateUtilityScore(normalizeResourceYield(lowBucket, maximums), weights),
    0.234375,
  )
})

test('bucket item rewards use expected value instead of maximum drop count', () => {
  const randomBucket = bucketReward('left')
  const rightBucket = bucketReward('right', 'great-success-guaranteed')

  assert.equal(calculateBucketExpectedPerRun(randomBucket, false), 0.5)
  assert.equal(calculateBucketExpectedPerRun(randomBucket, true), 0.5)
  assert.equal(calculateBucketExpectedPerRun(rightBucket, false), 0)
  assert.equal(calculateBucketExpectedPerRun(rightBucket, true), 1)
})

test('priority ranks convert to internal weights with the shared priority decay', () => {
  assert.deepEqual(PRIORITY_WEIGHT_BY_RANK, { 1: 100, 2: 70, 3: 45, 4: 25, 5: 10 })
  assert.equal(priorityRankToWeight(null), 0)
  assert.deepEqual(
    resourcePreferencesToWeights(
      resourcePreferencesFromPriorityMap(
        priorities({ bucket: 1, fuel: 2, bauxite: 3, ammo: 4, steel: 5 }),
      ),
    ),
    vector({ bucket: 100, fuel: 70, bauxite: 45, ammo: 25, steel: 10 }),
  )
  assert.deepEqual(
    priorityPreferenceToWeights(priorities({ bucket: 1, fuel: 2, bauxite: 3, ammo: 4, steel: 5 })),
    vector({ bucket: 100, fuel: 70, bauxite: 45, ammo: 25, steel: 10 }),
  )
})

test('ignored priority resources convert to zero and do not affect utility', () => {
  const weights = resourcePreferencesToWeights(
    resourcePreferences({
      bucket: { mode: 'optimize', rank: 1 },
      fuel: { mode: 'optimize', rank: 2 },
    }),
  )

  assert.deepEqual(weights, vector({ bucket: 100, fuel: 70 }))
  assert.equal(
    calculateCombinationScore(vector({ bucket: 0.5, fuel: 0.5, ammo: 0 }), weights),
    calculateCombinationScore(vector({ bucket: 0.5, fuel: 0.5, ammo: 1 }), weights),
  )
  assert.equal(
    calculateCombinationScore(vector({ bucket: 0.5, fuel: 0.5, ammo: 0 }), weights),
    calculateCombinationScore(vector({ bucket: 0.5, fuel: 0.5, ammo: -1 }), weights),
  )
})

test('priority scoring remains weighted utility instead of strict lexicographic order', () => {
  const weights = resourcePreferencesToWeights(
    resourcePreferences({
      bucket: { mode: 'optimize', rank: 1 },
      fuel: { mode: 'optimize', rank: 2 },
    }),
  )

  assert.ok(
    calculateCombinationScore(vector({ bucket: 0.8, fuel: 0.4 }), weights) >
      calculateCombinationScore(vector({ bucket: 0.7, fuel: 0.4 }), weights),
  )
  assert.ok(
    calculateCombinationScore(vector({ bucket: 0.95, fuel: 0.8 }), weights) >
      calculateCombinationScore(vector({ bucket: 1, fuel: -0.8 }), weights),
  )
})

test('resource constraints reject negative constrained net yield before scoring', () => {
  const preferences = resourcePreferences({
    fuel: { mode: 'optimize', rank: 1 },
    bauxite: { mode: 'optimize', rank: 2 },
    ammo: { mode: 'constraint', minimumNetYieldPerHour: 0 },
  })

  assert.equal(
    satisfiesResourceConstraints(vector({ fuel: 100, bauxite: 100, ammo: -1 }), preferences),
    false,
  )
  assert.equal(
    satisfiesResourceConstraints(vector({ fuel: 90, bauxite: 90, ammo: 0 }), preferences),
    true,
  )
})

test('constraint resources are feasibility checks, not score contributors', () => {
  const weights = resourcePreferencesToWeights(
    resourcePreferences({
      fuel: { mode: 'optimize', rank: 1 },
      bauxite: { mode: 'optimize', rank: 2 },
      ammo: { mode: 'constraint', minimumNetYieldPerHour: 0 },
    }),
  )

  assert.equal(
    calculateCombinationScore(vector({ fuel: 0.8, bauxite: 0.7, ammo: 0.001 }), weights),
    calculateCombinationScore(vector({ fuel: 0.8, bauxite: 0.7, ammo: 1 }), weights),
  )
})

test('optimized resources enter benchmark, satisfaction, utility, and score', () => {
  const ignoredAmmoWeights = resourcePreferencesToWeights(
    resourcePreferences({ fuel: { mode: 'optimize', rank: 1 } }),
  )
  const optimizedAmmoWeights = resourcePreferencesToWeights(
    resourcePreferences({
      fuel: { mode: 'optimize', rank: 1 },
      ammo: { mode: 'optimize', rank: 2 },
    }),
  )

  assert.equal(
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 0 }), ignoredAmmoWeights),
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 1 }), ignoredAmmoWeights),
  )
  assert.ok(
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 1 }), optimizedAmmoWeights) >
      calculateCombinationScore(vector({ fuel: 0.5, ammo: 0 }), optimizedAmmoWeights),
  )
})

test('priority ranks must be unique and continuous', () => {
  assert.equal(validateResourcePriorityMap(priorities({ bucket: 1, fuel: 1, bauxite: 2 })), false)
  assert.equal(validateResourcePriorityMap(priorities({ bucket: 1, fuel: 3 })), false)
  assert.equal(validateResourcePriorityMap(priorities({ bucket: 1, fuel: 2 })), true)
  assert.equal(
    validateResourcePreferenceMap(
      resourcePreferences({
        bucket: { mode: 'optimize', rank: 1 },
        fuel: { mode: 'optimize', rank: 1 },
      }),
    ),
    false,
  )
  assert.equal(
    validateResourcePreferenceMap(
      resourcePreferences({
        bucket: { mode: 'optimize', rank: 1 },
        fuel: { mode: 'optimize', rank: 3 },
      }),
    ),
    false,
  )
  assert.equal(
    validateResourcePreferenceMap(
      resourcePreferences({
        bucket: { mode: 'optimize', rank: 1 },
        ammo: { mode: 'constraint', minimumNetYieldPerHour: 0 },
      }),
    ),
    true,
  )
})

test('constraint filtering happens before pareto pruning', () => {
  const result = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      preference: {
        mode: 'priority',
        preferences: resourcePreferences({
          fuel: { mode: 'optimize', rank: 1 },
          bauxite: { mode: 'optimize', rank: 2 },
          ammo: { mode: 'constraint', minimumNetYieldPerHour: 0 },
        }),
      },
      debug: true,
    },
    {
      candidates: [
        candidate(1, 60, resources(300, 0, 0, 100), 2),
        candidate(2, 60, resources(270, 50, 0, 90), 2),
      ],
    },
  )

  assert.equal(result.status, 'success')
  assert.equal(result.plans[0].pairings[0].expedition.id, 2)
  assert.equal(result.optimizationDebug.context.totalCombinationCount, 2)
  assert.equal(result.optimizationDebug.context.constraintRejectedCount, 1)
  assert.equal(result.optimizationDebug.context.feasibleCombinationCount, 1)
  assert.equal(result.optimizationDebug.pareto.remainingCombinationCount, 1)
})

test('no feasible expedition plan does not fall back to constraint violations', () => {
  const result = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      preference: {
        mode: 'priority',
        preferences: resourcePreferences({
          fuel: { mode: 'optimize', rank: 1 },
          ammo: { mode: 'constraint', minimumNetYieldPerHour: 500 },
        }),
      },
      debug: true,
    },
    {
      candidates: [candidate(1, 60, resources(300, 0), 2), candidate(2, 60, resources(270, 50), 2)],
    },
  )

  assert.equal(result.status, 'no-feasible-plan')
  assert.equal(result.constraintRejectedCount, 2)
  assert.equal(result.feasibleCombinationCount, 0)
  assert.equal(result.closestViolations[0].resource, 'ammo')
  assert.equal(result.optimizationDebug.context.constraintRejectedCount, 2)
  assert.equal(result.optimizationDebug.context.feasibleCombinationCount, 0)
})

test('planner debug exposes priority to internal and normalized weight mapping', () => {
  const result = plan({
    fleetCount: 1,
    debug: true,
    preference: {
      mode: 'priority',
      preferences: resourcePreferences({
        bucket: { mode: 'optimize', rank: 1 },
        fuel: { mode: 'optimize', rank: 2 },
        bauxite: { mode: 'optimize', rank: 3 },
        ammo: { mode: 'optimize', rank: 4 },
        steel: { mode: 'optimize', rank: 5 },
      }),
    },
  })

  assert.equal(result.settings.bucketWeight, 100)
  assert.deepEqual(result.settings.resourceWeights, {
    fuel: 70,
    ammo: 25,
    steel: 10,
    bauxite: 45,
  })
  assert.equal(result.optimizationDebug.context.preferenceMode, 'priority')
  assert.deepEqual(result.optimizationDebug.context.priorityOrder, [
    { resource: 'bucket', mode: 'optimize', rank: 1, internalWeight: 100, normalizedWeight: 0.4 },
    { resource: 'fuel', mode: 'optimize', rank: 2, internalWeight: 70, normalizedWeight: 0.28 },
    {
      resource: 'bauxite',
      mode: 'optimize',
      rank: 3,
      internalWeight: 45,
      normalizedWeight: 0.18,
    },
    { resource: 'ammo', mode: 'optimize', rank: 4, internalWeight: 25, normalizedWeight: 0.1 },
    { resource: 'steel', mode: 'optimize', rank: 5, internalWeight: 10, normalizedWeight: 0.04 },
  ])
})

test('equal weights compare each resource against its own best candidate yield', () => {
  const fuelSpecialist = vector({ fuel: 1000 })
  const bauxiteSpecialist = vector({ bauxite: 100 })
  const maximums = calculateResourceYieldMaximums([fuelSpecialist, bauxiteSpecialist])
  const weights = vector({ fuel: 10, ammo: 10, steel: 10, bauxite: 10, bucket: 10 })

  assert.equal(
    calculateUtilityScore(normalizeResourceYield(fuelSpecialist, maximums), weights),
    calculateUtilityScore(normalizeResourceYield(bauxiteSpecialist, maximums), weights),
  )
})

test('zero maximum resource yields normalize safely without non-finite scores', () => {
  const normalized = normalizeResourceYield(
    vector({ fuel: 100, ammo: Number.POSITIVE_INFINITY, steel: -10, bucket: 1 }),
    vector(),
  )
  const score = calculateUtilityScore(
    normalized,
    vector({ fuel: 20, ammo: 20, steel: 20, bauxite: 20, bucket: 20 }),
  )

  assert.deepEqual(normalized, vector())
  assert.equal(Number.isFinite(score), true)
})

test('concave utility favors covering multiple equally important resources', () => {
  const weights = vector({ fuel: 20, bauxite: 20 })

  assert.ok(
    calculateCombinationScore(vector({ fuel: 0.7, bauxite: 0.7 }), weights) >
      calculateCombinationScore(vector({ fuel: 0, bauxite: 1 }), weights),
  )
  assert.equal(
    calculateCombinationScore(vector({ fuel: 1, bauxite: 0 }), weights),
    calculateCombinationScore(vector({ fuel: 0, bauxite: 1 }), weights),
  )
  assert.ok(
    calculateCombinationScore(vector({ fuel: 0.6, bauxite: 0.8 }), weights) >
      calculateCombinationScore(vector({ fuel: 0.1, bauxite: 1 }), weights),
  )
})

test('zero resource weight keeps satisfaction changes out of the score', () => {
  const weights = vector({ fuel: 20, ammo: 0 })
  assert.equal(
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 0 }), weights),
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 1 }), weights),
  )
})

test('negative resource weight penalizes normalized utility instead of becoming zero', () => {
  const weights = vector({ fuel: 20, ammo: -5 })

  assert.deepEqual(normalizeResourceWeights(weights), vector({ fuel: 0.8, ammo: -0.2 }))
  assert.ok(
    calculateCombinationScore(vector({ fuel: 1, ammo: 0 }), weights) >
      calculateCombinationScore(vector({ fuel: 1, ammo: 1 }), weights),
  )
  assert.equal(calculateCombinationScore(vector({ ammo: 1 }), vector({ ammo: 0 })), 0)
})

test('bucket satisfaction uses its own hourly benchmark', () => {
  const satisfaction = calculateSatisfaction(vector({ bucket: 0.8 }), vector({ bucket: 1 }))
  assert.equal(satisfaction.bucket, 0.8)
})

test('negative resource yield remains worse than zero when a positive benchmark exists', () => {
  const satisfaction = calculateSatisfaction(vector({ fuel: -20 }), vector({ fuel: 200 }))

  assert.equal(satisfaction.fuel, -0.1)
  assert.equal(resourceUtility(satisfaction.fuel), -0.2100000000000002)
  assert.ok(resourceUtility(satisfaction.fuel) < resourceUtility(0))
})

test('all zero sliders use a deterministic fallback and do not crash', () => {
  const result = plan({
    fleetCount: 1,
    resourceWeights: resources(0, 0, 0, 0),
    bucketWeight: 0,
  })

  assert.equal(result.status, 'success')
  assert.equal(Number.isFinite(result.plans[0].utilityScore), true)
  assert.equal(Number.isFinite(result.plans[0].fallbackUtilityScore), true)
})

test('resource utility invariants hold for monotonicity, Pareto dominance, and benchmarks', () => {
  const fuelWeighted = vector({ fuel: 20 })
  const balancedWeights = vector({ fuel: 20, bauxite: 20 })

  assert.ok(
    calculateCombinationScore(vector({ fuel: 0.8, bauxite: 0.5 }), fuelWeighted) >=
      calculateCombinationScore(vector({ fuel: 0.6, bauxite: 0.5 }), fuelWeighted),
  )
  assert.ok(
    calculateCombinationScore(vector({ fuel: 0.8, bauxite: 0.8 }), balancedWeights) >
      calculateCombinationScore(vector({ fuel: 0.6, bauxite: 0.8 }), balancedWeights),
  )
  assert.equal(
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 0 }), fuelWeighted),
    calculateCombinationScore(vector({ fuel: 0.5, ammo: 1 }), fuelWeighted),
  )
  assert.deepEqual(
    calculateSatisfaction(vector({ fuel: 10, bucket: 1 }), vector({ fuel: 10, bucket: 1 })),
    vector({ fuel: 1, bucket: 1 }),
  )
  assert.deepEqual(
    calculateSatisfaction(
      vector(),
      vector({ fuel: 10, ammo: 10, steel: 10, bauxite: 10, bucket: 1 }),
    ),
    vector(),
  )
  assert.ok(
    calculateCombinationScore(vector({ fuel: 0.8 }), fuelWeighted) >=
      calculateCombinationScore(vector({ fuel: 0.6 }), fuelWeighted),
  )
})

test('plan score details expose benchmarks, satisfaction, utility, and contributions', () => {
  const benchmarks = calculateResourceBenchmarks([
    vector({ fuel: 100, bauxite: 50 }),
    vector({ fuel: 50, bauxite: 100 }),
  ])
  const details = calculatePlanScoreDetails(
    vector({ fuel: 50, bauxite: 100 }),
    benchmarks,
    vector({ fuel: 20, bauxite: 20 }),
  )

  assert.deepEqual(details.benchmark, vector({ fuel: 100, bauxite: 100 }))
  assert.deepEqual(details.satisfaction, vector({ fuel: 0.5, bauxite: 1 }))
  assert.deepEqual(details.utility, vector({ fuel: 0.75, bauxite: 1 }))
  assert.deepEqual(details.normalizedWeight, vector({ fuel: 0.5, bauxite: 0.5 }))
  assert.equal(details.totalScore, 0.875)
})

test('optimization debug report explains rankings without changing scoring results', () => {
  const normal = plan({ fleetCount: 2 })
  const debug = plan({ fleetCount: 2, debug: true })

  assert.equal(planKey(debug.plans[0]), planKey(normal.plans[0]))
  assert.ok(debug.optimizationDebug)
  assert.equal(debug.optimizationDebug.context.validCombinationCount, debug.combinationCount)
  assert.equal(debug.optimizationDebug.context.scoredCombinationCount, debug.prunedCombinationCount)
  assert.equal(debug.optimizationDebug.context.totalCombinationCount, debug.combinationCount)
  assert.equal(
    debug.optimizationDebug.context.remainingCombinationCount,
    debug.prunedCombinationCount,
  )
  assert.equal(
    debug.optimizationDebug.context.paretoRemovedCount,
    debug.combinationCount - debug.prunedCombinationCount,
  )
  assert.equal(debug.optimizationDebug.pareto.totalCombinationCount, debug.combinationCount)
  assert.equal(
    debug.optimizationDebug.pareto.remainingCombinationCount,
    debug.prunedCombinationCount,
  )
  assert.equal(debug.optimizationDebug.pareto.watchedCombinations.length, 5)
  assert.equal(debug.optimizationDebug.topCombinations.length, 3)
  assert.equal(debug.optimizationDebug.detailedCombinations.length, 3)
  assert.equal(validateOptimizationDebugReport(debug.optimizationDebug).length, 0)

  const rankOne = debug.optimizationDebug.detailedCombinations[0]
  const contributionSum = Object.values(rankOne.resourceScores).reduce(
    (sum, score) => sum + score.weightedContribution,
    0,
  )
  assert.ok(Math.abs(contributionSum - rankOne.totalScore) < 1e-9)
  assert.equal(rankOne.expeditionYields.length, 2)
  assert.deepEqual(debug.optimizationDebug.benchmarks.fuel.bestCombination, ['01', '02'])
  assert.deepEqual(debug.optimizationDebug.benchmarks.ammo.bestCombination, ['01', '03'])
})

test('optimization debug tracks requested combinations across pareto pruning', () => {
  const result = plan(
    {
      fleetCount: 3,
      candidateIds: [2, 5, 38],
      debug: true,
    },
    {
      accountShips: [
        { masterId: 101, level: 120, stype: 2, maxFuel: 20, maxAmmo: 20 },
        { masterId: 102, level: 80, stype: 2, maxFuel: 15, maxAmmo: 20 },
        { masterId: 103, level: 70, stype: 2, maxFuel: 15, maxAmmo: 25 },
        { masterId: 104, level: 60, stype: 2, maxFuel: 20, maxAmmo: 25 },
        { masterId: 105, level: 50, stype: 2, maxFuel: 25, maxAmmo: 30 },
        { masterId: 106, level: 50, stype: 2, maxFuel: 25, maxAmmo: 30 },
        { masterId: 201, level: 40, stype: 3, maxFuel: 25, maxAmmo: 30 },
      ],
      candidates: [
        candidate(2, 30, resources(100, 0), 2, 1),
        candidate(5, 90, resources(0, 200), 2),
        candidate(38, 175, resources(420, 0, 200, 0), 2),
      ],
    },
  )

  assert.equal(result.status, 'success')
  const watched = result.optimizationDebug.pareto.watchedCombinations.find(
    (combination) => combination.requestedExpeditionIds.join('+') === '02+05+38',
  )
  assert.ok(watched)
  assert.equal(watched.validBeforePruning, true)
  assert.equal(watched.presentAfterPruning, true)
  assert.deepEqual(watched.expeditionIds, ['02', '05', '38'])
  assert.ok(watched.score)
  assert.equal(watched.score.totalScore, result.optimizationDebug.rankedCombinations[0].totalScore)
  assert.equal(validateOptimizationDebugReport(result.optimizationDebug).length, 0)
})

test('optimization comparison helper reports score-contribution winner reasons', () => {
  const result = plan({ fleetCount: 2, debug: true })
  const comparison = compareOptimizationCombinations(
    result.optimizationDebug,
    ['01', '02'],
    ['02', '03'],
  )

  assert.ok(comparison)
  assert.equal(comparison.winner, 'right')
  assert.ok(comparison.scoreDifference > 0)
  const scoreByCombination = new Map(
    result.optimizationDebug.rankedCombinations.map((combination) => [
      combination.expeditionIds.join('+'),
      combination.totalScore,
    ]),
  )
  assert.equal(comparison.leftScore, scoreByCombination.get('01+02'))
  assert.equal(comparison.rightScore, scoreByCombination.get('02+03'))
  assert.ok(comparison.explanation.advantages.some((item) => item.resource === 'ammo'))
  assert.equal(
    compareOptimizationCombinations(result.optimizationDebug, ['99'], ['02', '03']),
    null,
  )
})

test('optimization expedition debug exposes item reward source without applying resource multipliers', () => {
  const result = plan(
    {
      fleetCount: 1,
      candidateIds: [2],
      bucketWeight: 20,
      incomeModifier: { greatSuccess: true, daihatsuCount: 4 },
      debug: true,
    },
    {
      candidates: [
        {
          ...candidate(2, 30, resources(100, 0), 4, 1),
          bucketReward: {
            item: 'bucket',
            min: 0,
            max: 1,
            itemSlot: 'right',
            rewardRule: 'great-success-guaranteed',
            acquisitionProbability: null,
          },
        },
      ],
    },
  )

  const expedition = result.optimizationDebug.detailedCombinations[0].expeditionYields[0]
  assert.equal(expedition.resourceRewardAfterSuccessMultiplier.fuel, 150)
  assert.equal(expedition.resourceRewardAfterDaihatsu.fuel, 180)
  assert.equal(
    expedition.netRewardPerRun.fuel,
    expedition.resourceRewardAfterDaihatsu.fuel - expedition.supplyCostPerRun.fuel,
  )
  assert.equal(expedition.bucketExpectedPerRun, 1)
  assert.equal(expedition.itemRewardDebug.itemSlot, 'right')
  assert.equal(expedition.itemRewardDebug.itemPosition, 'right')
  assert.equal(expedition.itemRewardDebug.rewardRule, 'great-success-guaranteed')
  assert.equal(expedition.itemRewardDebug.acquisitionProbability, 1)
  assert.equal(expedition.itemRewardDebug.expectedPerRun, 1)
  assert.equal(expedition.itemRewardDebug.expectedPerHour, 2)
  assert.equal(validateOptimizationDebugReport(result.optimizationDebug).length, 0)
})

test('great success does not guarantee random left-side bucket rewards', () => {
  const result = plan(
    {
      fleetCount: 1,
      candidateIds: [2],
      bucketWeight: 20,
      incomeModifier: { greatSuccess: true, daihatsuCount: 0 },
      debug: true,
    },
    {
      candidates: [
        {
          ...candidate(2, 30, resources(100, 0), 4, 1),
          bucketReward: bucketReward('left'),
        },
      ],
    },
  )

  const expedition = result.optimizationDebug.detailedCombinations[0].expeditionYields[0]
  assert.equal(result.plans[0].bucketPotentialHourly, 1)
  assert.equal(expedition.bucketExpectedPerRun, 0.5)
  assert.equal(expedition.expectedNetPerHour.bucket, 1)
  assert.equal(expedition.itemRewardDebug.rewardRule, 'random')
  assert.equal(expedition.itemRewardDebug.acquisitionProbability, 0.5)
})

test('high fuel and bauxite weights do not select a fuel-starved 02+06+B1 set', () => {
  const badLongDistanceAntiAirB1 = [
    candidate(2, 30, resources(0, 100, 30, 0), 4, 1),
    candidate(6, 40, resources(0, 0, 0, 80), 4),
    candidate(110, 35, resources(0, 0, 10, 30), 6),
  ]
  const fuelRecoveryAlternative = candidate(37, 120, resources(200, 0, 10, 20), 6)
  const result = plan(
    {
      fleetCount: 3,
      candidateIds: [2, 6, 37, 110],
      resourceWeights: resources(20, 5, 5, 20),
      bucketWeight: 15,
      incomeModifier: { greatSuccess: true, daihatsuCount: 4 },
      planLimit: 5,
    },
    {
      accountShips: [
        ...rawSnapshot.accountShips,
        { masterId: 201, level: 90, stype: 3, maxFuel: 25, maxAmmo: 30 },
        { masterId: 202, level: 90, stype: 16, maxFuel: 40, maxAmmo: 40 },
      ],
      candidates: [...badLongDistanceAntiAirB1, fuelRecoveryAlternative],
    },
  )

  assert.equal(result.status, 'success')
  const badPlan = result.plans.find((item) => planKey(item) === '2+6+110')
  assert.ok(
    badPlan,
    JSON.stringify(
      result.plans.map((item) => ({
        expeditions: planKey(item),
        scoreDetails: item.scoreDetails,
      })),
    ),
  )

  const best = result.plans[0]
  assert.notEqual(planKey(best), '2+6+110')
  assert.ok(best.satisfaction.fuel > badPlan.satisfaction.fuel)
  assert.ok(best.satisfaction.bauxite >= 0.5)
  assert.ok(best.satisfaction.bucket >= badPlan.satisfaction.bucket)
  assert.ok(
    best.utilityScore > badPlan.utilityScore,
    JSON.stringify({
      best: { expeditions: planKey(best), scoreDetails: best.scoreDetails },
      bad: { expeditions: planKey(badPlan), scoreDetails: badPlan.scoreDetails },
    }),
  )
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

  const fuelWeighted = plan({ fleetCount: 1, resourceWeights: resources(20, 0) })
  assert.equal(fuelWeighted.plans[0].pairings[0].expedition.id, 2)
  const buckets = plan({ fleetCount: 1, bucketWeight: 5 })
  assert.equal(buckets.plans[0].pairings[0].expedition.id, 2)

  const bucketAvoiding = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      resourceWeights: resources(20, 0, 0, 0),
      bucketWeight: -5,
    },
    {
      candidates: [
        candidate(1, 30, resources(200, 0), 2),
        candidate(2, 30, resources(200, 0), 2, 1),
      ],
    },
  )
  assert.equal(bucketAvoiding.plans[0].pairings[0].expedition.id, 1)
  assert.equal(bucketAvoiding.plans[0].scoreDetails.normalizedWeight.bucket, -0.2)

  const bauxitePreference = plan(
    {
      fleetCount: 1,
      candidateIds: [33, 34],
      resourceWeights: resources(0, 5, 0, 20),
    },
    {
      candidates: [
        candidate(33, 60, resources(100, 200, 0, 20), 2),
        candidate(34, 60, resources(100, 50, 0, 100), 2),
      ],
    },
  )
  assert.equal(bauxitePreference.plans[0].pairings[0].expedition.id, 34)
  assert.equal(bauxitePreference.plans[0].normalizedYield.bauxite, 1)

  const bucketPriority = plan(
    {
      fleetCount: 1,
      candidateIds: [2, 6],
      resourceWeights: resources(20, 0, 0, 0),
      bucketWeight: 10,
    },
    {
      candidates: [
        candidate(2, 30, resources(100, 0), 4),
        candidate(6, 30, resources(100, 0), 4, 1),
      ],
    },
  )
  assert.equal(bucketPriority.plans[0].pairings[0].expedition.id, 6)
  assert.ok(bucketPriority.plans[0].bucketPotentialHourly > 0)

  const bucketOnly = candidate(6, 30, resources(0, 0), 4, 2)
  const resourceOnly = candidate(7, 30, resources(200, 200), 6)
  const balanced = plan(
    { fleetCount: 2, candidateIds: [2, 6, 7], bucketWeight: 5 },
    { candidates: [rawSnapshot.candidates[1], bucketOnly, resourceOnly] },
  )
  assert.equal(balanced.status, 'success', JSON.stringify(balanced))
  assert.deepEqual(balanced.plans[0].pairings.map(({ expedition }) => expedition.id).sort(), [6, 7])
  assert.equal(balanced.settings.bucketWeight, 5)

  const fuelFirst = plan(
    {
      fleetCount: 1,
      candidateIds: [1, 2],
      resourceWeights: resources(20, 0, 0, 0),
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
      resourceWeights: resources(5, 0, 0, 0),
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

  assert.equal(plan({ fleetCount: 3 }, { fleetNumbers: [2, 3] }).reasonCode, 'INSUFFICIENT_FLEETS')
  assert.equal(
    plan({ fleetCount: 2, candidateIds: [1] }, { candidates: [rawSnapshot.candidates[0]] })
      .reasonCode,
    'INSUFFICIENT_EXPEDITIONS',
  )
})
