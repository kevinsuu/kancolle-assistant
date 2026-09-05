const assert = require('node:assert/strict')
const test = require('node:test')
const path = require('node:path')
const Module = require('node:module')
const { buildSync } = require('esbuild')
const {
  parseKC3AccountSnapshot,
  recommendFleet,
  calculateFleetMetrics,
  scoreFleet,
} = require('../dist/index.js')
const { createRawSnapshot } = require('./fixtures')
const compiled = buildSync({
  entryPoints: [path.join(__dirname, '../src/solver/gear-search.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
})
const searchModule = new Module(__filename)
searchModule._compile(compiled.outputFiles[0].text, __filename)
const { buildGearSolutions, createGearSearchContext } = searchModule.exports
const zero = {
  firepower: 0,
  torpedo: 0,
  antiAir: 0,
  armor: 0,
  asw: 0,
  los: 0,
  bombing: 0,
  accuracy: 0,
  evasion: 0,
}
const gear = (id, typeId, stats = {}, air = {}) => ({
  id,
  masterId: id + 1000,
  name: `gear ${id}`,
  typeId,
  type: String(typeId),
  locked: true,
  iconTypeId: typeId,
  stats: { ...zero, ...stats },
  improvement: 0,
  proficiency: 0,
  losImprovement: 0,
  airPowerBySlotSize: air,
  currentlyEquippedBy: null,
  antiInstallationAircraft: false,
})
const route = (constraints = []) => ({
  id: 'fixture',
  mapId: 'fixture',
  tags: [],
  calculatedConstraints: constraints,
})
const fixture = (ships, equipment) => {
  const raw = createRawSnapshot({ shipCount: ships.length })
  raw.equipment = equipment
  raw.currentFleetShipIds = []
  raw.ships = raw.ships.map((ship, index) => ({
    ...ship,
    ...ships[index],
    regularEquipableMasterIds: equipment.map((gear) => gear.masterId),
  }))
  return parseKC3AccountSnapshot(raw)
}
const solve = (account, roles, target = route(), { shell = 0, drum = 0, fast = false } = {}) => {
  const context = createGearSearchContext(account)
  const fleet = {
    members: account.ships.map((ship, index) => ({ ship, role: roles[index] })),
    usedShipIds: new Set(),
    score: 0,
    lastCandidateIndex: 0,
  }
  const solutions = buildGearSolutions(
    fleet,
    context,
    target.calculatedConstraints.find((constraint) => constraint.kind === 'air-power')?.minimum ??
      null,
    fast,
    shell,
    0,
    false,
    0,
    false,
    drum,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    { route: target, hqLevel: account.hqLevel, objective: 'balanced' },
  )
  return { solutions, diagnostics: context.diagnostics }
}
const assertUnique = (builds) => {
  const ids = builds
    .flatMap((build) => [...build.equipment, build.expansionSlot])
    .filter(Boolean)
    .map((gear) => gear.id)
  assert.equal(new Set(ids).size, ids.length)
}

test('ordinary carrier searches three fighters and one attacker to pass air power', () => {
  const equipment = [
    ...Array.from({ length: 8 }, (_, i) => gear(i + 1, 8, { torpedo: 10 })),
    ...Array.from({ length: 8 }, (_, i) =>
      gear(i + 101, 6, { antiAir: 10 }, { 10: 30, 20: 45, 30: 55, 40: 65 }),
    ),
  ]
  const account = fixture(
    [{ shipTypeId: 11, slotSizes: [40, 30, 20, 10], equippedItemIds: [0, 0, 0, 0] }],
    equipment,
  )
  const target = route([{ kind: 'air-power', minimum: 150, recommended: 150 }])
  const { solutions, diagnostics } = solve(account, ['carrier-air-superiority'], target)
  assert.ok(solutions.length > 0)
  for (const builds of solutions) {
    assert.ok(calculateFleetMetrics(builds, target, account.hqLevel).airPower >= 150)
    assert.equal(builds[0].equipment.filter((gear) => gear?.typeId === 8).length, 1)
    assertUnique(builds)
  }
  assert.equal(diagnostics.flexibleCarrierFleetCount, 1)
  assert.ok(diagnostics.planCount > 0)
})

test('deferred choices keep sibling regular and expansion inventories independent', () => {
  const equipment = [
    gear(1, 8, { torpedo: 10 }),
    ...Array.from({ length: 3 }, (_, i) =>
      gear(10 + i, 6, { antiAir: 10 }, { 10: 30, 20: 45, 30: 55, 40: 65 }),
    ),
    gear(20, 21, { antiAir: 8 }),
    gear(21, 21, { antiAir: 5 }),
  ]
  const account = fixture(
    [
      {
        shipTypeId: 11,
        slotSizes: [40, 30, 20, 10],
        equippedItemIds: [0, 0, 0, 0],
        expansionSlotUnlocked: true,
        expansionEquipableEquipmentIds: [20, 21],
      },
    ],
    equipment,
  )
  const target = route([{ kind: 'air-power', minimum: 150, recommended: 150 }])
  const first = solve(account, ['carrier-air-superiority'], target)
  const second = solve(account, ['carrier-air-superiority'], target)
  assert.deepEqual(first.solutions, second.solutions)
  assert.ok(first.solutions.length > 1)
  assert.ok(first.solutions.every(([build]) => build.expansionSlot?.id === 20))
  for (const builds of first.solutions) {
    assertUnique(builds)
    assert.equal(builds[0].equipment.filter((gear) => gear?.typeId === 6).length, 3)
    assert.equal(builds[0].equipment.filter((gear) => gear?.typeId === 8).length, 1)
    assert.ok(calculateFleetMetrics(builds, target, account.hqLevel).airPower >= 150)
  }
  assert.ok(first.diagnostics.expandedStateCount > first.diagnostics.materializedStateCount)
})

test('minimum one OASW ship retains a one-sonar combat setup and a surface escort', () => {
  const equipment = [
    gear(1, 14, { asw: 15 }),
    ...Array.from({ length: 6 }, (_, i) => gear(10 + i, 1, { firepower: 3 })),
    gear(30, 12, { los: 5 }),
  ]
  const stats = { ...createRawSnapshot().ships[0].stats, asw: 90 }
  const account = fixture([{ stats }, { stats }], equipment)
  const target = route([{ kind: 'opening-asw', minimum: 1 }])
  const { solutions, diagnostics } = solve(account, ['anti-submarine', 'anti-submarine'], target)
  assert.ok(
    solutions.some(
      (builds) => builds.filter((build) => build.role === 'anti-submarine').length === 1,
    ),
  )
  for (const builds of solutions) {
    assert.ok(calculateFleetMetrics(builds, target, account.hqLevel).openingAswCount >= 1)
    assert.equal(
      builds.flatMap((build) => build.equipment).filter((gear) => gear?.typeId === 14).length,
      1,
    )
    assertUnique(builds)
  }
  assert.ok(diagnostics.aswAllocationPlanCount >= 2)
})

test('ordinary slots may remain empty while hard requirements still fail', () => {
  const account = fixture([{}], [gear(1, 1, { firepower: 3 }), gear(2, 1, { firepower: 3 })])
  const { solutions, diagnostics } = solve(account, ['escort-destroyer'])
  assert.ok(solutions.length)
  assert.equal(solutions[0][0].equipment.filter(Boolean).length, 2)
  assert.ok(diagnostics.emptyRegularSlotSolutionCount > 0)
  const failed = solve(account, ['escort-destroyer'], route(), { drum: 1 })
  assert.equal(failed.solutions.length, 0)
  assert.equal(failed.diagnostics.emptyRegularSlotSolutionCount, 0)
})

test('torpedo cruisers retain both two-gun and two-torpedo alternatives', () => {
  const equipment = [
    gear(1, 22, { torpedo: 12 }),
    gear(2, 2, { firepower: 6 }),
    gear(3, 2, { firepower: 6 }),
    gear(4, 5, { torpedo: 8 }),
    gear(5, 5, { torpedo: 8 }),
  ]
  const account = fixture([{ shipTypeId: 4 }], equipment)
  const { solutions } = solve(account, ['torpedo-cruiser'])
  assert.ok(
    solutions.some(
      (builds) => builds[0].equipment.filter((gear) => gear?.typeId === 2).length === 2,
    ),
  )
  assert.ok(
    solutions.some(
      (builds) => builds[0].equipment.filter((gear) => gear?.typeId === 5).length === 2,
    ),
  )
  solutions.forEach((builds) => {
    assert.equal(builds[0].equipment[0]?.typeId, 22)
    assertUnique(builds)
  })
})

test('Type 3 Shell and drum assignments compare different compatible ships', () => {
  const equipment = [
    gear(1, 18),
    gear(2, 30),
    ...Array.from({ length: 6 }, (_, i) => gear(10 + i, 2, { firepower: 5 })),
    ...Array.from({ length: 4 }, (_, i) => gear(20 + i, 10, { los: 5 })),
  ]
  const account = fixture(
    [
      { shipTypeId: 6, slotSizes: [2, 2, 2, 2], equippedItemIds: [0, 0, 0, 0] },
      { shipTypeId: 6, slotSizes: [2, 2, 2, 2], equippedItemIds: [0, 0, 0, 0] },
    ],
    equipment,
  )
  const { solutions, diagnostics } = solve(
    account,
    ['utility-cruiser', 'utility-cruiser'],
    route(),
    { shell: 1, drum: 1 },
  )
  assert.ok(solutions.length)
  const carriers = new Set(
    solutions.map(
      (builds) =>
        builds.find((build) => build.equipment.some((gear) => gear?.typeId === 18)).ship.id,
    ),
  )
  assert.equal(carriers.size, 2)
  for (const builds of solutions) {
    assert.equal(
      builds.flatMap((build) => build.equipment).filter((gear) => gear?.typeId === 30).length,
      1,
    )
    assertUnique(builds)
  }
  assert.ok(diagnostics.specialAssignmentPlanCount >= 4)
})

test('exact combat candidate pool retains alternatives for the same selected fleet', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot({ shipCount: 4 }))
  const result = recommendFleet({
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
    account,
    candidateLimit: 18,
  })
  assert.equal(result.status, 'success')
  assert.ok(result.recommendations.length > 1)
  assert.equal(
    new Set(
      result.recommendations.map((item) => item.ships.map((build) => build.ship.id).join(',')),
    ).size,
    1,
  )
  assert.ok(
    new Set(
      result.recommendations.map((item) =>
        item.ships.map((build) => build.equipment.map((gear) => gear?.typeId).join(',')).join('|'),
      ),
    ).size > 1,
  )
  assert.ok(result.diagnostics.loadoutSearch.planCount > 1)
})

test('a shared optional midget submarine does not make both eligible cruisers mandatory carriers', () => {
  const equipment = [
    gear(1, 22, { torpedo: 12 }),
    ...Array.from({ length: 4 }, (_, i) => gear(10 + i, 2, { firepower: 5 })),
    gear(20, 10, { los: 5 }),
    gear(21, 10, { los: 5 }),
  ]
  const account = fixture([{ shipTypeId: 3 }, { shipTypeId: 3 }], equipment)
  const context = createGearSearchContext(account)
  const target = { ...route(), tags: ['opening-torpedo-preferred'] }
  const fleet = {
    members: account.ships.map((ship) => ({ ship, role: 'utility-cruiser' })),
    usedShipIds: new Set(),
    score: 0,
    lastCandidateIndex: 0,
  }
  const solutions = buildGearSolutions(
    fleet,
    context,
    null,
    false,
    0,
    0,
    false,
    0,
    false,
    0,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    { route: target, hqLevel: account.hqLevel, objective: 'balanced' },
  )
  assert.ok(
    solutions.some(
      (builds) =>
        builds.flatMap((build) => build.equipment).filter((gear) => gear?.typeId === 22).length ===
        1,
    ),
  )
  solutions.forEach(assertUnique)
  assert.ok(context.diagnostics.failedPlanCount > 0)
})

test('mixed-route scoring retains surface value and stops rewarding surplus OASW count', () => {
  const account = fixture([{}], [gear(1, 14, { asw: 15 })])
  const target = route([{ kind: 'opening-asw', minimum: 1 }])
  const build = {
    ship: account.ships[0],
    role: 'anti-submarine',
    equipment: [account.equipment[0]],
    expansionSlot: null,
    combat: {
      effectiveStats: { ...zero, armor: 40, evasion: 30 },
      equipmentBonus: zero,
      daySurfacePower: 400,
      nightSurfacePower: 120,
      antiInstallationDayPower: 0,
      antiInstallationNightPower: 0,
      antiSubmarinePower: 100,
      antiSubmarineAttackCapable: true,
      openingAswCapable: true,
      shellingAccuracy: 100,
    },
  }
  const metrics = calculateFleetMetrics([build], target, account.hqLevel)
  const high = scoreFleet([build], metrics, 'balanced', target)
  const low = scoreFleet(
    [{ ...build, combat: { ...build.combat, daySurfacePower: 0, nightSurfacePower: 0 } }],
    metrics,
    'balanced',
    target,
  )
  assert.ok(high.total > low.total)
  assert.equal(
    scoreFleet([build], { ...metrics, openingAswCount: 5 }, 'balanced', target).dimensions
      .openingAsw,
    high.dimensions.openingAsw,
  )
})

test('a carrier may serve as an air-control-only alternative when the hard gate needs every slot', () => {
  const equipment = [
    gear(1, 8, { torpedo: 15 }),
    ...Array.from({ length: 4 }, (_, i) => gear(10 + i, 6, { antiAir: 10 }, { 20: 50 })),
  ]
  const account = fixture(
    [{ shipTypeId: 11, slotSizes: [20, 20, 20, 20], equippedItemIds: [0, 0, 0, 0] }],
    equipment,
  )
  const target = route([{ kind: 'air-power', minimum: 200, recommended: 200 }])
  const { solutions } = solve(account, ['carrier-air-superiority'], target)
  assert.ok(solutions.length)
  assert.ok(
    solutions.every(
      (builds) => calculateFleetMetrics(builds, target, account.hqLevel).airPower >= 200,
    ),
  )
})

test('1-5 retains explicit ASW-focused ranking while mixed OASW routes keep surface power', () => {
  const { getRouteTemplates } = require('../dist/index.js')
  assert.ok(
    getRouteTemplates('1-5', 'balanced').every((target) => target.tags.includes('asw-loadout')),
  )
  assert.ok(
    getRouteTemplates('4-4', 'balanced').every((target) => !target.tags.includes('asw-loadout')),
  )
})
