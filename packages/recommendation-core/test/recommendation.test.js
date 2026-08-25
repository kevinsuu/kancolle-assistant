const assert = require('node:assert/strict')
const test = require('node:test')

const {
  NORMAL_MAP_ROUTES,
  RECOMMENDATION_OBJECTIVES,
  calculateFleetMetrics,
  getMapOptions,
  getRouteTemplates,
  parseKC3AccountSnapshot,
  recommendFleet,
} = require('../dist/index.js')
const { createRawSnapshot, createResourceRawSnapshot } = require('./fixtures.js')

const OBJECTIVES = new Set(RECOMMENDATION_OBJECTIVES)
const X5_KCWIKI_SOURCES = {
  '1-5': 'https://m.kcwiki.cn/wiki/%E9%95%87%E5%AE%88%E5%BA%9C%E6%B5%B7%E5%9F%9F/1-5',
  '2-5': 'https://m.kcwiki.cn/wiki/%E5%8D%97%E8%A5%BF%E7%BE%A4%E5%B2%9B%E6%B5%B7%E5%9F%9F/2-5',
  '3-5': 'https://m.kcwiki.cn/wiki/%E5%8C%97%E6%96%B9%E6%B5%B7%E5%9F%9F/3-5',
  '4-5': 'https://m.kcwiki.cn/wiki/%E8%A5%BF%E6%96%B9%E6%B5%B7%E5%9F%9F/4-5',
  '5-5': 'https://m.kcwiki.cn/wiki/%E5%8D%97%E6%96%B9%E6%B5%B7%E5%9F%9F/5-5',
  '6-5': 'https://m.kcwiki.cn/wiki/%E4%B8%AD%E9%83%A8%E6%B5%B7%E5%9F%9F/6-5',
  '7-5': 'https://m.kcwiki.cn/wiki/7-5',
}

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
  assert.equal(NORMAL_MAP_ROUTES.length, 110)

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

  const extraOperationRoutes = NORMAL_MAP_ROUTES.filter((route) => route.mapId.endsWith('-5'))
  assert.ok(extraOperationRoutes.every((route) => !route.id.startsWith('source-')))
  assert.ok(
    extraOperationRoutes
      .filter((route) => route.category !== 'leveling')
      .every(
        (route) =>
          route.metadata.lastVerified === '2026-08-25' &&
          route.metadata.ruleVersion === '2026.08.25-overlay',
      ),
  )
  extraOperationRoutes
    .filter((route) => route.category !== 'leveling')
    .forEach((route) => {
      assert.ok(
        route.metadata.source.includes(X5_KCWIKI_SOURCES[route.mapId]),
        `missing kcwiki X-5 source: ${route.id}`,
      )
    })

  assert.deepEqual(
    getRouteTemplates('1-5', 'balanced').map((route) => route.id),
    ['1-5-boss-de', '1-5-boss-light'],
  )
  const heavy15 = getRouteTemplates('1-5', 'boss-clear', '1-5-boss-heavy')[0]
  assert.ok(heavy15)
  assert.ok(
    heavy15.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 10 &&
        constraint.exact === 1,
    ),
  )
  assert.ok(
    heavy15.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 3 &&
        constraint.exact === 2,
    ),
  )
  assert.ok(
    heavy15.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 2 &&
        constraint.exact === 1,
    ),
  )

  const routes45 = getRouteTemplates('4-5', 'balanced')
  assert.ok(routes45.some((route) => route.id === '4-5-small-ship'))
  assert.ok(routes45.some((route) => route.id === '4-5-fast-plus-night-carrier'))
  routes45.forEach((route) => {
    const airPower = route.calculatedConstraints.find(
      (constraint) => constraint.kind === 'air-power',
    )
    assert.ok(airPower, `${route.id} has no air-power constraint`)
    if (route.nodes.includes('K')) {
      assert.equal(airPower.minimum, 112)
      assert.equal(airPower.recommended, 252)
      assert.ok(
        route.calculatedConstraints.some(
          (constraint) =>
            constraint.kind === 'los' && constraint.coefficient === 2 && constraint.minimum === 71,
        ),
        `${route.id} has no K-to-T LoS constraint`,
      )
    } else {
      assert.equal(airPower.minimum, 92)
      assert.equal(airPower.recommended, 207)
    }
  })

  const standardLight45 = routes45.find((route) => route.id === '4-5-standard-light')
  assert.deepEqual(standardLight45.nodes, ['A/C', 'D', 'H', 'K', 'T'])
  assert.ok(
    standardLight45.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 2 &&
        constraint.exact === 2,
    ),
  )

  const smallShip45 = routes45.find((route) => route.id === '4-5-small-ship')
  assert.deepEqual(smallShip45.nodes, ['A/C', 'D', 'H', 'T'])
  assert.ok(
    smallShip45.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 2 &&
        constraint.exact === 3,
    ),
  )

  const fastPlusNight45 = routes45.find((route) => route.id === '4-5-fast-plus-night-carrier')
  assert.ok(
    fastPlusNight45.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 4 &&
        constraint.exact === 2,
    ),
  )

  const ao55 = getRouteTemplates('5-5', 'balanced', '5-5-middle-ao')[0]
  assert.ok(ao55.tags.includes('smoke-screen'))
  assert.deepEqual(
    ao55.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[8, 9, 10, 12], 2],
      [[11, 18], 1],
      [[22], 1],
      [[2], 2],
    ],
  )
  assert.equal(
    ao55.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    136,
  )

  const northHeavy55 = getRouteTemplates('5-5', 'balanced', '5-5-north-heavy')[0]
  assert.deepEqual(
    northHeavy55.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[8, 9, 10, 12], 2],
      [[11, 18], 2],
      [[5, 6], 2],
    ],
  )

  const north65 = getRouteTemplates('6-5', 'balanced', '6-5-north')[0]
  assert.deepEqual(
    north65.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[8, 9, 10, 12], 1],
      [[11, 18], 2],
      [[5, 6], 1],
      [[3, 4], 1],
      [[2], 1],
    ],
  )
  getRouteTemplates('6-5', 'balanced').forEach((route) => {
    assert.ok(
      route.calculatedConstraints.some((constraint) => constraint.kind === 'air-power'),
      `${route.id} has no air-power constraint`,
    )
  })

  const gimmick75 = getRouteTemplates('7-5', 'balanced', '7-5-gimmick-m-p1')[0]
  assert.deepEqual(gimmick75.nodes, ['A', 'B', 'D', 'F', 'G', 'H', 'I', 'M'])
  assert.ok(getRouteTemplates('7-5', 'balanced', '7-5-p2-fast-carrier')[0])
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

test('1-5 balanced recommendations stay on light ASW fleets', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot())
  const result = recommendFleet({ mapId: '1-5', objective: 'balanced', account })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations.length > 0)
  result.recommendations.forEach((recommendation) => {
    assert.notEqual(recommendation.route.id, '1-5-boss-heavy')
    assert.ok(recommendation.ships.every((build) => [1, 2, 3, 21].includes(build.ship.shipTypeId)))
  })
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
