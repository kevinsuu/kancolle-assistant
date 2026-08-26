const assert = require('node:assert/strict')
const test = require('node:test')

const {
  NORMAL_MAP_ROUTES,
  RECOMMENDATION_OBJECTIVES,
  calculateFleetMetrics,
  getMapOptions,
  getRouteTemplates,
  isAutomaticRouteReady,
  parseKC3AccountSnapshot,
  recommendFleet,
  scoreFleet,
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

const createFastPlusSnapshot = ({
  boilerCount = 6,
  nightCarrierRoute = false,
  nightCarrierSetup = false,
} = {}) => {
  const raw = createRawSnapshot()
  let equipmentId = 5000
  const createGear = (masterId, typeId, stats = {}, airPower = 0, iconTypeId = typeId) => ({
    id: equipmentId++,
    masterId,
    name: `Fast+ fixture gear ${equipmentId}`,
    typeId,
    iconTypeId,
    type: String(typeId),
    improvement: 0,
    proficiency: -1,
    locked: true,
    currentlyEquippedBy: 0,
    stats: {
      firepower: 0,
      torpedo: 0,
      antiAir: 0,
      armor: 0,
      asw: 0,
      los: 0,
      bombing: 0,
      accuracy: 0,
      evasion: 0,
      ...stats,
    },
    losImprovement: 0,
    airPowerBySlotSize: { 20: airPower },
  })
  const turbines = Array.from({ length: 6 }, () => createGear(33, 17))
  const boilers = Array.from({ length: boilerCount }, () => createGear(34, 17))
  const bigGuns = Array.from({ length: 4 }, () =>
    createGear(100, 3, { firepower: 20, accuracy: 2 }),
  )
  const recon = Array.from({ length: 2 }, () => createGear(101, 9, { los: 8, accuracy: 2 }))
  const carrierAttackers = Array.from({ length: 8 }, () =>
    createGear(102, 8, { torpedo: 12, antiAir: 3 }, 20),
  )
  carrierAttackers.forEach((gear) => {
    gear.antiInstallationAircraft = true
  })
  const fighters = Array.from({ length: 8 }, () => createGear(103, 6, { antiAir: 12 }, 60))
  const midgetSubmarines = Array.from({ length: 2 }, () => createGear(104, 22, { torpedo: 12 }))
  const cruiserGuns = Array.from({ length: 4 }, () =>
    createGear(105, 2, { firepower: 10, accuracy: 2 }),
  )
  const type3Shells = Array.from({ length: 2 }, (_, index) =>
    createGear(index === 0 ? 35 : 317, 18, { firepower: 1 }),
  )
  const unfitCruiserGuns = Array.from({ length: 2 }, () =>
    createGear(356, 2, { firepower: 30, accuracy: 10 }),
  )
  const genericFillers = Array.from({ length: 20 }, () =>
    createGear(106, 12, { antiAir: 2, los: 3, accuracy: 2 }),
  )
  const nightCarrierGear = nightCarrierSetup
    ? [createGear(200, 8, { torpedo: 10 }, 30, 45), createGear(258, 35)]
    : []
  raw.equipment = [
    ...turbines,
    ...boilers,
    ...bigGuns,
    ...recon,
    ...carrierAttackers,
    ...fighters,
    ...midgetSubmarines,
    ...cruiserGuns,
    ...type3Shells,
    ...unfitCruiserGuns,
    ...genericFillers,
    ...nightCarrierGear,
  ]
  const equipableMasterIds = [...new Set(raw.equipment.map((gear) => gear.masterId))]
  const shipTypeIds = nightCarrierRoute ? [10, 11, 11, 7, 4, 4] : [8, 8, 11, 11, 4, 4]
  raw.hqLevel = 1
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.speedValue = 10
    ship.nakedLos = 100
    ship.slotSizes = [20, 20, 20, 20]
    ship.equippedItemIds = [0, 0, 0, 0]
    ship.expansionSlotUnlocked = true
    ship.expansionEquipableEquipmentIds = turbines.map((gear) => gear.id)
    ship.regularEquipableMasterIds = equipableMasterIds
    ship.fastPlusPatterns = [
      {
        turbineCount: 1,
        enhancedBoilerCount: 1,
        newModelBoilerBelow7Count: 0,
        newModelBoilerAtLeast7Count: 0,
      },
    ]
    ship.nightCarrierPatterns = []
  })
  if (nightCarrierSetup) {
    raw.ships[1].nightCarrierPatterns = [
      {
        nightAircraftCount: 1,
        nightOperationsPersonnelCount: 1,
        swordfishCount: 0,
      },
    ]
  }
  return raw
}

const createClDdHeavySnapshot = () => {
  const raw = createFastPlusSnapshot()
  const [battleship, carrier, lightCruiser, ...destroyers] = raw.ships
  battleship.shipTypeId = 8
  battleship.name = 'High-score fixture battleship 1'
  battleship.stats.firepower = 300
  carrier.shipTypeId = 11
  carrier.name = 'Fixture regular carrier'
  carrier.stats.firepower = 30
  lightCruiser.shipTypeId = 3
  destroyers.forEach((ship) => {
    ship.shipTypeId = 2
  })
  const sourceGear = raw.equipment[0]
  const antiInstallationAircraft = raw.equipment.filter((gear) => gear.typeId === 8)
  antiInstallationAircraft.forEach((gear) => {
    gear.antiInstallationAircraft = true
  })
  const type3Shell = {
    ...structuredClone(sourceGear),
    id: 8900,
    masterId: 35,
    name: 'Fixture Type 3 Shell',
    typeId: 18,
    iconTypeId: 18,
    type: '18',
    airPowerBySlotSize: {},
  }
  const seaplaneFighters = Array.from({ length: 2 }, (_, index) => ({
    ...structuredClone(sourceGear),
    id: 8901 + index,
    masterId: 891 + index,
    name: `Fixture seaplane fighter ${index + 1}`,
    typeId: 45,
    iconTypeId: 45,
    type: '45',
    airPowerBySlotSize: { 20: 200 },
  }))
  raw.equipment.push(type3Shell, ...seaplaneFighters)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(
      type3Shell.masterId,
      ...seaplaneFighters.map((gear) => gear.masterId),
    )
  })
  const extraBattleships = Array.from({ length: 13 }, (_, index) => ({
    ...structuredClone(battleship),
    id: 900 + index,
    masterId: 1900 + index,
    name: `High-score fixture battleship ${index + 2}`,
  }))
  raw.ships.push(...extraBattleships)
  raw.currentFleetShipIds = []
  return raw
}

const create45Type3ShellSnapshot = ({ shellCount = 3 } = {}) => {
  const raw = createFastPlusSnapshot()
  raw.equipment = raw.equipment.filter((gear) => ![35, 317, 483].includes(gear.masterId))
  const shipTypeIds = [8, 11, 11, 7, 5, 6]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })

  let equipmentId = 7000
  const cloneGear = (source, overrides) => ({
    ...structuredClone(source),
    id: equipmentId++,
    currentlyEquippedBy: 0,
    ...overrides,
  })
  const recon = raw.equipment.find((gear) => gear.typeId === 9)
  const attacker = raw.equipment.find((gear) => gear.typeId === 8)
  const fighter = raw.equipment.find((gear) => gear.typeId === 6)
  const shellMasterIds = [35, 317, 483].slice(0, shellCount)
  raw.equipment.push(
    cloneGear(recon, { name: 'Fixture reconnaissance seaplane' }),
    ...Array.from({ length: 2 }, () => cloneGear(attacker, { name: 'Fixture carrier attacker' })),
    ...Array.from({ length: 4 }, () => cloneGear(fighter, { name: 'Fixture fighter' })),
    ...shellMasterIds.map((masterId) =>
      cloneGear(raw.equipment[0], {
        masterId,
        name: `Fixture Type 3 Shell ${masterId}`,
        typeId: 18,
        iconTypeId: 18,
        type: '18',
        airPowerBySlotSize: {},
      }),
    ),
  )
  ;[0, 4, 5].forEach((shipIndex) => {
    raw.ships[shipIndex].regularEquipableMasterIds.push(...shellMasterIds)
  })
  raw.currentFleetShipIds = []
  return raw
}

const create45FastPlusCarrierAntiInstallationSnapshot = ({ shellCount = 3 } = {}) => {
  const raw = createFastPlusSnapshot()
  raw.equipment = raw.equipment.filter((gear) => ![35, 317, 483].includes(gear.masterId))
  const shipTypeIds = [11, 11, 11, 5, 6, 6]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })
  let equipmentId = 7600
  const sourceAttacker = raw.equipment.find((gear) => gear.typeId === 8)
  const sourceOther = raw.equipment[0]
  const ordinaryDiveBomber = {
    ...structuredClone(sourceAttacker),
    id: equipmentId++,
    masterId: 990,
    name: 'Fixture ordinary dive bomber',
    typeId: 7,
    iconTypeId: 7,
    antiInstallationAircraft: false,
    stats: { ...sourceAttacker.stats, bombing: 99 },
  }
  const shellMasterIds = [35, 317, 483].slice(0, shellCount)
  raw.equipment.push(
    ordinaryDiveBomber,
    ...shellMasterIds.map((masterId) => ({
      ...structuredClone(sourceOther),
      id: equipmentId++,
      masterId,
      name: `Fixture Type 3 Shell ${masterId}`,
      typeId: 18,
      iconTypeId: 18,
      type: '18',
      antiInstallationAircraft: false,
      airPowerBySlotSize: {},
    })),
  )
  raw.ships.forEach((ship) => ship.regularEquipableMasterIds.push(990))
  ;[3, 4, 5].forEach((shipIndex) => {
    raw.ships[shipIndex].regularEquipableMasterIds.push(...shellMasterIds)
  })
  raw.currentFleetShipIds = []
  return raw
}

const createOaswSnapshot = () => {
  const raw = createRawSnapshot()
  raw.equipment.forEach((gear, index) => {
    if (index >= 18) return
    gear.typeId = index < 12 ? 14 : 15
    gear.iconTypeId = gear.typeId
    gear.type = String(gear.typeId)
    gear.stats.asw = 20
  })
  return raw
}

const createAllNormalMapsSnapshot = () => {
  let equipmentId = 10000
  const equipmentTypes = [1, 2, 3, 5, 6, 8, 10, 11, 12, 14, 15, 18, 19, 22, 24, 30, 32, 45]
  const equipment = equipmentTypes.flatMap((typeId) =>
    Array.from({ length: 40 }, (_, index) => ({
      id: equipmentId++,
      masterId: 20000 + typeId * 100 + index,
      name: `All-map fixture gear ${typeId}-${index}`,
      typeId,
      iconTypeId: typeId,
      type: String(typeId),
      improvement: 10,
      proficiency: 7,
      locked: true,
      currentlyEquippedBy: 0,
      antiInstallationAircraft: typeId === 8,
      stats: {
        firepower: [1, 2, 3, 18, 19].includes(typeId) ? 30 : 0,
        torpedo: [5, 8, 22, 32].includes(typeId) ? 30 : 0,
        antiAir: [6, 8, 11, 45].includes(typeId) ? 30 : 5,
        armor: 5,
        asw: [14, 15].includes(typeId) ? 30 : 5,
        los: [10, 11, 12, 45].includes(typeId) ? 30 : 5,
        bombing: [8, 11].includes(typeId) ? 30 : 0,
        accuracy: 10,
        evasion: 5,
      },
      losImprovement: 10,
      airPowerBySlotSize: {
        0: 0,
        20: [6, 8, 11, 45].includes(typeId) ? 200 : 0,
      },
    })),
  )
  const speedGear = [33, 34].flatMap((masterId) =>
    Array.from({ length: 20 }, (_, index) => ({
      ...structuredClone(equipment[0]),
      id: equipmentId++,
      masterId,
      name: `All-map fixture speed gear ${masterId}-${index}`,
      typeId: 17,
      iconTypeId: 17,
      type: '17',
      airPowerBySlotSize: { 0: 0, 20: 0 },
    })),
  )
  equipment.push(...speedGear)
  const equipableMasterIds = [...new Set(equipment.map((gear) => gear.masterId))]
  const expansionEquipmentIds = equipment.map((gear) => gear.id)
  const shipTypeIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 21, 22]
  let shipId = 1000
  const ships = shipTypeIds.flatMap((shipTypeId) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: shipId++,
      masterId: 30000 + shipTypeId * 100 + index,
      name:
        shipTypeId === 5 && index === 0
          ? '羽黒改二'
          : shipTypeId === 5 && index === 1
            ? '足柄改二'
            : shipTypeId === 8 && index === 0
              ? '長門改二'
              : shipTypeId === 8 && index === 1
                ? '陸奥改二'
                : `All-map fixture ship ${shipTypeId}-${index}`,
      level: 180 - index,
      shipTypeId,
      shipType: String(shipTypeId),
      speedValue: 10,
      stats: {
        hp: 100,
        firepower: 150,
        torpedo: 150,
        antiAir: 150,
        armor: 150,
        evasion: 150,
        asw: 150,
        los: 150,
        luck: 100,
      },
      nakedLos: 150,
      slotSizes: [20, 20, 20, 20],
      equippedItemIds: [0, 0, 0, 0],
      expansionSlotItemId: 0,
      expansionSlotUnlocked: true,
      expansionEquipableEquipmentIds: expansionEquipmentIds,
      regularEquipableMasterIds: equipableMasterIds,
      fastPlusPatterns: [
        {
          turbineCount: 1,
          enhancedBoilerCount: 1,
          newModelBoilerBelow7Count: 0,
          newModelBoilerAtLeast7Count: 0,
        },
      ],
      nightCarrierPatterns: [],
      locked: true,
      morale: 49,
      eventTag: 0,
      fuelCost: 20,
      ammoCost: 20,
    })),
  )
  return {
    generatedAt: '2026-08-26T00:00:00.000Z',
    hqLevel: 120,
    ships,
    equipment,
    currentFleetShipIds: [],
    capabilities: {
      accountShips: true,
      accountEquipment: true,
      masterData: true,
      currentFleet: true,
    },
  }
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
  assert.equal(NORMAL_MAP_ROUTES.length, 112)
  assert.equal(NORMAL_MAP_ROUTES.filter((route) => route.id.startsWith('source-')).length, 0)

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
      .filter((route) => route.category !== 'leveling' && !route.tags.includes('verified-guide'))
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

  const verifiedGuideRoutes = NORMAL_MAP_ROUTES.filter((route) =>
    route.tags.includes('verified-guide'),
  )
  assert.equal(verifiedGuideRoutes.length, 33)
  verifiedGuideRoutes.forEach((route) => {
    assert.equal(route.metadata.confidence, 'verified')
    assert.equal(route.metadata.lastVerified, '2026-08-26')
    assert.ok(route.metadata.ruleVersion.endsWith('-verified-guide'))
    assert.ok(
      route.metadata.source.some((source) => source.startsWith('https://zekamashi.net/')),
      `missing strategy guide: ${route.id}`,
    )
  })

  assert.equal(getRouteTemplates('1-1', 'balanced')[0].id, '1-1-guide-dd4')
  assert.equal(getRouteTemplates('2-3', 'balanced')[0].id, '2-3-guide-ca5-cl')
  assert.equal(getRouteTemplates('2-3', 'balanced', '2-3-guide-ca5-cl').length, 1)
  assert.equal(getRouteTemplates('4-3', 'balanced')[0].id, '4-3-guide-cv2-ca2-dd2')
  assert.equal(getRouteTemplates('1-1', 'balanced', '1-1-guide-dd4').length, 1)
  assert.equal(getRouteTemplates('4-3', 'balanced', '4-3-guide-cv2-ca2-dd2').length, 1)

  const upper35 = getRouteTemplates('3-5', 'balanced', '3-5-upper-carrier-guide')[0]
  assert.equal(upper35.id, '3-5-upper-carrier-guide')
  assert.deepEqual(
    upper35.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[6, 11, 13, 14, 18], 6],
      [[11, 18], 3],
      [[6], 1],
      [[13, 14], 2],
    ],
  )
  assert.equal(
    upper35.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    410,
  )

  NORMAL_MAP_ROUTES.filter((route) => route.mapId === '5-6').forEach((route) => {
    assert.equal(route.metadata.confidence, 'experimental')
    assert.equal(route.metadata.lastVerified, '2026-08-26')
    assert.equal(route.metadata.ruleVersion, '2026.08.26-5-6')
    assert.ok(route.metadata.source.includes('https://kankorekore.2-d.jp/5-6_2nd/'))
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

  const routes45 = NORMAL_MAP_ROUTES.filter(
    (route) => route.mapId === '4-5' && route.objectives.includes('balanced'),
  )
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

  maps
    .flatMap((map) => map.routes)
    .forEach((routeOption) => {
      const route = NORMAL_MAP_ROUTES.find((candidate) => candidate.id === routeOption.id)
      assert.equal(routeOption.automaticReady, isAutomaticRouteReady(route))
    })

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
  assert.equal(isAutomaticRouteReady(getRouteTemplates('5-5', 'balanced', '5-5-middle')[0]), true)
  assert.equal(
    isAutomaticRouteReady(getRouteTemplates('5-5', 'balanced', '5-5-middle-fast-plus')[0]),
    true,
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

test('every normal map can build its primary balanced route with a capable account', () => {
  const account = parseKC3AccountSnapshot(createAllNormalMapsSnapshot())
  getMapOptions().forEach((map) => {
    const route = NORMAL_MAP_ROUTES.find(
      (candidate) => candidate.mapId === map.id && candidate.objectives.includes('balanced'),
    )
    assert.ok(route, `${map.id} has no balanced route`)
    const result = recommendFleet({
      mapId: map.id,
      routeId: route.id,
      objective: 'balanced',
      account,
      candidateLimit: 1,
    })
    assert.equal(result.status, 'success', `${map.id}/${route.id}: ${JSON.stringify(result)}`)
  })
})

test('5-5 modeled special attacks select the pair, order the fleet, and explain formation', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [8, 8, 11, 6, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })
  raw.ships[0].name = '長門改二'
  raw.ships[1].name = '陸奥改二'
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6 || gear.typeId === 8) gear.airPowerBySlotSize = { 20: 200 }
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-middle-fast-plus',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    assert.match(recommendation.ships[0].ship.name, /(?:長門|陸奥)改二/)
    assert.ok([8, 9, 10, 12].includes(recommendation.ships[1].ship.shipTypeId))
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast+')
    assert.ok(recommendation.reasons.some((reason) => reason.code === 'SPECIAL_ATTACK_READY'))
    assert.ok(
      recommendation.warnings.some((warning) => warning.code === 'SPECIAL_ATTACK_SORTIE_CHECK'),
    )
    assert.equal(
      recommendation.warnings.some((warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED'),
      false,
    )
  })
})

test('5-5 modeled special attacks explain when the account has no valid activator', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [8, 8, 11, 6, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-middle-fast-plus',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.some((reason) => reason.code === 'SPECIAL_ATTACK_UNAVAILABLE'))
})

test('ordinary battleship AP-shell slots never consume Type 3 Shell-family equipment', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [8, 8, 6, 4, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })
  raw.ships[0].name = '長門改二'
  raw.ships[1].name = '陸奥改二'
  const sourceGear = raw.equipment[0]
  const shells = [
    { masterId: 900, name: 'Fixture AP shell 1', firepower: 0, typeId: 19 },
    { masterId: 901, name: 'Fixture AP shell 2', firepower: 0, typeId: 19 },
    { masterId: 35, name: 'Fixture Type 3 Shell', firepower: 100, typeId: 18 },
    { masterId: 317, name: 'Fixture Type 3 Shell Kai', firepower: 100, typeId: 18 },
  ].map((shell, index) => ({
    ...structuredClone(sourceGear),
    id: 9200 + index,
    masterId: shell.masterId,
    name: shell.name,
    typeId: shell.typeId,
    iconTypeId: shell.typeId,
    type: String(shell.typeId),
    stats: { ...sourceGear.stats, firepower: shell.firepower },
    airPowerBySlotSize: {},
  }))
  const seaplaneFighters = Array.from({ length: 2 }, (_, index) => ({
    ...structuredClone(sourceGear),
    id: 9210 + index,
    masterId: 910 + index,
    name: `Fixture seaplane fighter ${index + 1}`,
    typeId: 45,
    iconTypeId: 45,
    type: '45',
    airPowerBySlotSize: { 20: 100 },
  }))
  raw.equipment.push(...shells, ...seaplaneFighters)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(
      ...shells.map((gear) => gear.masterId),
      ...seaplaneFighters.map((gear) => gear.masterId),
    )
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-middle',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    recommendation.ships
      .filter((build) => [8, 9, 10, 12].includes(build.ship.shipTypeId))
      .forEach((build) => {
        assert.ok(build.equipment.some((gear) => [900, 901].includes(gear?.masterId)))
        assert.equal(
          build.equipment.some((gear) => [35, 317, 483].includes(gear?.masterId)),
          false,
        )
      })
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

test('KC3 combat evaluations override naked-stat heuristics for every route target type', () => {
  const result = recommendFleet({
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(createRawSnapshot()),
  })
  assert.equal(result.status, 'success')
  const recommendation = result.recommendations[0]
  const evaluatedBuilds = (power) =>
    recommendation.ships.map((build) => ({
      ...build,
      combat: {
        effectiveStats: {
          firepower: power,
          torpedo: 0,
          antiAir: 0,
          armor: build.ship.stats.armor,
          asw: 0,
          los: 0,
          bombing: 0,
          accuracy: 0,
          evasion: build.ship.stats.evasion,
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
        daySurfacePower: power,
        nightSurfacePower: power,
        antiInstallationDayPower: power,
        antiInstallationNightPower: power,
        antiSubmarinePower: power,
        shellingAccuracy: 100,
      },
    }))
  const targetRoutes = [
    recommendation.route,
    { ...recommendation.route, tags: [...recommendation.route.tags, 'anti-installation'] },
    { ...recommendation.route, tags: [...recommendation.route.tags, 'oasw'] },
  ]
  targetRoutes.forEach((route) => {
    const low = scoreFleet(evaluatedBuilds(40), recommendation.metrics, 'boss-clear', route)
    const high = scoreFleet(evaluatedBuilds(180), recommendation.metrics, 'boss-clear', route)
    assert.ok(high.dimensions.bossDamage > low.dimensions.bossDamage)
    assert.ok(high.total > low.total)
  })
})

test('2-1 uses KC3 seaplane fighters, falls back to carriers, and exposes burner farming', () => {
  const lightRaw = createFastPlusSnapshot()
  const lightShipTypeIds = [3, 2, 2, 2, 2, 16]
  lightRaw.ships.forEach((ship, index) => {
    ship.shipTypeId = lightShipTypeIds[index]
  })
  const sourceFighter = lightRaw.equipment.find((gear) => gear.typeId === 6)
  const seaplaneFighters = Array.from({ length: 4 }, (_, index) => ({
    ...structuredClone(sourceFighter),
    id: 9400 + index,
    masterId: 9500 + index,
    name: `Fixture KC3 type 45 seaplane fighter ${index + 1}`,
    typeId: 45,
    iconTypeId: 45,
    type: '45',
    airPowerBySlotSize: { 20: 100 },
  }))
  lightRaw.equipment.push(...seaplaneFighters)
  lightRaw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(...seaplaneFighters.map((gear) => gear.masterId))
  })

  const light = recommendFleet({
    mapId: '2-1',
    routeId: '2-1-guide-cl-dd4-av',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(lightRaw),
  })
  assert.equal(light.status, 'success')
  assert.ok(light.recommendations[0].metrics.airPower >= 81)
  assert.ok(
    light.recommendations[0].ships.some((build) =>
      build.equipment.some((gear) => gear?.typeId === 45),
    ),
  )

  const carrierRaw = createFastPlusSnapshot()
  const carrierShipTypeIds = [11, 7, 5, 5, 3, 3]
  carrierRaw.ships.forEach((ship, index) => {
    ship.shipTypeId = carrierShipTypeIds[index]
  })
  const carrier = recommendFleet({
    mapId: '2-1',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(carrierRaw),
  })
  assert.equal(carrier.status, 'success')
  assert.equal(carrier.recommendations[0].route.id, '2-1-guide-carrier-cruisers')
  assert.ok(carrier.recommendations[0].metrics.airPower >= 81)

  const burnerRaw = createFastPlusSnapshot()
  const burnerShipTypeIds = [7, 7, 13, 13, 14, 16]
  burnerRaw.ships.forEach((ship, index) => {
    ship.shipTypeId = burnerShipTypeIds[index]
  })
  const sourceTorpedo = burnerRaw.equipment.find((gear) => gear.typeId === 22)
  const submarineTorpedoes = Array.from({ length: 12 }, (_, index) => ({
    ...structuredClone(sourceTorpedo),
    id: 9600 + index,
    masterId: 9700 + index,
    name: `Fixture submarine torpedo ${index + 1}`,
    typeId: 32,
    iconTypeId: 5,
    type: '32',
  }))
  burnerRaw.equipment.push(...submarineTorpedoes)
  burnerRaw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(...submarineTorpedoes.map((gear) => gear.masterId))
  })
  const burner = recommendFleet({
    mapId: '2-1',
    objective: 'resource-burner',
    account: parseKC3AccountSnapshot(burnerRaw),
  })
  assert.equal(burner.status, 'success')
  assert.equal(burner.recommendations[0].route.id, '2-1-burner-cvl-submarine')
  assert.equal(burner.recommendations[0].route.nodes.at(-1), 'E')
  assert.equal(
    getMapOptions()
      .find((map) => map.id === '2-1')
      .objectives.includes('resource-burner'),
    true,
  )
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

test('automatic route comparison keeps three distinct legal light ASW fleets', () => {
  const account = parseKC3AccountSnapshot(createOaswSnapshot())
  const result = recommendFleet({ mapId: '1-5', objective: 'balanced', account })

  assert.equal(result.status, 'success')
  assert.equal(result.recommendations.length, 3)
  assert.equal(
    new Set(
      result.recommendations.map((recommendation) =>
        recommendation.ships.map((build) => build.ship.id).join('-'),
      ),
    ).size,
    3,
  )
  result.recommendations.forEach((recommendation) => {
    assert.notEqual(recommendation.route.id, '1-5-boss-heavy')
    assert.ok(recommendation.ships.every((build) => [1, 2, 3, 21].includes(build.ship.shipTypeId)))
    assert.ok(recommendation.metrics.openingAswCount >= recommendation.metrics.openingAswMinimum)
  })
})

test('automatic recommendations fall back to calculable routes with explicit setup warnings', () => {
  const account = parseKC3AccountSnapshot(createAllNormalMapsSnapshot())
  const fallbackMapIds = getMapOptions()
    .filter((map) => {
      const balancedRoutes = map.routes.filter((route) => route.objectives.includes('balanced'))
      return balancedRoutes.length > 0 && balancedRoutes.every((route) => !route.automaticReady)
    })
    .map((map) => map.id)

  assert.ok(fallbackMapIds.includes('7-4'))
  fallbackMapIds.forEach((mapId) => {
    const fallback = recommendFleet({ mapId, objective: 'balanced', account })
    assert.equal(fallback.status, 'success', `${mapId}: ${JSON.stringify(fallback)}`)
  })

  const result = recommendFleet({ mapId: '7-4', objective: 'balanced', account })
  assert.equal(result.status, 'success')
  assert.equal(result.recommendations[0].route.id, '7-4-guide-bbv-cruisers-escort')
  assert.ok(
    result.recommendations[0].warnings.some(
      (warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED',
    ),
  )
  assert.equal(
    getMapOptions()
      .find((map) => map.id === '7-4')
      .routes.find((route) => route.id === '7-4-guide-bbv-cruisers-escort').automaticReady,
    false,
  )
})

test('4-5 automatic routes expose only modeled anti-installation setups', () => {
  const automatic45RouteIds = getRouteTemplates('4-5', 'balanced').map((route) => route.id)
  assert.deepEqual(automatic45RouteIds.sort(), [
    '4-5-cl-dd-heavy',
    '4-5-fast-plus-battleship-carrier',
    '4-5-fast-plus-carrier',
    '4-5-fast-plus-heavy',
    '4-5-standard-balanced',
    '4-5-standard-battleship',
    '4-5-standard-carrier',
    '4-5-standard-carrier-heavy',
  ])
  assert.equal(
    isAutomaticRouteReady(NORMAL_MAP_ROUTES.find((route) => route.id === '4-5-standard-balanced')),
    true,
  )

  const result = recommendFleet({
    mapId: '4-5',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(create45Type3ShellSnapshot()),
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    const shells = recommendation.ships
      .flatMap((build) => build.equipment)
      .filter((gear) => gear && [35, 317, 483].includes(gear.masterId))
    assert.equal(shells.length, 3)
    assert.equal(new Set(shells.map((gear) => gear.id)).size, 3)
    assert.ok(
      recommendation.reasons.some(
        (reason) => reason.code === 'ANTI_INSTALLATION_REQUIREMENT_PASSED',
      ),
    )
    assert.ok(
      recommendation.warnings.every((warning) => warning.code !== 'EXTERNAL_COMBAT_SETUP_REQUIRED'),
    )
  })
})

test('4-5 automatic recommendation explains when Type 3 Shell-family items are insufficient', () => {
  const result = recommendFleet({
    mapId: '4-5',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(create45Type3ShellSnapshot({ shellCount: 1 })),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(
    result.analysis.reasons.some(
      (reason) => reason.code === 'ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
    ),
  )
})

test('4-5 Fast+ carrier route keeps every carrier anti-installation capable', () => {
  const account = parseKC3AccountSnapshot(create45FastPlusCarrierAntiInstallationSnapshot())
  const route = getRouteTemplates('4-5', 'balanced', '4-5-fast-plus-carrier')[0]
  assert.equal(isAutomaticRouteReady(route), true)

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account,
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast+')
    const carriers = recommendation.ships.filter((build) =>
      [11, 18].includes(build.ship.shipTypeId),
    )
    assert.equal(carriers.length, 3)
    carriers.forEach((build) => {
      assert.ok(build.equipment.some((gear) => gear?.antiInstallationAircraft))
      assert.equal(
        build.equipment.some((gear) => gear?.typeId === 7 && !gear.antiInstallationAircraft),
        false,
      )
    })
    assert.ok(
      recommendation.reasons.some((reason) => reason.code === 'ANTI_INSTALLATION_CARRIER_READY'),
    )
    assert.equal(
      recommendation.warnings.some((warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED'),
      false,
    )
  })
})

test('4-5 Fast+ carrier route reports missing mixed anti-installation equipment', () => {
  const account = parseKC3AccountSnapshot(
    create45FastPlusCarrierAntiInstallationSnapshot({ shellCount: 2 }),
  )
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account,
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(
    result.analysis.reasons.some(
      (reason) => reason.code === 'ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
    ),
  )
})

test('2-5 north fills regular slots, reserves two drum carriers, and rejects an all-fast fleet', () => {
  const raw = createRawSnapshot()
  const route = getRouteTemplates('2-5', 'boss-clear', '2-5-north')[0]
  assert.equal(isAutomaticRouteReady(route), true)
  const shipTypeIds = [10, 5, 3, 3, 2, 2]
  raw.hqLevel = 1
  raw.equipment.forEach((gear) => {
    gear.airPowerBySlotSize = { 0: 0, 1: 20 }
  })
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.speedValue = index === 0 ? 5 : 10
    ship.nakedLos = 100
    ship.slotSizes = [1, 1, 1]
  })

  const missingDrums = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-north',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })
  assert.equal(missingDrums.status, 'no-solution')
  assert.ok(
    missingDrums.analysis.reasons.some(
      (reason) => reason.code === 'DRUM_CANISTER_EQUIPMENT_INSUFFICIENT',
    ),
  )

  const drums = raw.equipment.slice(0, 2).map((gear, index) => ({
    ...gear,
    id: 9001 + index,
    masterId: 9101 + index,
    name: `Fixture drum ${index + 1}`,
    typeId: 30,
    iconTypeId: 30,
    type: '30',
    airPowerBySlotSize: { 0: 0, 1: 0 },
  }))
  raw.equipment.push(...drums)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(...drums.map((gear) => gear.masterId))
  })

  const valid = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-north',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })
  assert.equal(valid.status, 'success')
  assert.equal(valid.recommendations[0].metrics.drumCount, 2)
  assert.equal(
    valid.recommendations[0].ships.filter((build) =>
      build.equipment.some((gear) => gear?.typeId === 30),
    ).length,
    2,
  )
  assert.ok(
    valid.recommendations[0].ships.every((build) => build.equipment.every((gear) => gear !== null)),
  )
  assert.ok(
    valid.recommendations[0].reasons.some(
      (reason) => reason.code === 'DRUM_CANISTER_REQUIREMENT_PASSED',
    ),
  )
  assert.equal(
    valid.recommendations[0].warnings.some(
      (warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED',
    ),
    false,
  )

  raw.ships[0].speedValue = 10
  const invalid = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-north',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })
  assert.equal(invalid.status, 'no-solution')
  assert.ok(invalid.analysis.reasons.some((reason) => reason.code === 'FLEET_SPEED_INSUFFICIENT'))
})

test('Fast+ routes allocate unique speed gear through open expansion slots', () => {
  const account = parseKC3AccountSnapshot(createFastPlusSnapshot())
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-heavy',
    objective: 'boss-clear',
    account,
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast+')
    assert.ok(recommendation.ships.every((build) => build.expansionSlot?.masterId === 33))
    assert.ok(
      recommendation.ships.every((build) => build.equipment.some((gear) => gear?.masterId === 34)),
    )
    recommendation.ships
      .filter((build) => build.ship.shipTypeId === 4)
      .forEach((build) => {
        assert.equal(build.role, 'torpedo-cruiser')
        assert.ok(build.equipment.some((gear) => gear?.typeId === 22))
        assert.ok(
          build.equipment
            .filter((gear) => gear !== null && gear.masterId !== 34)
            .every((gear) => [2, 22].includes(gear.typeId)),
        )
      })
  })
})

test('4-5 one-battleship three-carrier Fast+ route validates its complete anti-land setup', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [8, 11, 11, 11, 5, 6]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })
  const route = getRouteTemplates('4-5', 'boss-clear', '4-5-fast-plus-battleship-carrier')[0]
  assert.equal(isAutomaticRouteReady(route), true)

  const result = recommendFleet({
    mapId: '4-5',
    routeId: route.id,
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    assert.equal(
      recommendation.ships
        .flatMap((build) => build.equipment)
        .filter((gear) => gear && [35, 317, 483].includes(gear.masterId)).length,
      2,
    )
    recommendation.ships
      .filter((build) => [11, 18].includes(build.ship.shipTypeId))
      .forEach((build) => {
        assert.ok(build.equipment.some((gear) => gear?.antiInstallationAircraft))
      })
  })
})

test('4-5 CL/DD shortest route searches an air-control carrier composition', () => {
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-cl-dd-heavy',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(createClDdHeavySnapshot()),
  })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations.length > 0)
  result.recommendations.forEach((recommendation) => {
    const battleship = recommendation.ships.find((build) =>
      [8, 9, 10, 12].includes(build.ship.shipTypeId),
    )
    const carrier = recommendation.ships.find((build) =>
      [7, 11, 18].includes(build.ship.shipTypeId),
    )
    const lightCruiser = recommendation.ships.find((build) => build.ship.shipTypeId === 3)
    assert.ok(battleship?.equipment.some((gear) => gear?.masterId === 35))
    assert.ok(carrier?.equipment.some((gear) => gear?.antiInstallationAircraft))
    assert.equal(
      lightCruiser?.equipment.some((gear) => [11, 45].includes(gear?.typeId)),
      false,
    )
    assert.ok(recommendation.metrics.airPower >= 92)
    assert.ok(
      recommendation.reasons.some(
        (reason) => reason.code === 'ANTI_INSTALLATION_REQUIREMENT_PASSED',
      ),
    )
    assert.ok(
      recommendation.reasons.some((reason) => reason.code === 'ANTI_INSTALLATION_CARRIER_READY'),
    )
    assert.equal(
      recommendation.warnings.some((warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED'),
      false,
    )
  })
})

test('ordinary routes fill opened expansion slots with unique compatible equipment', () => {
  const raw = createRawSnapshot()
  const expansionEquipmentIds = raw.equipment
    .filter((gear) => gear.typeId === 5)
    .map((gear) => gear.id)
  raw.ships.forEach((ship) => {
    ship.expansionSlotUnlocked = true
    ship.expansionEquipableEquipmentIds = expansionEquipmentIds
  })

  const result = recommendFleet({
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    const assignedExpansionIds = recommendation.ships.map((build) => build.expansionSlot?.id)
    assert.ok(assignedExpansionIds.every((id) => id !== undefined))
    assert.equal(new Set(assignedExpansionIds).size, assignedExpansionIds.length)
    assert.ok(assignedExpansionIds.every((id) => expansionEquipmentIds.includes(id)))
  })
})

test('Fast+ routes rank post-conversion combat capacity ahead of naked firepower', () => {
  const raw = createFastPlusSnapshot({ boilerCount: 7 })
  raw.ships[0].name = 'High-firepower slow battleship'
  raw.ships[0].speedValue = 5
  raw.ships[0].stats.firepower = 220
  raw.ships[0].expansionSlotUnlocked = false
  raw.ships[0].expansionEquipableEquipmentIds = []
  raw.ships[0].fastPlusPatterns = [
    {
      turbineCount: 1,
      enhancedBoilerCount: 2,
      newModelBoilerBelow7Count: 0,
      newModelBoilerAtLeast7Count: 0,
    },
  ]
  raw.ships[1].name = 'Fast battleship 1'
  raw.ships[1].stats.firepower = 110
  raw.ships.push(
    {
      ...structuredClone(raw.ships[1]),
      id: 901,
      masterId: 1901,
      name: 'Fast battleship 2',
    },
    {
      ...structuredClone(raw.ships[1]),
      id: 902,
      masterId: 1902,
      name: 'Fast battleship 3',
    },
  )

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-heavy',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  assert.equal(result.recommendations.length, 3)
  result.recommendations.forEach((recommendation) => {
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast+')
    assert.equal(
      recommendation.ships.some((build) => build.ship.name === 'High-firepower slow battleship'),
      false,
    )
  })
})

test('Fast+ routes reject fleets when owned speed gear cannot cover every ship', () => {
  const account = parseKC3AccountSnapshot(createFastPlusSnapshot({ boilerCount: 5 }))
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-heavy',
    objective: 'boss-clear',
    account,
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.some((reason) => reason.code === 'FLEET_SPEED_INSUFFICIENT'))
})

test('night-carrier routes require and reserve a valid ship trait or equipment setup', () => {
  const account = parseKC3AccountSnapshot(
    createFastPlusSnapshot({ nightCarrierRoute: true, nightCarrierSetup: true }),
  )
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-night-carrier',
    objective: 'boss-clear',
    account,
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    assert.ok(
      recommendation.ships.some((build) => {
        const equipment = [...build.equipment, build.expansionSlot].filter(Boolean)
        return (
          [7, 11, 18].includes(build.ship.shipTypeId) &&
          equipment.some((gear) => gear.iconTypeId === 45) &&
          equipment.some((gear) => gear.masterId === 258)
        )
      }),
    )
    recommendation.ships
      .filter((build) => build.ship.shipTypeId === 4)
      .forEach((build) => {
        assert.ok(build.equipment.some((gear) => gear?.typeId === 22))
        assert.ok(build.equipment.every((gear) => gear?.masterId !== 356))
      })
  })

  const unavailable = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-night-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(createFastPlusSnapshot({ nightCarrierRoute: true })),
  })
  assert.equal(unavailable.status, 'no-solution')
  assert.ok(
    unavailable.analysis.reasons.some((reason) => reason.code === 'NIGHT_CARRIER_UNAVAILABLE'),
  )
  assert.ok(
    unavailable.analysis.reasons.every((reason) => reason.code !== 'FLEET_SPEED_INSUFFICIENT'),
  )

  const nativeRaw = createFastPlusSnapshot({ nightCarrierRoute: true })
  nativeRaw.ships[1].nightCarrierPatterns = [
    {
      nightAircraftCount: 0,
      nightOperationsPersonnelCount: 0,
      swordfishCount: 0,
    },
  ]
  const native = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-night-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(nativeRaw),
  })
  assert.equal(native.status, 'success')
})

test('air-constrained cruiser routes assign owned seaplane fighters', () => {
  const raw = createRawSnapshot()
  const shipTypeIds = [6, 3, 2, 2, 2, 2]
  raw.hqLevel = 1
  raw.equipment[0].typeId = 45
  raw.equipment[0].iconTypeId = 45
  raw.equipment[0].type = '45'
  raw.equipment[0].airPowerBySlotSize = { 0: 0, 4: 20 }
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 100
  })
  raw.ships[0].slotSizes = [4, 4, 4, 4]

  const result = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-north-middle',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations[0].metrics.airPower >= 19)
  assert.ok(
    result.recommendations[0].ships.some((build) =>
      build.equipment.some((gear) => gear?.typeId === 45),
    ),
  )
})

test('solver is deterministic and only returns account-owned unique instances', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot())
  const input = {
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
    account,
  }
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
    assert.ok(recommendation.ships.every((build) => build.equipment.every((gear) => gear !== null)))
  })
})

test('automatic recommendation returns warned fleets for maps without a boss-fixed route', () => {
  const account = parseKC3AccountSnapshot(createAllNormalMapsSnapshot())

  ;['1-1', '4-3'].forEach((mapId) => {
    const result = recommendFleet({ mapId, objective: 'balanced', account })
    assert.equal(result.status, 'success', `${mapId}: ${JSON.stringify(result)}`)
    assert.ok(
      result.recommendations.every((recommendation) =>
        recommendation.warnings.some((warning) => warning.code === 'ROUTE_NOT_GUARANTEED'),
      ),
    )
  })
})

test('large unrelated equipment inventories do not change recommendations', () => {
  const baseRaw = createRawSnapshot()
  const largeRaw = structuredClone(baseRaw)
  const prototype = largeRaw.equipment[0]
  largeRaw.equipment.push(
    ...Array.from({ length: 1000 }, (_, index) => ({
      ...prototype,
      id: 10000 + index,
      masterId: 20000 + index,
      name: `Unrelated fixture gear ${index + 1}`,
      typeId: 99,
      iconTypeId: 99,
      type: '99',
    })),
  )

  const base = recommendFleet({
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(baseRaw),
  })
  const large = recommendFleet({
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(largeRaw),
  })

  assert.deepEqual(withoutTiming(large), withoutTiming(base))
})

test('solver returns no-solution when the account cannot meet fleet size', () => {
  const account = parseKC3AccountSnapshot(createRawSnapshot({ shipCount: 1 }))
  const result = recommendFleet({
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
    account,
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.length > 0)
})
