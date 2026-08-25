const assert = require('node:assert/strict')
const test = require('node:test')

const {
  NORMAL_MAP_ROUTES,
  RECOMMENDATION_OBJECTIVES,
  calculateFleetMetrics,
  getMapOptions,
  parseKC3AccountSnapshot,
  recommendFleet,
} = require('../dist/index.js')
const { createRawSnapshot, createResourceRawSnapshot } = require('./fixtures.js')

const OBJECTIVES = new Set(RECOMMENDATION_OBJECTIVES)

const withoutTiming = (result) => {
  const copy = structuredClone(result)
  delete copy.elapsedMs
  return copy
}

test('KC3 adapter normalizes a valid account and rejects duplicate instance IDs', () => {
  const raw = createRawSnapshot()
  const account = parseKC3AccountSnapshot(raw)

  assert.equal(account.ships.length, 6)
  assert.equal(account.equipment.length, 24)
  assert.equal(account.ships[0].speed, 'fast')
  assert.equal(account.equipment[0].iconTypeId, 1)
  assert.equal(account.metadata.source, 'kc3')

  raw.ships[1].id = raw.ships[0].id
  assert.throws(() => parseKC3AccountSnapshot(raw), /艦娘 instance ID 重複/)
})

test('normal map catalog remains complete, valid, unique, and semantically distinct', () => {
  const maps = getMapOptions()
  assert.equal(maps.length, 37)
  assert.equal(NORMAL_MAP_ROUTES.length, 97)

  const routeIds = new Set()
  const semanticSignatures = new Set()
  NORMAL_MAP_ROUTES.forEach((route) => {
    assert.equal(routeIds.has(route.id), false, `duplicate route ID: ${route.id}`)
    routeIds.add(route.id)
    assert.ok(route.fleetConstraints.length > 0, `${route.id} has no fleet constraints`)
    assert.ok(route.objectives.every((objective) => OBJECTIVES.has(objective)))

    const signature = JSON.stringify({
      mapId: route.mapId,
      nodes: route.nodes,
      category: route.category,
      objectives: [...route.objectives].sort(),
      stableBoss: route.stableBoss,
      tags: [...route.tags].sort(),
      fleetConstraints: route.fleetConstraints,
      calculatedConstraints: route.calculatedConstraints,
    })
    assert.equal(
      semanticSignatures.has(signature),
      false,
      `semantically duplicate route: ${route.id}`,
    )
    semanticSignatures.add(signature)
  })
})

test('every route links to its current per-map guide', () => {
  NORMAL_MAP_ROUTES.forEach((route) => {
    const world = route.mapId.split('-')[0]
    assert.ok(
      route.metadata.source.includes(`https://en.kancollewiki.net/World_${world}/${route.mapId}`),
      `missing map guide: ${route.id}`,
    )
  })
})

test('fleet metrics apply air-power and Formula 33 hard constraints', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot())
  const builds = account.ships.slice(0, 2).map((ship) => ({
    ship,
    role: 'escort-destroyer',
    equipment: [null, null, null],
    expansionSlot: null,
  }))
  const route = {
    ...NORMAL_MAP_ROUTES[0],
    resourceProfile: undefined,
    calculatedConstraints: [
      { kind: 'air-power', minimum: 10, recommended: 20 },
      { kind: 'los', formula: '33', coefficient: 1, minimum: 5 },
    ],
  }
  const metrics = calculateFleetMetrics(builds, route, account.hqLevel)

  assert.equal(metrics.airPower, 0)
  assert.equal(metrics.airPowerRequired, true)
  assert.equal(metrics.airPowerMinimum, 10)
  assert.equal(metrics.losRequired, true)
  assert.equal(metrics.losMinimum, 5)
  assert.equal(metrics.estimatedFuelCost, 25)
  assert.equal(metrics.estimatedAmmoCost, 33)
  assert.equal(metrics.estimatedResourceGain, null)
  assert.equal(metrics.estimatedNetResourceGain, null)
})

test('1-3 fuel farming fills effective landing craft and calculates net fuel', () => {
  const account = parseKC3AccountSnapshot(createResourceRawSnapshot())
  const result = recommendFleet({
    mapId: '1-3',
    routeId: '1-3-fuel-ao',
    objective: 'resource-fuel',
    account,
  })

  assert.equal(result.status, 'success')
  const recommendation = result.recommendations[0]
  assert.ok(recommendation)
  assert.equal(
    recommendation.ships.some((build) => build.ship.name === 'Fixture incompatible destroyer'),
    false,
  )
  assert.equal(recommendation.metrics.landingCraftCount, 15)
  assert.equal(recommendation.metrics.drumCount, 0)
  assert.equal(recommendation.metrics.estimatedResourceGain, 60)
  assert.equal(recommendation.metrics.estimatedFuelCost, 19)
  assert.equal(recommendation.metrics.estimatedNetResourceGain, 41)
  assert.equal(
    recommendation.ships
      .filter((build) => build.role === 'resource-carrier')
      .flatMap((build) => build.equipment)
      .some((gear) => gear === null),
    false,
  )
})

test('solver is deterministic and only returns account-owned unique instances', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot())
  const input = { mapId: '1-1', objective: 'balanced', account }
  const first = recommendFleet(input)
  const second = recommendFleet(input)

  assert.equal(first.status, 'success')
  assert.deepEqual(withoutTiming(first), withoutTiming(second))

  const ownedShipIds = new Set(account.ships.map((ship) => ship.id))
  const ownedEquipmentIds = new Set(account.equipment.map((gear) => gear.id))
  first.recommendations.forEach((recommendation) => {
    const shipIds = recommendation.ships.map((build) => build.ship.id)
    assert.equal(new Set(shipIds).size, shipIds.length)
    assert.ok(shipIds.every((id) => ownedShipIds.has(id)))

    const equipmentIds = recommendation.ships.flatMap((build) =>
      [...build.equipment, build.expansionSlot]
        .filter((gear) => gear !== null)
        .map((gear) => gear.id),
    )
    assert.equal(new Set(equipmentIds).size, equipmentIds.length)
    assert.ok(equipmentIds.every((id) => ownedEquipmentIds.has(id)))
  })
})

test('solver returns no-solution when the account cannot meet fleet size', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot({ shipCount: 1 }))
  const result = recommendFleet({ mapId: '1-1', objective: 'balanced', account })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.length > 0)
})
