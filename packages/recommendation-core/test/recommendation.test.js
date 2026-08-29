const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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
const readPerMapCatalog = (relativeDir) => {
  const dir = path.join(__dirname, relativeDir)
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
}

const verifiedBossFleetCatalog = readPerMapCatalog('../src/rules/normal/verified-boss-fleets')
const strategyOverlayCatalog = readPerMapCatalog('../src/rules/normal/strategy-overlays')

const OBJECTIVES = new Set(RECOMMENDATION_OBJECTIVES)
const X5_KCWIKI_SOURCES = {
  '1-5': 'https://m.kcwiki.cn/wiki/%E9%95%87%E5%AE%88%E5%BA%9C%E6%B5%B7%E5%9F%9F/1-5',
  '2-5': 'https://zh.kcwiki.cn/wiki/%E5%8D%97%E8%A5%BF%E7%BE%A4%E5%B2%9B%E6%B5%B7%E5%9F%9F/2-5',
  '3-5': 'https://m.kcwiki.cn/wiki/%E5%8C%97%E6%96%B9%E6%B5%B7%E5%9F%9F/3-5',
  '4-5': 'https://m.kcwiki.cn/wiki/%E8%A5%BF%E6%96%B9%E6%B5%B7%E5%9F%9F/4-5',
  '5-5': 'https://m.kcwiki.cn/wiki/%E5%8D%97%E6%96%B9%E6%B5%B7%E5%9F%9F/5-5',
  '6-5': 'https://m.kcwiki.cn/wiki/%E4%B8%AD%E9%83%A8%E6%B5%B7%E5%9F%9F/6-5',
  '7-5': 'https://m.kcwiki.cn/wiki/7-5',
}
const ZH_KCWIKI_WORLD_NAMES = {
  1: '镇守府海域',
  2: '南西群岛海域',
  3: '北方海域',
  4: '西方海域',
  5: '南方海域',
  6: '中部海域',
  7: '南西海域',
}
const NORMAL_MAP_REFERENCE_SOURCE = 'https://forum.gamer.com.tw/C.php?bsn=24698&snA=14238'
const YUIKANCOLLE_EO_GUIDE_SOURCES = {
  '2-5': 'https://yuikancolle.blog.fc2.com/blog-entry-182.html',
  '3-5': 'https://yuikancolle.blog.fc2.com/blog-entry-183.html',
  '4-5': 'https://yuikancolle.blog.fc2.com/blog-entry-184.html',
  '5-5': 'https://yuikancolle.blog.fc2.com/blog-entry-185.html',
  '5-6': 'https://yuikancolle.blog.fc2.com/blog-entry-258.html',
  '6-5': 'https://yuikancolle.blog.fc2.com/blog-entry-186.html',
  '7-5': 'https://yuikancolle.blog.fc2.com/blog-entry-187.html',
}

const zhKcwikiGuideSource = (mapId) => {
  const [world] = mapId.split('-')
  const worldName = ZH_KCWIKI_WORLD_NAMES[world]
  return worldName
    ? `https://zh.kcwiki.cn/wiki/${encodeURIComponent(worldName)}/${mapId}`
    : `https://zh.kcwiki.cn/wiki/${mapId}`
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

const create45Type3ShellSnapshot = ({ shellCount = 3 } = {}) => {
  const raw = createFastPlusSnapshot()
  raw.equipment = raw.equipment.filter((gear) => ![35, 317, 483].includes(gear.masterId))
  const shipTypeIds = [8, 11, 11, 3, 2, 2]
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
  ;[0].forEach((shipIndex) => {
    raw.ships[shipIndex].regularEquipableMasterIds.push(...shellMasterIds)
  })
  raw.currentFleetShipIds = []
  return raw
}

const create45FastPlusCarrierAntiInstallationSnapshot = ({ shellCount = 3 } = {}) => {
  const raw = createFastPlusSnapshot()
  raw.equipment = raw.equipment.filter((gear) => ![35, 317, 483].includes(gear.masterId))
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6 || gear.typeId === 8) gear.airPowerBySlotSize = { 20: 200 }
  })
  const shipTypeIds = [11, 11, 7, 4, 4, 6]
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
  ;[5].forEach((shipIndex) => {
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

const allMapFixtureShipName = (shipTypeId, index) => {
  const guideShipNames = new Map([
    ['3-0', '矢矧改二乙'],
    ['5-0', '羽黒改二'],
    ['5-1', '足柄改二'],
    ['6-0', '最上改二特'],
    ['8-0', '長門改二'],
    ['8-1', '陸奥改二'],
    ['9-0', '武蔵改二'],
    ['10-0', '大和改二重'],
  ])
  return (
    guideShipNames.get(`${shipTypeId}-${index}`) ?? `All-map fixture ship ${shipTypeId}-${index}`
  )
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
  const nightCarrierGear = Array.from({ length: 20 }, (_, index) => ({
    ...structuredClone(equipment.find((gear) => gear.typeId === 8)),
    id: equipmentId++,
    masterId: 24000 + index,
    name: `All-map fixture night aircraft ${index}`,
    iconTypeId: 45,
  }))
  const nightOperationsPersonnel = Array.from({ length: 20 }, (_, index) => ({
    ...structuredClone(equipment[0]),
    id: equipmentId++,
    masterId: index === 0 ? 258 : 259,
    name: `All-map fixture night operations personnel ${index}`,
    typeId: 35,
    iconTypeId: 35,
    type: '35',
    airPowerBySlotSize: { 0: 0, 20: 0 },
  }))
  equipment.push(...speedGear, ...nightCarrierGear, ...nightOperationsPersonnel)
  const equipableMasterIds = [...new Set(equipment.map((gear) => gear.masterId))]
  const expansionEquipmentIds = equipment.map((gear) => gear.id)
  const shipTypeIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 21, 22]
  let shipId = 1000
  const ships = shipTypeIds.flatMap((shipTypeId) =>
    Array.from({ length: 8 }, (_, index) => ({
      id: shipId++,
      masterId: 30000 + shipTypeId * 100 + index,
      name: allMapFixtureShipName(shipTypeId, index),
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
      nightCarrierPatterns: [7, 11, 18].includes(shipTypeId)
        ? [
            {
              nightAircraftCount: 1,
              nightOperationsPersonnelCount: 1,
              swordfishCount: 0,
            },
          ]
        : [],
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

  raw.ships[0].openingAswRules = [{ kind: 'sonar', minimumAsw: 50 }]
  const accountWithOaswRules = parseKC3AccountSnapshot(raw)
  assert.deepEqual(accountWithOaswRules.ships[0].openingAswRules, [
    { kind: 'sonar', minimumAsw: 50 },
  ])

  raw.ships[1].id = raw.ships[0].id
  assert.throws(() => parseKC3AccountSnapshot(raw), /艦娘 instance ID 重複/)
})

test('normal map catalog remains complete, valid, unique, and semantically distinct', () => {
  const maps = getMapOptions()
  assert.equal(maps.length, 37)
  assert.equal(NORMAL_MAP_ROUTES.length, 126)
  assert.equal(NORMAL_MAP_ROUTES.filter((route) => route.id.startsWith('source-')).length, 0)
  assert.ok(maps.flatMap((map) => map.routes).every((route) => route.sources.length > 0))
  assert.ok(NORMAL_MAP_ROUTES.every((route) => route.metadata.guideSources.length > 0))
  const routeOptions16 = maps.find((map) => map.id === '1-6').routes
  assert.deepEqual(
    routeOptions16.map((route) => route.id),
    [
      '1-6-kcwiki-newbie',
      '1-6-kcwiki-regular',
      '1-6-kcwiki-air-control',
      '1-6-kcwiki-quarterly',
      '1-6-monthly-resource',
    ],
  )
  assert.deepEqual(
    routeOptions16.slice(0, 4).map((route) => route.name),
    ['1-6 萌新配置', '1-6 常規配置', '1-6 制空配置', '1-6 季常配置'],
  )
  routeOptions16.slice(0, 4).forEach((route) => {
    assert.deepEqual(route.sources, [zhKcwikiGuideSource('1-6')])
  })
  const airControl16 = getRouteTemplates('1-6', 'balanced', '1-6-kcwiki-air-control')[0]
  assert.deepEqual(
    airControl16.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[3], 1],
      [[2], 5],
    ],
  )
  assert.deepEqual(
    airControl16.calculatedConstraints.find((constraint) => constraint.kind === 'air-power'),
    { kind: 'air-power', minimum: 19, recommended: 83 },
  )
  const quarterly16 = getRouteTemplates('1-6', 'balanced', '1-6-kcwiki-quarterly')[0]
  assert.deepEqual(
    quarterly16.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[22], 2],
      [[2], 4],
    ],
  )
  assert.equal(quarterly16.stableBoss, false)
  assert.ok(quarterly16.tags.includes('random-routing'))
  const routeOptions42 = maps.find((map) => map.id === '4-2').routes
  assert.deepEqual(
    routeOptions42.map((route) => route.id),
    ['4-2-guide-cv2-clt-cl-dd2', '4-2-guide-cv2-bb-cav-dd2'],
  )
  routeOptions42.forEach((route) => {
    assert.deepEqual(route.sources, [zhKcwikiGuideSource('4-2')])
  })
  const routeOptions25 = maps.find((map) => map.id === '2-5').routes
  assert.deepEqual(
    routeOptions25.map((route) => route.id),
    ['2-5-middle', '2-5-middle-veteran', '2-5-north', '2-5-fifth-squadron'],
  )
  assert.deepEqual(
    routeOptions25.map((route) => route.name),
    ['萌新中路-推圖推薦', '老提督-中路洗地流', '萌新-上路航戰流', '第五戰隊'],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '3-5').routes.map((route) => route.id),
    [
      '3-5-true-south',
      '3-5-newbie-lower-smoke',
      '3-5-torpedo-squadron',
      '3-5-kcwiki-lower-yahagi',
      '3-5-kcwiki-lower-nisshin',
      '3-5-kcwiki-upper-3cv',
      '3-5-upper-carrier-guide',
      '3-5-kcwiki-upper-maya-submarines',
      '3-5-kcwiki-upper-nelson-touch',
      '3-5-kcwiki-upper-bb2cv',
      '3-5-newbie-upper-cav3',
      '3-5-kcwiki-lower-cav3cl2dd',
      '3-5-kcwiki-lower-cav2cl-flex',
      '3-5-kcwiki-lower-cl2-av2-flex',
      '3-5-kcwiki-lower-yubari-clt',
      '3-5-kcwiki-lower-opening-torpedo-six',
      '3-5-kcwiki-lower-hayasui',
      '3-5-kcwiki-lower-hayasui-yamashio',
      '3-5-kcwiki-lower-yamashio-av3',
    ],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '4-5').routes.map((route) => route.id),
    [
      '4-5-fast-plus-night-carrier',
      '4-5-kcwiki-night-carrier-small',
      '4-5-kcwiki-fast-plus-special-attack',
      '4-5-kcwiki-detour',
      '4-5-standard-balanced',
      '4-5-small-ship',
      '4-5-fast-plus-battleship-carrier',
      '4-5-fast-plus-carrier',
      '4-5-cl-dd-heavy',
      '4-5-cl-dd-light',
    ],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '5-5').routes.map((route) => route.id),
    [
      '5-5-middle',
      '5-5-supply-smoke',
      '5-5-submarine-snipe',
      '5-5-kcwiki-upper-yamato-night-carrier',
      '5-5-kcwiki-upper-cav',
      '5-5-kcwiki-upper-nelson',
      '5-5-kcwiki-upper-night-carrier',
      '5-5-kcwiki-upper-kongou-touch',
      '5-5-kcwiki-upper-random-nelson',
      '5-5-kcwiki-upper-random-nagato',
      '5-5-kcwiki-middle-yamato-smoke',
      '5-5-kcwiki-middle-yamato-mogami-yahagi',
      '5-5-kcwiki-middle-yamato-supply',
      '5-5-kcwiki-middle-nelson',
      '5-5-kcwiki-middle-transfer-south',
      '5-5-kcwiki-middle-heavy-cruiser',
      '5-5-south-dd',
      '5-5-kcwiki-south-yamato-dd',
      '5-5-kcwiki-south-night-carrier-dd',
      '5-5-kcwiki-south-bbv-cav-drums',
      '5-5-kcwiki-south-nagato-dd',
      '5-5-newbie-nagato',
      '5-5-kcwiki-bahamut-random-heavy',
    ],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '5-5').routes.map((route) => route.name),
    [
      '常規EO/中路戰巡流',
      '補給王煙流',
      'KCWiki + Yui｜潛艇配置',
      'KCWiki｜上路武大夜母配置',
      'KCWiki｜上路帶路配置',
      'KCWiki｜上路納爾遜',
      'KCWiki｜上路夜母',
      'KCWiki｜上路金剛改二丙',
      'KCWiki｜上路隨機配置1',
      'KCWiki｜上路隨機配置2',
      'KCWiki｜中路武大拉煙流',
      'KCWiki｜中路武大最矢流',
      'KCWiki｜中路武大補給流',
      'KCWiki｜中路納爾遜',
      'KCWiki｜中轉下摸流',
      'KCWiki｜中路重巡配置',
      'KCWiki + Yui｜中路水雷退避流',
      'KCWiki｜下路武大4DD',
      'KCWiki｜下路夜母2CV4DD',
      'KCWiki｜下路航戰航巡',
      'KCWiki｜下路長陸4DD',
      '新手長陸',
      'KCWiki + 巴哈｜上路六大船隨機',
    ],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '5-6').routes.map((route) => route.id),
    [
      '5-6-p1-transport',
      '5-6-p1-torpedo-squadron',
      '5-6-p2-surface',
      '5-6-p3-fast-plus-cv3',
      '5-6-p3-fast-plus-cv4',
      '5-6-p3-fast-night',
    ],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '6-5').routes.map((route) => route.id),
    ['6-5-south'],
  )
  assert.deepEqual(
    maps.find((map) => map.id === '7-5').routes.map((route) => route.id),
    ['7-5-p1-mixed', '7-5-p2-short', '7-5-p3-light-dd'],
  )
  ;[
    '3-5-south-cl-dd-av',
    '3-5-south-cl2-av2',
    '3-5-south-cl-av',
    '3-5-light-ao',
    '3-5-medium-ao',
    '4-5-standard-battleship',
    '4-5-standard-carrier',
    '4-5-standard-light',
    '4-5-standard-carrier-heavy',
    '4-5-fast-plus-heavy',
    '5-5-middle-fast-plus',
    '5-5-middle-ao',
    '5-5-north-heavy',
    '5-5-north-medium',
    '5-5-south-flex',
    '5-6-p2-submarine',
    '6-5-south-north',
    '6-5-north',
    '6-5-middle',
    '7-5-gimmick-m-p1',
    '7-5-gimmick-m',
    '7-5-p2-fast-carrier',
    '7-5-p3-light-cvl',
    '7-5-p3-medium-fast',
    '7-5-p3-heavy',
    '7-5-p3-heavy-fast',
  ].forEach((routeId) => {
    assert.equal(
      NORMAL_MAP_ROUTES.some((route) => route.id === routeId),
      false,
    )
  })
  routeOptions25.slice(0, 3).forEach((route) => {
    assert.deepEqual(route.sources, [zhKcwikiGuideSource('2-5')])
  })
  const routeOptions56 = maps.find((map) => map.id === '5-6').routes
  ;['5-6-p1-transport', '5-6-p2-surface', '5-6-p3-fast-plus-cv4', '5-6-p3-fast-night'].forEach(
    (routeId) => {
      assert.ok(
        routeOptions56
          .find((route) => route.id === routeId)
          .sources.includes(YUIKANCOLLE_EO_GUIDE_SOURCES['5-6']),
        `${routeId} should expose the matching Yui image guide`,
      )
    },
  )
  ;['5-6-p1-torpedo-squadron', '5-6-p3-fast-plus-cv3'].forEach((routeId) => {
    assert.equal(
      routeOptions56
        .find((route) => route.id === routeId)
        .sources.includes(YUIKANCOLLE_EO_GUIDE_SOURCES['5-6']),
      false,
      `${routeId} should not expose Yui as a selectable image guide`,
    )
  })
  ;[
    ['verified-boss-fleets/*.json', verifiedBossFleetCatalog],
    ['strategy-overlays/*.json', strategyOverlayCatalog],
  ].forEach(([label, catalog]) => {
    catalog.forEach((map) => {
      const hasMapSources = Array.isArray(map.sources) && map.sources.length > 0
      map.routes.forEach((route) => {
        const hasRouteSources = Array.isArray(route.sources) && route.sources.length > 0
        assert.ok(
          hasMapSources || hasRouteSources,
          `${label}/${map.area}/${route.id} has no sources`,
        )
      })
    })
  })

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
  const expectedX5OverlayRuleVersions = new Set(['2026.08.25-overlay', '2026.08.29-overlay'])
  assert.ok(
    extraOperationRoutes
      .filter((route) => route.category !== 'leveling' && !route.tags.includes('verified-guide'))
      .every((route) => expectedX5OverlayRuleVersions.has(route.metadata.ruleVersion)),
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
  assert.equal(verifiedGuideRoutes.length, 38)
  verifiedGuideRoutes.forEach((route) => {
    assert.equal(route.metadata.confidence, 'verified')
    assert.ok(['2026-08-26', '2026-08-29'].includes(route.metadata.lastVerified))
    assert.ok(route.metadata.ruleVersion.endsWith('-verified-guide'))
    assert.ok(
      route.metadata.guideSources.some(
        (source) =>
          source.startsWith('https://zekamashi.net/') || source.startsWith('https://zh.kcwiki.cn/'),
      ),
      `missing strategy guide: ${route.id}`,
    )
  })

  assert.equal(getRouteTemplates('1-1', 'balanced')[0].id, '1-1-guide-dd4')
  assert.equal(getRouteTemplates('2-3', 'balanced')[0].id, '2-3-guide-ca5-cl')
  assert.equal(getRouteTemplates('2-3', 'balanced', '2-3-guide-ca5-cl').length, 1)
  assert.equal(getRouteTemplates('4-2', 'balanced')[0].id, '4-2-guide-cv2-clt-cl-dd2')
  assert.equal(getRouteTemplates('4-3', 'balanced')[0].id, '4-3-guide-cv2-ca2-dd2')
  assert.equal(getRouteTemplates('1-1', 'balanced', '1-1-guide-dd4').length, 1)
  assert.equal(getRouteTemplates('4-3', 'balanced', '4-3-guide-cv2-ca2-dd2').length, 1)

  const regular42 = getRouteTemplates('4-2', 'balanced', '4-2-guide-cv2-clt-cl-dd2')[0]
  assert.deepEqual(regular42.nodes, ['A-C-L / A-E-G-L / B-D-C-L'])
  assert.deepEqual(
    regular42.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[7, 11], 2],
      [[4], 1],
      [[3], 1],
      [[2], 2],
    ],
  )
  assert.equal(
    regular42.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    84,
  )

  const weekly42 = getRouteTemplates('4-2', 'balanced', '4-2-guide-cv2-bb-cav-dd2')[0]
  assert.deepEqual(weekly42.nodes, ['A-C-L / A-C-G-L / A-E-G-L / B-D-C-L / B-D-C-G-L / B-D-H-G-L'])
  assert.deepEqual(
    weekly42.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[7, 11, 18], 2],
      [[8, 9, 10, 12], 1],
      [[6], 1],
      [[2], 2],
    ],
  )
  assert.equal(
    weekly42.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    84,
  )

  const upper35 = getRouteTemplates('3-5', 'balanced', '3-5-upper-carrier-guide')[0]
  assert.equal(upper35.id, '3-5-upper-carrier-guide')
  assert.deepEqual(
    upper35.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[5, 6, 11, 13, 14, 18], 6],
      [[11, 18], 3],
      [[5, 6], 1],
      [[13, 14], 2],
    ],
  )
  assert.equal(
    upper35.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    420,
  )
  const newbieUpper35 = getRouteTemplates('3-5', 'balanced', '3-5-newbie-upper-cav3')[0]
  assert.deepEqual(
    newbieUpper35.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[11, 18], 3],
      [[5, 6], 1],
      [[13, 14], 2],
    ],
  )
  assert.equal(
    newbieUpper35.calculatedConstraints.find((constraint) => constraint.kind === 'air-power')
      .minimum,
    420,
  )

  const surfaceUpper35 = getRouteTemplates('3-5', 'balanced', '3-5-kcwiki-upper-3cv')[0]
  assert.deepEqual(
    surfaceUpper35.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[11, 18], 3],
      [[4, 5, 6], 3],
    ],
  )
  assert.deepEqual(
    surfaceUpper35.calculatedConstraints.find((constraint) => constraint.kind === 'air-power'),
    { kind: 'air-power', minimum: 381, recommended: 395 },
  )
  assert.equal(
    surfaceUpper35.calculatedConstraints.find((constraint) => constraint.kind === 'los').minimum,
    40,
  )

  const nelsonUpper35 = getRouteTemplates('3-5', 'balanced', '3-5-kcwiki-upper-nelson-touch')[0]
  assert.ok(
    nelsonUpper35.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'specific-ship-name' && constraint.names.includes('Nelson改'),
    ),
  )
  assert.ok(nelsonUpper35.tags.includes('special-attack-modeled'))
  assert.equal(isAutomaticRouteReady(nelsonUpper35), true)
  ;[
    ['3-5-kcwiki-lower-yahagi', '矢矧改二乙'],
    ['3-5-kcwiki-lower-nisshin', '日進'],
    ['3-5-kcwiki-lower-yubari-clt', '夕張改二特'],
    ['3-5-kcwiki-lower-hayasui', '速吸改'],
    ['3-5-kcwiki-lower-hayasui-yamashio', '山汐丸'],
    ['3-5-kcwiki-lower-yamashio-av3', '山汐丸'],
  ].forEach(([routeId, requiredName]) => {
    const route = getRouteTemplates('3-5', 'balanced', routeId)[0]
    assert.ok(
      route.fleetConstraints.some(
        (constraint) =>
          constraint.kind === 'specific-ship-name' && constraint.names.includes(requiredName),
      ),
      `${routeId} should keep its source-named ship requirement`,
    )
  })
  ;[
    '3-5-kcwiki-lower-cav3cl2dd',
    '3-5-kcwiki-lower-cav2cl-flex',
    '3-5-kcwiki-lower-cl2-av2-flex',
    '3-5-kcwiki-lower-yubari-clt',
    '3-5-kcwiki-lower-opening-torpedo-six',
    '3-5-kcwiki-lower-hayasui',
    '3-5-kcwiki-lower-hayasui-yamashio',
    '3-5-kcwiki-lower-yamashio-av3',
  ].forEach((routeId) => {
    const route = getRouteTemplates('3-5', 'balanced', routeId)[0]
    assert.equal(isAutomaticRouteReady(route), false)
    assert.deepEqual(
      route.calculatedConstraints.find((constraint) => constraint.kind === 'air-power'),
      { kind: 'air-power', minimum: 35, recommended: 69 },
    )
    assert.equal(
      route.calculatedConstraints.find((constraint) => constraint.kind === 'los').minimum,
      28,
    )
  })

  NORMAL_MAP_ROUTES.filter((route) => route.mapId === '5-6').forEach((route) => {
    assert.equal(route.metadata.confidence, 'experimental')
    assert.ok(['2026-08-26', '2026-08-29'].includes(route.metadata.lastVerified))
    assert.equal(
      route.metadata.ruleVersion,
      `${route.metadata.lastVerified.replace(/-/g, '.')}-5-6`,
    )
    assert.ok(route.metadata.source.includes('https://kankorekore.2-d.jp/5-6_2nd/'))
    assert.ok(route.metadata.source.includes(YUIKANCOLLE_EO_GUIDE_SOURCES['5-6']))
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
  assert.ok(heavy15.tags.includes('asw-loadout'))
  assert.equal(heavy15.tags.includes('oasw'), false)
  assert.equal(
    heavy15.calculatedConstraints.some((constraint) => constraint.kind === 'opening-asw'),
    false,
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
  routes45.forEach((route) => {
    const airPower = route.calculatedConstraints.find(
      (constraint) => constraint.kind === 'air-power',
    )
    assert.ok(airPower, `${route.id} has no air-power constraint`)
    if (route.id === '4-5-standard-balanced') {
      assert.equal(airPower.minimum, 270)
      assert.equal(airPower.recommended, 270)
      assert.ok(
        route.calculatedConstraints.some(
          (constraint) =>
            constraint.kind === 'los' && constraint.coefficient === 2 && constraint.minimum === 70,
        ),
        `${route.id} has no K-to-T LoS constraint`,
      )
    } else if (route.id === '4-5-fast-plus-night-carrier') {
      assert.equal(airPower.minimum, 414)
      assert.equal(airPower.recommended, 414)
    } else if (route.id === '4-5-fast-plus-carrier') {
      assert.equal(airPower.minimum, 430)
      assert.equal(airPower.recommended, 430)
      assert.ok(
        route.fleetConstraints.some(
          (constraint) =>
            constraint.kind === 'ship-type-count' &&
            constraint.shipTypeIds.includes(6) &&
            constraint.shipTypeIds.includes(10) &&
            constraint.exact === 1,
        ),
      )
    } else if (route.id === '4-5-kcwiki-night-carrier-small') {
      assert.equal(airPower.minimum, 207)
      assert.equal(airPower.recommended, 215)
    } else if (['4-5-kcwiki-fast-plus-special-attack', '4-5-kcwiki-detour'].includes(route.id)) {
      assert.equal(airPower.minimum, 207)
      assert.equal(airPower.recommended, 220)
    } else if (['4-5-small-ship', '4-5-cl-dd-heavy'].includes(route.id)) {
      assert.equal(airPower.minimum, 215)
      assert.equal(airPower.recommended, 215)
    } else if (['4-5-fast-plus-battleship-carrier', '4-5-cl-dd-light'].includes(route.id)) {
      assert.equal(airPower.minimum, 220)
      assert.equal(airPower.recommended, 220)
    }
  })

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

  const kcwiki45Routes = routes45.filter((route) =>
    [
      '4-5-fast-plus-night-carrier',
      '4-5-kcwiki-night-carrier-small',
      '4-5-kcwiki-fast-plus-special-attack',
      '4-5-kcwiki-detour',
    ].includes(route.id),
  )
  assert.equal(kcwiki45Routes.length, 4)
  kcwiki45Routes.forEach((route) => {
    assert.deepEqual(route.metadata.guideSources, [X5_KCWIKI_SOURCES['4-5']])
    assert.equal(route.metadata.lastVerified, '2026-08-29')
  })
  const nightFast45 = kcwiki45Routes.find((route) => route.id === '4-5-fast-plus-night-carrier')
  assert.ok(nightFast45.tags.includes('night-carrier'))
  assert.ok(nightFast45.tags.includes('fast+'))
  assert.ok(
    nightFast45.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.shipTypeIds.length === 1 &&
        constraint.shipTypeIds[0] === 7 &&
        constraint.exact === 1,
    ),
  )
  const smallNight45 = kcwiki45Routes.find((route) => route.id === '4-5-kcwiki-night-carrier-small')
  assert.ok(
    smallNight45.calculatedConstraints.some(
      (constraint) => constraint.kind === 'opening-asw' && constraint.minimum === 3,
    ),
  )
  const specialAttack45 = kcwiki45Routes.find(
    (route) => route.id === '4-5-kcwiki-fast-plus-special-attack',
  )
  assert.ok(specialAttack45.tags.includes('special-attack-modeled'))
  assert.ok(
    specialAttack45.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'specific-ship-name' && constraint.names.includes('Nelson'),
    ),
  )
  const detour45 = kcwiki45Routes.find((route) => route.id === '4-5-kcwiki-detour')
  assert.deepEqual(detour45.objectives, ['balanced'])

  maps
    .flatMap((map) => map.routes)
    .forEach((routeOption) => {
      const route = NORMAL_MAP_ROUTES.find((candidate) => candidate.id === routeOption.id)
      assert.equal(routeOption.automaticReady, isAutomaticRouteReady(route))
    })

  const middle55 = getRouteTemplates('5-5', 'balanced', '5-5-middle')[0]
  assert.deepEqual(
    middle55.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[8, 9, 10, 12], 2],
      [[2], 2],
      [[3], 1],
      [[6], 1],
    ],
  )
  assert.deepEqual(
    middle55.fleetConstraints
      .filter((constraint) => constraint.kind === 'specific-ship-name')
      .map((constraint) => [constraint.names, constraint.min]),
    [
      [['大和'], 1],
      [['武蔵', '武藏', 'Iowa', 'Bismarck', 'Richelieu'], 1],
    ],
  )
  assert.equal(
    middle55.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    138,
  )
  assert.equal(isAutomaticRouteReady(middle55), true)

  const submarine55 = getRouteTemplates('5-5', 'low-cost', '5-5-submarine-snipe')[0]
  assert.deepEqual(
    submarine55.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [[[13, 14], 6]],
  )
  assert.equal(isAutomaticRouteReady(submarine55), false)

  const kcwikiUpper55 = getRouteTemplates('5-5', 'boss-clear', '5-5-kcwiki-upper-cav')[0]
  assert.equal(isAutomaticRouteReady(kcwikiUpper55), true)
  assert.deepEqual(
    kcwikiUpper55.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[7, 11, 18], 1],
      [[8, 9, 10, 12], 3],
      [[6], 2],
    ],
  )
  assert.equal(
    kcwikiUpper55.calculatedConstraints.find((constraint) => constraint.kind === 'air-power')
      .minimum,
    392,
  )
  assert.equal(
    kcwikiUpper55.calculatedConstraints.find((constraint) => constraint.kind === 'los').minimum,
    80,
  )

  const kcwikiRandomHeavy55 = getRouteTemplates(
    '5-5',
    'boss-clear',
    '5-5-kcwiki-bahamut-random-heavy',
  )[0]
  assert.equal(isAutomaticRouteReady(kcwikiRandomHeavy55), false)
  assert.ok(
    kcwikiRandomHeavy55.metadata.guideSources.includes(
      'https://home.gamer.com.tw/artwork.php?sn=2661813',
    ),
  )

  const south65 = getRouteTemplates('6-5', 'balanced', '6-5-south')[0]
  assert.deepEqual(
    south65.fleetConstraints
      .filter((constraint) => constraint.kind === 'ship-type-count' && constraint.exact)
      .map((constraint) => [constraint.shipTypeIds, constraint.exact]),
    [
      [[2, 3, 5, 6, 8, 9, 10, 12], 6],
      [[8, 9, 10, 12], 2],
      [[3, 5, 6], 2],
      [[2], 2],
    ],
  )
  getRouteTemplates('6-5', 'balanced').forEach((route) => {
    assert.ok(
      route.calculatedConstraints.some((constraint) => constraint.kind === 'air-power'),
      `${route.id} has no air-power constraint`,
    )
  })

  const phaseThree75 = getRouteTemplates('7-5', 'balanced', '7-5-p3-light-dd')[0]
  assert.deepEqual(phaseThree75.nodes, ['A', 'B', 'D', 'F', 'J', 'O', 'P', 'T'])
  assert.equal(
    phaseThree75.calculatedConstraints.find((constraint) => constraint.kind === 'los').minimum,
    59,
  )
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
  const shipTypeIds = [10, 9, 6, 3, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })
  raw.ships[0].name = '大和改二重'
  raw.ships[1].name = '武蔵改二'
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6 || gear.typeId === 8) gear.airPowerBySlotSize = { 20: 200 }
  })
  const sourceGear = raw.equipment[0]
  const seaplaneFighters = Array.from({ length: 2 }, (_, index) => ({
    ...structuredClone(sourceGear),
    id: 9300 + index,
    masterId: 9300 + index,
    name: `Fixture seaplane fighter ${index + 1}`,
    typeId: 45,
    iconTypeId: 45,
    type: '45',
    airPowerBySlotSize: { 20: 200 },
  }))
  raw.equipment.push(...seaplaneFighters)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(...seaplaneFighters.map((gear) => gear.masterId))
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-middle',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  result.recommendations.forEach((recommendation) => {
    assert.match(recommendation.ships[0].ship.name, /大和改二/)
    assert.match(recommendation.ships[1].ship.name, /武[藏蔵]改二/)
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast')
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

test('5-5 middle Yamato route accepts Yui-listed friend battleships', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [10, 8, 6, 3, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 120
    ship.stats = { ...ship.stats, los: 120 }
  })
  raw.ships[0].name = '大和改二重'
  raw.ships[1].name = 'Iowa改'
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6 || gear.typeId === 8 || gear.typeId === 45) {
      gear.airPowerBySlotSize = { 20: 200 }
    }
  })
  const sourceGear = raw.equipment[0]
  const seaplaneFighters = Array.from({ length: 2 }, (_, index) => ({
    ...structuredClone(sourceGear),
    id: 9350 + index,
    masterId: 9350 + index,
    name: `Fixture Yamato friend seaplane fighter ${index + 1}`,
    typeId: 45,
    iconTypeId: 45,
    type: '45',
    stats: { ...sourceGear.stats, los: 8, antiAir: 10 },
    airPowerBySlotSize: { 20: 200 },
  }))
  raw.equipment.push(...seaplaneFighters)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(...seaplaneFighters.map((gear) => gear.masterId))
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-middle',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.match(result.recommendations[0].ships[0].ship.name, /大和改二/)
  assert.match(result.recommendations[0].ships[1].ship.name, /Iowa/)
  assert.ok(
    result.recommendations[0].reasons.some((reason) => reason.code === 'SPECIAL_ATTACK_READY'),
  )
})

test('5-5 modeled special attacks explain when the account lacks the required named pair', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [10, 9, 6, 3, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-middle',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.some((reason) => reason.code === 'MISSING_SPECIFIC_SHIP'))
})

test('ordinary battleship AP-shell slots never consume Type 3 Shell-family equipment', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [10, 9, 6, 3, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
  })
  raw.ships[0].name = '大和改二重'
  raw.ships[1].name = '武蔵改二'
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
    assert.ok(
      route.metadata.source.includes(zhKcwikiGuideSource(route.mapId)),
      `missing zh KCWiki guide: ${route.id}`,
    )
    assert.ok(
      route.metadata.source.includes(NORMAL_MAP_REFERENCE_SOURCE),
      `missing Bahamut normal-map reference: ${route.id}`,
    )
    if (YUIKANCOLLE_EO_GUIDE_SOURCES[route.mapId]) {
      assert.ok(
        route.metadata.source.includes(YUIKANCOLLE_EO_GUIDE_SOURCES[route.mapId]),
        `missing Yui EO guide: ${route.id}`,
      )
    }
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

test('2-2 exposes current transport and submarine farming variants', () => {
  const routes = getMapOptions().find((map) => map.id === '2-2').routes
  const bauxiteRoute = NORMAL_MAP_ROUTES.find((route) => route.id === '2-2-bauxite-carrier')
  const carrierSubmarineRoute = NORMAL_MAP_ROUTES.find(
    (route) => route.id === '2-2-transport-carrier-submarine',
  )
  const submarineSixRoute = NORMAL_MAP_ROUTES.find(
    (route) => route.id === '2-2-low-cost-submarine6',
  )

  assert.ok(bauxiteRoute)
  assert.ok(carrierSubmarineRoute)
  assert.ok(submarineSixRoute)
  assert.equal(bauxiteRoute.resourceProfile.target, 'bauxite')
  assert.equal(bauxiteRoute.resourceProfile.fuelCostRate, 0.2)
  assert.ok(
    bauxiteRoute.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.exact === 3 &&
        constraint.shipTypeIds.includes(16) &&
        constraint.shipTypeIds.includes(13),
    ),
  )
  assert.equal(isAutomaticRouteReady(carrierSubmarineRoute), true)
  assert.equal(isAutomaticRouteReady(submarineSixRoute), false)
  assert.ok(routes.find((route) => route.id === '2-2-low-cost-submarine6'))
  assert.equal(
    getRouteTemplates('2-2', 'balanced').some((route) => route.id === '2-2-low-cost-submarine6'),
    false,
  )

  const carrierSubmarineRaw = createFastPlusSnapshot()
  ;[7, 7, 7, 13, 13, 14].forEach((shipTypeId, index) => {
    carrierSubmarineRaw.ships[index].shipTypeId = shipTypeId
  })
  const carrierSubmarine = recommendFleet({
    mapId: '2-2',
    routeId: '2-2-transport-carrier-submarine',
    objective: 'resource-bauxite',
    account: parseKC3AccountSnapshot(carrierSubmarineRaw),
  })
  assert.equal(carrierSubmarine.status, 'success')
  assert.equal(carrierSubmarine.recommendations[0].route.nodes.join(''), 'CBA')
  assert.equal(carrierSubmarine.recommendations[0].metrics.estimatedResourceGain, 15)

  const submarineRaw = createFastPlusSnapshot()
  submarineRaw.ships.forEach((ship, index) => {
    ship.shipTypeId = index % 2 === 0 ? 13 : 14
    ship.slotSizes = [0, 0]
    ship.equippedItemIds = [0, 0]
  })
  const submarineSix = recommendFleet({
    mapId: '2-2',
    routeId: '2-2-low-cost-submarine6',
    objective: 'low-cost',
    account: parseKC3AccountSnapshot(submarineRaw),
  })
  assert.equal(submarineSix.status, 'success')
  assert.ok(
    submarineSix.recommendations[0].ships.every((build) =>
      [13, 14].includes(build.ship.shipTypeId),
    ),
  )
  assert.ok(
    submarineSix.recommendations[0].warnings.some(
      (warning) => warning.code === 'ROUTE_NOT_GUARANTEED',
    ),
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

test('1-5 uses current fleet ASW equipment from the full account pool', () => {
  const raw = createOaswSnapshot()
  raw.ships = raw.ships.slice(0, 4)
  raw.currentFleetShipIds = raw.ships.map((ship) => ship.id)
  raw.equipment = [...raw.equipment.slice(0, 8), ...raw.equipment.slice(12, 16)]
  raw.ships.forEach((ship, index) => {
    const sonarA = raw.equipment[index * 2]
    const sonarB = raw.equipment[index * 2 + 1]
    const depthCharge = raw.equipment[8 + index]
    ship.equippedItemIds = [sonarA.id, depthCharge.id, sonarB.id]
    ;[sonarA, sonarB, depthCharge].forEach((gear) => {
      gear.currentlyEquippedBy = ship.id
    })
  })
  const account = parseKC3AccountSnapshot(raw)
  const result = recommendFleet({
    mapId: '1-5',
    routeId: '1-5-boss-light',
    objective: 'balanced',
    account,
    preferences: { avoidCurrentFleetEquipment: true },
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  const recommendation = result.recommendations[0]
  assert.equal(recommendation.metrics.openingAswCount, 4)
  const currentFleetIds = new Set(account.currentFleetShipIds)
  recommendation.ships.forEach((build) => {
    const assignedIds = build.equipment.map((gear) => gear?.id).filter(Boolean)
    assert.ok(assignedIds.length > 0)
    assert.ok(
      assignedIds.every((id) => {
        const gear = account.equipment.find((item) => item.id === id)
        return gear?.currentlyEquippedBy && currentFleetIds.has(gear.currentlyEquippedBy)
      }),
    )
  })
})

test('1-5 beginner second-shelling route equips normal ASW without requiring opening ASW', () => {
  const raw = createAllNormalMapsSnapshot()
  raw.ships.forEach((ship) => {
    ship.stats.asw = 0
    ship.openingAswRules = []
  })
  raw.equipment.forEach((gear) => {
    gear.stats.asw = 0
  })
  const result = recommendFleet({
    mapId: '1-5',
    routeId: '1-5-boss-heavy',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  const recommendation = result.recommendations[0]
  assert.equal(recommendation.metrics.openingAswRequired, false)
  assert.equal(recommendation.metrics.openingAswMinimum, 0)
  const lightShips = recommendation.ships.filter((build) => [2, 3].includes(build.ship.shipTypeId))
  assert.equal(lightShips.length, 3)
  assert.ok(lightShips.every((build) => build.role === 'anti-submarine'))
  assert.ok(
    lightShips.every((build) =>
      build.equipment.some((gear) => gear && [14, 15, 40].includes(gear.typeId)),
    ),
  )
})

test('KC3 opening ASW ship rules can satisfy route requirements below generic thresholds', () => {
  const raw = createOaswSnapshot()
  raw.ships.forEach((ship, index) => {
    ship.stats.asw = 20 + index
    ship.openingAswRules = index === 0 ? [{ kind: 'none', minimumAsw: 0 }] : []
  })
  raw.equipment.forEach((gear) => {
    gear.stats.asw = 0
  })
  const account = parseKC3AccountSnapshot(raw)
  const result = recommendFleet({
    mapId: '1-5',
    routeId: '1-5-leveling-asw',
    objective: 'leveling',
    account,
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(
    result.recommendations.some((recommendation) =>
      recommendation.ships.some((build) => build.ship.id === account.ships[0].id),
    ),
    true,
  )
  result.recommendations.forEach((recommendation) => {
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

test('4-5 KCWiki guide exposes four source-matched configurations', () => {
  const routeIds = [
    '4-5-fast-plus-night-carrier',
    '4-5-kcwiki-night-carrier-small',
    '4-5-kcwiki-fast-plus-special-attack',
    '4-5-kcwiki-detour',
  ]
  const routes = routeIds.map((routeId) => NORMAL_MAP_ROUTES.find((route) => route.id === routeId))

  assert.ok(routes.every(Boolean))
  routes.forEach((route) => {
    assert.deepEqual(route.metadata.guideSources, [X5_KCWIKI_SOURCES['4-5']])
    assert.equal(route.metadata.lastVerified, '2026-08-29')
    assert.equal(isAutomaticRouteReady(route), true)
  })

  const [nightFast, nightSmall, specialAttack, detour] = routes
  assert.ok(nightFast.tags.includes('fast+'))
  assert.ok(nightFast.tags.includes('night-carrier'))
  assert.equal(
    nightFast.calculatedConstraints.find((constraint) => constraint.kind === 'air-power').minimum,
    414,
  )
  assert.ok(
    nightSmall.calculatedConstraints.some(
      (constraint) => constraint.kind === 'opening-asw' && constraint.minimum === 3,
    ),
  )
  assert.ok(specialAttack.tags.includes('special-attack-modeled'))
  assert.ok(
    specialAttack.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'specific-ship-name' && constraint.names.includes('Nelson'),
    ),
  )
  assert.deepEqual(detour.objectives, ['balanced'])
  assert.deepEqual(detour.nodes, ['A-B-E-M-R-N-T / C-F-I-J-H-T'])
  assert.match(detour.description, /A-B-E-M-R-N-T.*C-F-I-J-H-T/)
})

test('4-5 automatic routes expose only modeled anti-installation setups', () => {
  const automatic45RouteIds = getRouteTemplates('4-5', 'balanced').map((route) => route.id)
  assert.deepEqual(automatic45RouteIds.sort(), [
    '4-5-cl-dd-light',
    '4-5-fast-plus-battleship-carrier',
    '4-5-fast-plus-carrier',
    '4-5-fast-plus-night-carrier',
    '4-5-kcwiki-detour',
    '4-5-kcwiki-fast-plus-special-attack',
    '4-5-kcwiki-night-carrier-small',
  ])
  assert.equal(
    isAutomaticRouteReady(NORMAL_MAP_ROUTES.find((route) => route.id === '4-5-standard-balanced')),
    false,
  )

  const result = recommendFleet({
    mapId: '4-5',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(create45Type3ShellSnapshot()),
  })

  assert.equal(result.status, 'success')
  result.recommendations.forEach((recommendation) => {
    const requiredShellCount = Number(
      recommendation.route.tags
        .find((tag) => tag.startsWith('anti-installation-type3-shells-'))
        ?.match(/\d+$/)?.[0] ?? 0,
    )
    const shells = recommendation.ships
      .flatMap((build) => build.equipment)
      .filter((gear) => gear && [35, 317, 483].includes(gear.masterId))
    assert.equal(shells.length, requiredShellCount)
    assert.equal(new Set(shells.map((gear) => gear.id)).size, requiredShellCount)
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
    account: parseKC3AccountSnapshot(create45Type3ShellSnapshot({ shellCount: 0 })),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(
    result.analysis.reasons.some(
      (reason) => reason.code === 'ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
    ),
  )
})

test('4-5 small-ship route does not hard-require night or anti-installation carriers', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [7, 11, 3, 2, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 100
    ship.stats = { ...ship.stats, los: 100 }
    ship.slotSizes = [20, 20, 20, 20]
    ship.equippedItemIds = [0, 0, 0, 0]
    ship.nightCarrierPatterns = []
  })
  raw.equipment.forEach((gear) => {
    gear.antiInstallationAircraft = false
    if ([6, 7, 8].includes(gear.typeId)) {
      gear.airPowerBySlotSize = { 20: 80 }
    }
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-small-ship',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.airPower >= 215)
  assert.equal(
    result.recommendations[0].warnings.some(
      (warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED',
    ),
    true,
  )
})

test('4-5 KCWiki Fast+ night-carrier route validates the source fleet and setup', () => {
  const raw = createFastPlusSnapshot({ nightCarrierRoute: true, nightCarrierSetup: true })
  raw.equipment.forEach((gear) => {
    if ([6, 7, 8].includes(gear.typeId)) gear.airPowerBySlotSize = { 20: 200 }
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-night-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  result.recommendations.forEach((recommendation) => {
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast+')
    assert.ok(recommendation.metrics.airPower >= 414)
    assert.equal(
      recommendation.ships.filter((build) => [11, 18].includes(build.ship.shipTypeId)).length,
      2,
    )
    assert.equal(recommendation.ships.filter((build) => build.ship.shipTypeId === 7).length, 1)
    assert.ok(
      recommendation.ships.some((build) => build.equipment.some((gear) => gear?.masterId === 258)),
    )
  })
})

test('4-5 KCWiki Fast+ night-carrier route diagnoses a missing night setup', () => {
  const raw = createFastPlusSnapshot({ nightCarrierRoute: true, nightCarrierSetup: false })
  raw.equipment.forEach((gear) => {
    if ([6, 7, 8].includes(gear.typeId)) gear.airPowerBySlotSize = { 20: 200 }
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-night-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.some((reason) => reason.code === 'NIGHT_CARRIER_UNAVAILABLE'))
})

test('4-5 KCWiki Nelson Fast+ route orders and explains Nelson Touch', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [9, 11, 11, 18, 5, 4]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.name = index === 0 ? 'Nelson改' : `4-5 Nelson fixture ${index}`
  })
  raw.equipment.forEach((gear) => {
    if ([6, 7, 8].includes(gear.typeId)) gear.airPowerBySlotSize = { 20: 200 }
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-kcwiki-fast-plus-special-attack',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  result.recommendations.forEach((recommendation) => {
    assert.equal(recommendation.ships[0].ship.name, 'Nelson改')
    assert.ok(![7, 11, 13, 14, 18].includes(recommendation.ships[2].ship.shipTypeId))
    assert.ok(![7, 11, 13, 14, 18].includes(recommendation.ships[4].ship.shipTypeId))
    assert.ok(
      recommendation.reasons.some(
        (reason) => reason.code === 'SPECIAL_ATTACK_READY' && reason.values?.formation === '複縱陣',
      ),
    )
  })
})

test('4-5 KCWiki Nelson Fast+ route reports a missing Nelson', () => {
  const raw = createFastPlusSnapshot()
  ;[9, 11, 11, 18, 5, 4].forEach((shipTypeId, index) => {
    raw.ships[index].shipTypeId = shipTypeId
    raw.ships[index].name = `Special attack fixture ${index}`
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-kcwiki-fast-plus-special-attack',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.some((reason) => reason.code === 'MISSING_SPECIFIC_SHIP'))
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
      [7, 11, 18].includes(build.ship.shipTypeId),
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

test('4-5 Fast+ carrier route accepts torpedo bombers as land-attack-safe carrier aircraft', () => {
  const raw = create45FastPlusCarrierAntiInstallationSnapshot()
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 8) gear.antiInstallationAircraft = false
  })
  raw.equipment
    .filter((gear) => gear.typeId === 8 || gear.typeId === 6)
    .forEach((gear) => {
      gear.airPowerBySlotSize = { 20: 90 }
    })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.airPower >= 430)
  result.recommendations[0].ships
    .filter((build) => [7, 11, 18].includes(build.ship.shipTypeId))
    .forEach((build) => {
      assert.ok(build.equipment.some((gear) => gear?.typeId === 8))
      assert.equal(
        build.equipment.some((gear) => gear?.typeId === 7 && !gear.antiInstallationAircraft),
        false,
      )
    })
})

test('4-5 high-air Fast+ carrier route preserves two cruiser water-fighter slots', () => {
  const raw = create45FastPlusCarrierAntiInstallationSnapshot({ shellCount: 0 })
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6 || gear.typeId === 8) gear.airPowerBySlotSize = { 20: 30 }
  })
  const aviationCruiser = raw.ships[5]
  aviationCruiser.slotSizes = [2, 2, 7, 11]
  const sourceGear = raw.equipment[0]
  const landingCraft = {
    ...structuredClone(sourceGear),
    id: 7700,
    masterId: 9970,
    name: 'Fixture Type 1 Ho-Ni I',
    typeId: 24,
    iconTypeId: 24,
    type: '24',
    stats: { ...sourceGear.stats, firepower: 12 },
    airPowerBySlotSize: {},
  }
  const waterFighters = [7, 11].map((slotSize, index) => ({
    ...structuredClone(sourceGear),
    id: 7701 + index,
    masterId: 9971 + index,
    name: `Fixture high-air water fighter ${index + 1}`,
    typeId: 45,
    iconTypeId: 45,
    type: '45',
    stats: { ...sourceGear.stats, antiAir: 12, los: 2 },
    airPowerBySlotSize: { [slotSize]: 80 },
  }))
  raw.equipment.push(landingCraft, ...waterFighters)
  aviationCruiser.regularEquipableMasterIds.push(
    landingCraft.masterId,
    ...waterFighters.map((gear) => gear.masterId),
  )

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.airPower >= 430)
  const surfaceFinisher = result.recommendations[0].ships.find(
    (build) => build.ship.shipTypeId === 6,
  )
  assert.ok(surfaceFinisher.equipment.some((gear) => gear?.typeId === 24))
  assert.equal(
    surfaceFinisher.equipment.filter((gear) =>
      waterFighters.some((waterFighter) => waterFighter.id === gear?.id),
    ).length,
    2,
  )
})

test('4-5 high-air Fast+ route meets air power before adding flexible carrier attackers', () => {
  const raw = create45FastPlusCarrierAntiInstallationSnapshot({ shellCount: 1 })
  const slotSizes = [30, 24, 12, 6]
  raw.ships.forEach((ship) => {
    ship.slotSizes = slotSizes
  })
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6) {
      gear.airPowerBySlotSize = { 30: 110, 24: 100, 12: 70, 6: 50 }
    }
    if (gear.typeId === 8) {
      gear.airPowerBySlotSize = { 30: 30, 24: 25, 12: 18, 6: 12 }
    }
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.airPower >= 430)
  const carriers = result.recommendations[0].ships.filter((build) =>
    [7, 11, 18].includes(build.ship.shipTypeId),
  )
  carriers.forEach((build) => {
    assert.ok(build.equipment.some((gear) => gear?.typeId === 8))
    assert.equal(
      build.equipment.some((gear) => gear?.typeId === 7 && !gear.antiInstallationAircraft),
      false,
    )
  })
  assert.ok(
    carriers.flatMap((build) => build.equipment).filter((gear) => gear?.typeId === 8).length > 3,
  )
  assert.ok(result.diagnostics.evaluatedFleetCandidateCount > 0)
  assert.ok(result.diagnostics.gearSolutionCount > 0)
  assert.ok(result.diagnostics.bestAirPower >= 430)
  assert.equal(result.diagnostics.airPowerMinimum, 430)
  assert.deepEqual(result.diagnostics.reasonCodes, [])
})

test('4-5 high-air Fast+ failure diagnostics report the searched air-power ceiling', () => {
  const raw = create45FastPlusCarrierAntiInstallationSnapshot({ shellCount: 1 })
  raw.equipment.forEach((gear) => {
    if ([6, 8].includes(gear.typeId)) gear.airPowerBySlotSize = { 20: 20 }
  })

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.diagnostics.evaluatedFleetCandidateCount > 0)
  assert.ok(result.diagnostics.gearSolutionCount > 0)
  assert.equal(result.diagnostics.airPowerMinimum, 430)
  assert.ok(result.diagnostics.bestAirPower < 430)
  assert.ok(result.diagnostics.reasonCodes.includes('AIR_POWER_INSUFFICIENT'))
})

test('4-5 Fast+ carrier route reports missing mixed anti-installation equipment', () => {
  const account = parseKC3AccountSnapshot(
    create45FastPlusCarrierAntiInstallationSnapshot({ shellCount: 0 }),
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
  assert.ok(
    route.fleetConstraints.some(
      (constraint) =>
        constraint.kind === 'ship-type-count' &&
        constraint.min === 2 &&
        constraint.shipTypeIds.length === 2 &&
        constraint.shipTypeIds.includes(3) &&
        constraint.shipTypeIds.includes(6),
    ),
  )
  assert.equal(route.tags.includes('bbv-seaplane-los-priority'), true)
  const shipTypeIds = [10, 10, 10, 5, 6, 3]
  raw.hqLevel = 1
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.speedValue = index === 0 ? 5 : 10
    ship.nakedLos = 100
    ship.slotSizes = [1, 1, 1, 1]
  })
  const seaplanes = raw.equipment.slice(0, 8).map((gear, index) => ({
    ...gear,
    id: 9201 + index,
    masterId: 9301 + index,
    name: `Fixture seaplane ${index + 1}`,
    typeId: 10,
    iconTypeId: 10,
    type: '10',
    stats: { ...gear.stats, los: 6, bombing: 4 },
    airPowerBySlotSize: { 0: 0, 1: 20 },
  }))
  raw.equipment.push(...seaplanes)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds.push(...seaplanes.map((gear) => gear.masterId))
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
    if ([3, 6].includes(ship.shipTypeId)) {
      ship.regularEquipableMasterIds.push(...drums.map((gear) => gear.masterId))
    }
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
  valid.recommendations[0].ships
    .filter((build) => build.ship.shipTypeId === 10)
    .forEach((build) => {
      assert.ok(build.equipment.filter((gear) => gear?.typeId === 10).length >= 2)
    })
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

test('2-5 north prefers reasonable LoS seaplanes over high-air low-LoS seaplanes', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 120
  raw.currentFleetShipIds = []
  const shipTypes = [10, 10, 10, 6, 6, 3]
  const nakedLos = [61, 72, 72, 89, 65, 49]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypes[index]
    ship.speedValue = index < 3 ? 5 : 10
    ship.nakedLos = nakedLos[index]
    ship.stats = { ...ship.stats, los: nakedLos[index] }
    ship.slotSizes = index === 5 ? [1, 1, 1] : [10, 10, 10, 10]
    ship.equippedItemIds = ship.slotSizes.map(() => 0)
  })

  let equipmentId = 70000
  const createGear = (masterId, typeId, stats = {}, airPower = 0, iconTypeId = typeId) => ({
    id: equipmentId++,
    masterId,
    name: `2-5 fixture gear ${equipmentId}`,
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
    airPowerBySlotSize: { 1: airPower, 10: airPower },
  })
  const bigGuns = Array.from({ length: 6 }, (_, index) =>
    createGear(71000 + index, 3, { firepower: 12, accuracy: 1 }),
  )
  const cruiserGuns = Array.from({ length: 8 }, (_, index) =>
    createGear(72000 + index, 2, { firepower: 8, accuracy: 1 }),
  )
  const highAirLowLosSeaplanes = Array.from({ length: 8 }, (_, index) =>
    createGear(73000 + index, 45, { antiAir: 10, los: 0, bombing: 0 }, 20, 45),
  )
  const zuiunLikeSeaplanes = Array.from({ length: 8 }, (_, index) =>
    createGear(74000 + index, 11, { antiAir: 0, los: 6, bombing: 4 }, 6, 11),
  )
  const drums = Array.from({ length: 2 }, (_, index) => createGear(75000 + index, 30))
  raw.equipment = [
    ...bigGuns,
    ...cruiserGuns,
    ...highAirLowLosSeaplanes,
    ...zuiunLikeSeaplanes,
    ...drums,
  ]
  const equipableMasterIds = raw.equipment.map((gear) => gear.masterId)
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds = equipableMasterIds
  })

  const result = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-north',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.los33 >= 49)
  assert.ok(result.recommendations[0].metrics.airPower >= 42)
  assert.ok(
    result.recommendations[0].ships
      .filter((build) => build.ship.shipTypeId === 10)
      .every(
        (build) =>
          build.equipment.filter((gear) => [10, 11, 45].includes(gear?.typeId)).length >= 2 &&
          build.equipment.filter((gear) => gear?.typeId === 3).length >= 2,
      ),
  )
  assert.ok(
    result.recommendations[0].ships
      .filter((build) => build.ship.shipTypeId === 6)
      .every(
        (build) => build.equipment.filter((gear) => [2, 3].includes(gear?.typeId)).length >= 2,
      ),
  )
  assert.equal(result.recommendations[0].metrics.drumCount, 2)
})

test('3-5 newbie lower smoke treats air power 1 as guide advice, not a hard gate', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 1
  const shipTypeIds = [3, 2, 2, 2, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 100
    ship.stats = { ...ship.stats, los: 100 }
    ship.slotSizes = [0, 0, 0]
    ship.equippedItemIds = [0, 0, 0]
  })

  const result = recommendFleet({
    mapId: '3-5',
    routeId: '3-5-newbie-lower-smoke',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(result.recommendations[0].metrics.airPower, 0)
  assert.equal(result.recommendations[0].metrics.airPowerRequired, false)
})

test('3-5 elite torpedo squadron treats air power 1 as guide advice, not a hard gate', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 1
  const shipTypeIds = [3, 2, 2, 2, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 100
    ship.stats = { ...ship.stats, los: 100 }
    ship.slotSizes = [0, 0, 0]
    ship.equippedItemIds = [0, 0, 0]
  })

  const result = recommendFleet({
    mapId: '3-5',
    routeId: '3-5-torpedo-squadron',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(result.recommendations[0].metrics.airPower, 0)
  assert.equal(result.recommendations[0].metrics.airPowerRequired, false)
})

test('5-5 south torpedo retreat treats air power 1 as guide advice, not a hard gate', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 1
  raw.currentFleetShipIds = []
  const shipTypeIds = [3, 4, 2, 2, 2, 2]
  const midgetSubmarine = {
    ...structuredClone(raw.equipment[0]),
    id: 89000,
    masterId: 89100,
    name: 'Fixture midget submarine',
    typeId: 22,
    iconTypeId: 22,
    type: '22',
  }
  raw.equipment.push(midgetSubmarine)
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 200
    ship.stats = { ...ship.stats, los: 200 }
    ship.slotSizes = [0, 0, 0]
    ship.equippedItemIds = [0, 0, 0]
    ship.regularEquipableMasterIds.push(midgetSubmarine.masterId)
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-south-dd',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(result.recommendations[0].metrics.airPower, 0)
  assert.equal(result.recommendations[0].metrics.airPowerRequired, false)
})

test('5-5 south torpedo retreat keeps LoS combat loadouts instead of forcing all ASW gear', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 120
  raw.currentFleetShipIds = []
  const shipTypeIds = [3, 4, 2, 2, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.level = 99
    ship.nakedLos = 55
    ship.stats = { ...ship.stats, los: 55, asw: 60, torpedo: 90, luck: 40 }
    ship.slotSizes = [1, 1, 1]
    ship.equippedItemIds = [0, 0, 0]
  })

  let equipmentId = 89000
  const createGear = (masterId, typeId, stats = {}, iconTypeId = typeId) => ({
    id: equipmentId++,
    masterId,
    name: `5-5 south fixture gear ${equipmentId}`,
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
    airPowerBySlotSize: { 1: 0 },
  })
  const smallGuns = Array.from({ length: 8 }, (_, index) =>
    createGear(89100 + index, 1, { firepower: 4, antiAir: 6 }),
  )
  const mainGuns = Array.from({ length: 2 }, (_, index) =>
    createGear(89200 + index, 2, { firepower: 8, accuracy: 2 }),
  )
  const torpedoes = Array.from({ length: 4 }, (_, index) =>
    createGear(89300 + index, index === 0 ? 22 : 5, { torpedo: 12 }),
  )
  const radars = Array.from({ length: 6 }, (_, index) =>
    createGear(89400 + index, 12, { los: 18, accuracy: 3 }),
  )
  const recons = Array.from({ length: 2 }, (_, index) =>
    createGear(89500 + index, 9, { los: 15, accuracy: 2 }),
  )
  const sonars = Array.from({ length: 6 }, (_, index) => createGear(89600 + index, 14, { asw: 12 }))
  const depthCharges = Array.from({ length: 6 }, (_, index) =>
    createGear(89700 + index, 15, { asw: 10 }),
  )
  raw.equipment = [
    ...smallGuns,
    ...mainGuns,
    ...torpedoes,
    ...radars,
    ...recons,
    ...sonars,
    ...depthCharges,
  ]
  raw.ships.forEach((ship) => {
    ship.regularEquipableMasterIds = raw.equipment.map((gear) => gear.masterId)
  })

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-south-dd',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.los33 >= 66)
  assert.ok(
    result.recommendations[0].ships.some((build) =>
      build.equipment.some((gear) => gear?.typeId === 12),
    ),
  )
  assert.equal(
    result.recommendations[0].ships.every((build) =>
      build.equipment.every((gear) => gear && [14, 15].includes(gear.typeId)),
    ),
    false,
  )
})

test('5-5 submarine snipe allocates submarine LoS gear for the Cn2 80 gate', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 120
  raw.currentFleetShipIds = []
  raw.ships.forEach((ship, index) => {
    ship.name = index < 2 ? `伊${13 + index}改` : `伊${58 + index}改`
    ship.shipTypeId = index < 2 ? 14 : 13
    ship.level = 99
    ship.nakedLos = 25
    ship.stats = { ...ship.stats, los: 25, torpedo: 90, luck: 50 }
    ship.slotSizes = index < 2 ? [2, 2, 2] : [1, 1]
    ship.equippedItemIds = ship.slotSizes.map(() => 0)
  })

  let equipmentId = 89800
  const createGear = (masterId, typeId, stats = {}, iconTypeId = typeId) => ({
    id: equipmentId++,
    masterId,
    name: `5-5 submarine fixture gear ${equipmentId}`,
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
    airPowerBySlotSize: { 1: 0, 2: 0 },
  })
  const torpedoes = Array.from({ length: 8 }, (_, index) =>
    createGear(89810 + index, 32, { torpedo: 12, accuracy: 2 }),
  )
  const submarineRadars = Array.from({ length: 4 }, (_, index) =>
    createGear(89830 + index, 51, { los: 20, accuracy: 2 }),
  )
  const submarineRecons = Array.from({ length: 2 }, (_, index) =>
    createGear(89840 + index, 10, { los: 12, accuracy: 1 }),
  )
  raw.equipment = [...torpedoes, ...submarineRadars, ...submarineRecons]
  raw.ships.forEach((ship, index) => {
    ship.regularEquipableMasterIds = [
      ...torpedoes,
      ...submarineRadars,
      ...(index < 2 ? submarineRecons : []),
    ].map((gear) => gear.masterId)
  })

  const route = getRouteTemplates('5-5', 'low-cost', '5-5-submarine-snipe')[0]
  assert.equal(route.tags.includes('submarine-los-priority'), true)

  const result = recommendFleet({
    mapId: '5-5',
    routeId: '5-5-submarine-snipe',
    objective: 'low-cost',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.los33 >= 80)
  assert.ok(
    result.recommendations[0].ships.some((build) =>
      build.equipment.some((gear) => gear && [10, 51].includes(gear.typeId)),
    ),
  )
})

test('3-5 Yui newbie upper prefers Maya AACI and seaplane-capable submarines', () => {
  const raw = createRawSnapshot({ shipCount: 8 })
  raw.hqLevel = 1
  raw.currentFleetShipIds = []
  let equipmentId = 80000
  const createGear = (
    masterId,
    typeId,
    stats = {},
    airPowerBySlotSize = { 0: 0, 1: 0, 2: 0, 20: 0 },
    iconTypeId = typeId,
  ) => ({
    id: equipmentId++,
    masterId,
    name: `3-5 fixture gear ${equipmentId}`,
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
    airPowerBySlotSize,
  })
  const carrierAttackers = Array.from({ length: 6 }, (_, index) =>
    createGear(81000 + index, 8, { torpedo: 12, antiAir: 2 }, { 20: 20 }),
  )
  const carrierFighters = Array.from({ length: 8 }, (_, index) =>
    createGear(82000 + index, 6, { antiAir: 12 }, { 20: 80 }),
  )
  const cruiserGuns = Array.from({ length: 2 }, (_, index) =>
    createGear(83000 + index, 2, { firepower: 10, accuracy: 2 }),
  )
  const antiAirGun = createGear(84000, 2, { firepower: 2, antiAir: 12, accuracy: 4 })
  const recons = Array.from({ length: 2 }, (_, index) =>
    createGear(85000 + index, 10, { los: 9, accuracy: 2 }, { 1: 0, 2: 0 }),
  )
  const type3Shell = createGear(86000, 18, { firepower: 1 })
  const submarineTorpedoes = Array.from({ length: 4 }, (_, index) =>
    createGear(87000 + index, 32, { torpedo: 12, accuracy: 2 }),
  )
  const submarineSeaplanes = Array.from({ length: 2 }, (_, index) =>
    createGear(88000 + index, 45, { antiAir: 6, los: 2 }, { 1: 30, 2: 35, 20: 0 }),
  )
  raw.equipment = [
    ...carrierAttackers,
    ...carrierFighters,
    ...cruiserGuns,
    antiAirGun,
    ...recons,
    type3Shell,
    ...submarineTorpedoes,
    ...submarineSeaplanes,
  ]
  const allMasterIds = raw.equipment.map((gear) => gear.masterId)
  raw.ships.forEach((ship, index) => {
    ship.level = 99
    ship.nakedLos = 100
    ship.stats = { ...ship.stats, firepower: 70, torpedo: 70, antiAir: 80, los: 100 }
    ship.slotSizes = [20, 20, 20, 20]
    ship.equippedItemIds = [0, 0, 0, 0]
    ship.regularEquipableMasterIds = allMasterIds
    ship.expansionSlotUnlocked = false
    ship.expansionEquipableEquipmentIds = []
    if (index < 3) ship.shipTypeId = index === 0 ? 18 : 11
  })
  Object.assign(raw.ships[3], {
    name: '摩耶改二',
    shipTypeId: 5,
    stats: { ...raw.ships[3].stats, antiAir: 120, firepower: 80 },
    slotSizes: [1, 1, 1, 1],
  })
  Object.assign(raw.ships[4], {
    name: '鈴谷改二',
    shipTypeId: 6,
    stats: { ...raw.ships[4].stats, antiAir: 70, firepower: 150, torpedo: 100 },
    slotSizes: [1, 1, 1, 1],
  })
  Object.assign(raw.ships[5], {
    name: '伊13改',
    shipTypeId: 14,
    stats: { ...raw.ships[5].stats, torpedo: 80 },
    slotSizes: [2, 1, 1],
    equippedItemIds: [0, 0, 0],
  })
  Object.assign(raw.ships[6], {
    name: '伊14改',
    shipTypeId: 14,
    stats: { ...raw.ships[6].stats, torpedo: 78 },
    slotSizes: [2, 1, 1],
    equippedItemIds: [0, 0, 0],
  })
  Object.assign(raw.ships[7], {
    name: '伊58改',
    shipTypeId: 13,
    stats: { ...raw.ships[7].stats, torpedo: 180, luck: 80 },
    slotSizes: [1, 1],
    equippedItemIds: [0, 0],
    regularEquipableMasterIds: submarineTorpedoes.map((gear) => gear.masterId),
  })

  const result = recommendFleet({
    mapId: '3-5',
    routeId: '3-5-newbie-upper-cav3',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  const recommendation = result.recommendations[0]
  const shipNames = recommendation.ships.map((build) => build.ship.name)
  assert.ok(shipNames.includes('摩耶改二'))
  assert.equal(shipNames.includes('鈴谷改二'), false)
  assert.ok(shipNames.includes('伊13改'))
  assert.ok(shipNames.includes('伊14改'))
  assert.ok(recommendation.metrics.airPower >= 420)
  assert.ok(recommendation.metrics.los33 >= 40)

  const maya = recommendation.ships.find((build) => build.ship.name === '摩耶改二')
  assert.ok(maya.equipment.some((gear) => gear?.id === antiAirGun.id))
  assert.ok(maya.equipment.some((gear) => gear?.typeId === 18))
  recommendation.ships
    .filter((build) => ['伊13改', '伊14改'].includes(build.ship.name))
    .forEach((build) => {
      assert.ok(build.equipment.some((gear) => gear?.typeId === 45))
      assert.ok(build.equipment.filter((gear) => gear?.typeId === 32).length >= 2)
    })
})

test('2-5 Fifth Squadron accepts localized CJK variants of required ship names', () => {
  const raw = createAllNormalMapsSnapshot()
  const heavyCruisers = raw.ships.filter((ship) => ship.shipTypeId === 5)
  heavyCruisers[0].name = '妙高改二'
  heavyCruisers[1].name = '那智改二'
  heavyCruisers[2].name = '羽黑改二'
  raw.ships.find((ship) => ship.shipTypeId === 10).speedValue = 5

  const result = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-fifth-squadron',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  const selectedNames = result.recommendations[0].ships.map((build) => build.ship.name)
  ;['妙高改二', '那智改二', '羽黑改二'].forEach((name) => {
    assert.ok(selectedNames.includes(name), `${name} was not selected`)
  })
})

test('2-5 Fifth Squadron ranks aviation battleships by support capacity without ship-name pinning', () => {
  const raw = createAllNormalMapsSnapshot()
  const heavyCruisers = raw.ships.filter((ship) => ship.shipTypeId === 5)
  const [yamashiro, hyuga] = raw.ships.filter((ship) => ship.shipTypeId === 10)
  const lightCruiser = raw.ships.find((ship) => ship.shipTypeId === 3)
  const aviationCruiser = raw.ships.find((ship) => ship.shipTypeId === 6)
  heavyCruisers[0].name = '妙高改二'
  heavyCruisers[1].name = '那智改二'
  heavyCruisers[2].name = '羽黑改二'
  Object.assign(yamashiro, {
    name: '山城改二',
    level: 99,
    speedValue: 5,
    nakedLos: 65,
    slotSizes: [4, 4, 9, 23],
    stats: { ...yamashiro.stats, firepower: 180, armor: 170, los: 65 },
  })
  Object.assign(hyuga, {
    name: '日向改二',
    level: 92,
    speedValue: 5,
    nakedLos: 85,
    slotSizes: [2, 2, 22, 22, 9],
    stats: { ...hyuga.stats, firepower: 145, armor: 145, los: 85 },
  })
  raw.ships = [
    heavyCruisers[0],
    heavyCruisers[1],
    heavyCruisers[2],
    yamashiro,
    hyuga,
    lightCruiser,
    aviationCruiser,
  ]
  raw.currentFleetShipIds = []

  const result = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-fifth-squadron',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(
    result.recommendations[0].ships.find((build) => build.ship.shipTypeId === 10).ship.name,
    '日向改二',
  )
})

test('2-5 Fifth Squadron balances aviation battleship seaplanes for air power and LoS', () => {
  const raw = createRawSnapshot()
  raw.hqLevel = 120
  raw.currentFleetShipIds = []
  const shipTypeIds = [10, 5, 5, 5, 3, 3]
  const names = ['伊勢改二', '妙高改二', '那智改二', '羽黑改二', '矢矧改二乙', '阿武隈改二']
  const nakedLos = [80, 80, 80, 80, 70, 70]
  raw.ships.forEach((ship, index) => {
    ship.name = names[index]
    ship.shipTypeId = shipTypeIds[index]
    ship.level = 99
    ship.speedValue = index === 0 ? 5 : 10
    ship.nakedLos = nakedLos[index]
    ship.stats = { ...ship.stats, firepower: 100, torpedo: 80, los: nakedLos[index] }
    ship.slotSizes = index === 0 ? [22, 22, 22, 22, 22] : [1, 1, 1, 1]
    ship.equippedItemIds = ship.slotSizes.map(() => 0)
  })

  let equipmentId = 76000
  const createGear = (masterId, typeId, stats = {}, airPower = 0, iconTypeId = typeId) => ({
    id: equipmentId++,
    masterId,
    name: `2-5 Fifth Squadron fixture gear ${equipmentId}`,
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
    airPowerBySlotSize: { 1: airPower, 22: airPower },
  })
  const bigGuns = Array.from({ length: 2 }, (_, index) =>
    createGear(76100 + index, 3, { firepower: 20, accuracy: 2 }),
  )
  const cruiserGuns = Array.from({ length: 10 }, (_, index) =>
    createGear(76200 + index, 2, { firepower: 10, accuracy: 2 }),
  )
  const recons = Array.from({ length: 6 }, (_, index) =>
    createGear(76300 + index, 9, { los: 8, accuracy: 2 }),
  )
  const radars = Array.from({ length: 6 }, (_, index) =>
    createGear(76400 + index, 12, { los: 6, accuracy: 3 }),
  )
  const highLosLowAirSeaplanes = Array.from({ length: 3 }, (_, index) =>
    createGear(76500 + index, 10, { los: 8, bombing: 4 }, 20, 10),
  )
  const highAirSeaplanes = Array.from({ length: 3 }, (_, index) =>
    createGear(76600 + index, 11, { antiAir: 10, los: 1, bombing: 2 }, 30, 11),
  )
  const drums = Array.from({ length: 2 }, (_, index) => createGear(76700 + index, 30))
  raw.equipment = [
    ...bigGuns,
    ...cruiserGuns,
    ...recons,
    ...radars,
    ...highLosLowAirSeaplanes,
    ...highAirSeaplanes,
    ...drums,
  ]
  raw.ships[0].regularEquipableMasterIds = [
    ...bigGuns,
    ...highLosLowAirSeaplanes,
    ...highAirSeaplanes,
  ].map((gear) => gear.masterId)
  raw.ships.slice(1, 4).forEach((ship) => {
    ship.regularEquipableMasterIds = [...cruiserGuns, ...recons, ...radars].map(
      (gear) => gear.masterId,
    )
  })
  raw.ships.slice(4).forEach((ship) => {
    ship.regularEquipableMasterIds = [...cruiserGuns, ...recons, ...radars, ...drums].map(
      (gear) => gear.masterId,
    )
  })

  const route = getRouteTemplates('2-5', 'boss-clear', '2-5-fifth-squadron')[0]
  assert.equal(route.tags.includes('bbv-seaplane-los-priority'), true)
  assert.equal(route.tags.includes('bbv-seaplane-air-priority'), true)

  const result = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-fifth-squadron',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.airPower >= 84)
  assert.ok(result.recommendations[0].metrics.los33 >= 49)
  const aviationBattleship = result.recommendations[0].ships.find(
    (build) => build.ship.shipTypeId === 10,
  )
  assert.equal(
    aviationBattleship.equipment.filter((gear) =>
      highAirSeaplanes.some((item) => item.id === gear?.id),
    ).length,
    3,
  )
})

test('2-5 middle route skips high-score slow ships before fleet search', () => {
  const raw = createAllNormalMapsSnapshot()
  const lightCruiser = raw.ships.find((ship) => ship.shipTypeId === 3)
  const slowLightCruisers = Array.from({ length: 14 }, (_, index) => ({
    ...structuredClone(lightCruiser),
    id: 50000 + index,
    masterId: 51000 + index,
    name: `Fixture slow high-score CL ${index + 1}`,
    level: 180,
    speedValue: 5,
    stats: {
      hp: 999,
      firepower: 999,
      torpedo: 999,
      antiAir: 999,
      armor: 999,
      evasion: 999,
      asw: 999,
      los: 999,
      luck: 999,
    },
    nakedLos: 999,
  }))
  raw.ships.push(...slowLightCruisers)

  const result = recommendFleet({
    mapId: '2-5',
    routeId: '2-5-middle',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations[0].ships.every((build) => build.ship.speed !== 'slow'))
  assert.ok(
    result.recommendations[0].ships.some(
      (build) => build.ship.shipTypeId === 3 && !build.ship.name.includes('slow high-score'),
    ),
  )
})

test('2-5 veteran middle route accepts an ordinary carrier without night setup', () => {
  const raw = createFastPlusSnapshot({ nightCarrierSetup: false })
  ;[7, 11, 3, 2, 2, 2].forEach((shipTypeId, index) => {
    raw.ships[index].shipTypeId = shipTypeId
    raw.ships[index].speedValue = 10
    raw.ships[index].nakedLos = 100
    raw.ships[index].stats = { ...raw.ships[index].stats, los: 100 }
  })
  const route = getRouteTemplates('2-5', 'boss-clear', '2-5-middle-veteran')[0]

  assert.equal(route.tags.includes('night-carrier'), false)
  assert.equal(isAutomaticRouteReady(route), true)

  const result = recommendFleet({
    mapId: '2-5',
    routeId: route.id,
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.equal(
    result.recommendations[0].ships.some((build) =>
      build.equipment.some((gear) => gear?.masterId === 258),
    ),
    false,
  )
  assert.ok(result.recommendations[0].metrics.airPower >= 42)
  assert.ok(result.recommendations[0].metrics.los33 >= 34)
})

test('Fast+ routes allocate unique speed gear through open expansion slots', () => {
  const raw = createFastPlusSnapshot()
  ;[11, 11, 7, 4, 4, 6].forEach((shipTypeId, index) => {
    raw.ships[index].shipTypeId = shipTypeId
  })
  raw.equipment.forEach((gear) => {
    if (gear.typeId === 6 || gear.typeId === 8) gear.airPowerBySlotSize = { 20: 200 }
  })
  const account = parseKC3AccountSnapshot(raw)
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
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
  const shipTypeIds = [8, 11, 11, 7, 4, 6]
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
      1,
    )
    recommendation.ships
      .filter((build) => [7, 11, 18].includes(build.ship.shipTypeId))
      .forEach((build) => {
        assert.ok(build.equipment.some((gear) => gear?.antiInstallationAircraft))
      })
  })
})

test('4-5 KCWiki CL/DD shortest route follows the source setup without hard anti-installation model', () => {
  const raw = createFastPlusSnapshot()
  const shipTypeIds = [11, 11, 3, 2, 2, 2]
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 100
    ship.stats = { ...ship.stats, los: 100 }
    ship.slotSizes = [20, 20, 20, 20]
    ship.equippedItemIds = [0, 0, 0, 0]
    ship.nightCarrierPatterns = []
  })
  raw.equipment = raw.equipment.filter((gear) => ![35, 317, 483].includes(gear.masterId))
  raw.equipment.forEach((gear) => {
    gear.antiInstallationAircraft = false
    if ([6, 7, 8].includes(gear.typeId)) {
      gear.airPowerBySlotSize = { 20: 80 }
    }
  })

  const route = getRouteTemplates('4-5', 'balanced', '4-5-cl-dd-heavy')[0]
  assert.equal(isAutomaticRouteReady(route), false)

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-cl-dd-heavy',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations.length > 0)
  result.recommendations.forEach((recommendation) => {
    const lightCruiser = recommendation.ships.find((build) => build.ship.shipTypeId === 3)
    const carriers = recommendation.ships.filter((build) =>
      [7, 11, 18].includes(build.ship.shipTypeId),
    )
    assert.equal(carriers.length, 2)
    assert.equal(
      recommendation.ships
        .flatMap((build) => build.equipment)
        .some((gear) => gear && [35, 317, 483].includes(gear.masterId)),
      false,
    )
    assert.equal(
      carriers.some((build) => build.equipment.some((gear) => gear?.antiInstallationAircraft)),
      false,
    )
    assert.equal(
      lightCruiser?.equipment.some((gear) => [11, 45].includes(gear?.typeId)),
      false,
    )
    assert.ok(recommendation.metrics.airPower >= 215)
    assert.equal(
      recommendation.reasons.some(
        (reason) => reason.code === 'ANTI_INSTALLATION_REQUIREMENT_PASSED',
      ),
      false,
    )
    assert.equal(
      recommendation.reasons.some((reason) => reason.code === 'ANTI_INSTALLATION_CARRIER_READY'),
      false,
    )
    assert.ok(
      recommendation.warnings.some((warning) => warning.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED'),
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
  ;[8, 11, 11, 7, 4, 6].forEach((shipTypeId, index) => {
    raw.ships[index].shipTypeId = shipTypeId
  })
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
  const fastBattleship = {
    ...structuredClone(raw.ships[0]),
    shipTypeId: 8,
    speedValue: 10,
    stats: { ...raw.ships[0].stats, firepower: 110 },
    expansionSlotUnlocked: true,
    expansionEquipableEquipmentIds: raw.equipment
      .filter((gear) => gear.masterId === 33)
      .map((gear) => gear.id),
    fastPlusPatterns: [
      {
        turbineCount: 1,
        enhancedBoilerCount: 1,
        newModelBoilerBelow7Count: 0,
        newModelBoilerAtLeast7Count: 0,
      },
    ],
  }
  raw.ships.push(
    {
      ...structuredClone(fastBattleship),
      id: 901,
      masterId: 1901,
      name: 'Fast battleship 1',
    },
    {
      ...structuredClone(fastBattleship),
      id: 902,
      masterId: 1902,
      name: 'Fast battleship 2',
    },
    {
      ...structuredClone(fastBattleship),
      id: 903,
      masterId: 1903,
      name: 'Fast battleship 3',
    },
  )

  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-battleship-carrier',
    objective: 'boss-clear',
    account: parseKC3AccountSnapshot(raw),
    candidateLimit: 18,
  })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations.length >= 3)
  result.recommendations.forEach((recommendation) => {
    assert.equal(recommendation.metrics.finalSpeedClass, 'fast+')
    assert.equal(
      recommendation.ships.some((build) => build.ship.name === 'High-firepower slow battleship'),
      false,
    )
  })
})

test('Fast+ routes reject fleets when owned speed gear cannot cover every ship', () => {
  const raw = createFastPlusSnapshot({ boilerCount: 5 })
  ;[11, 11, 7, 4, 4, 6].forEach((shipTypeId, index) => {
    raw.ships[index].shipTypeId = shipTypeId
  })
  const account = parseKC3AccountSnapshot(raw)
  const result = recommendFleet({
    mapId: '4-5',
    routeId: '4-5-fast-plus-carrier',
    objective: 'boss-clear',
    account,
  })

  assert.equal(result.status, 'no-solution')
  assert.ok(result.analysis.reasons.some((reason) => reason.code === 'FLEET_SPEED_INSUFFICIENT'))
})

test('air-constrained routes assign owned seaplane fighters', () => {
  const raw = createRawSnapshot()
  const shipTypeIds = [10, 8, 6, 3, 2, 2]
  raw.hqLevel = 1
  raw.equipment.slice(0, 2).forEach((gear) => {
    gear.typeId = 45
    gear.iconTypeId = 45
    gear.type = '45'
    gear.airPowerBySlotSize = { 0: 0, 4: 90 }
  })
  raw.ships.forEach((ship, index) => {
    ship.shipTypeId = shipTypeIds[index]
    ship.nakedLos = 100
  })
  raw.ships[0].slotSizes = [4, 4, 4, 4]
  raw.ships[2].slotSizes = [4, 4, 4, 4]

  const result = recommendFleet({
    mapId: '6-5',
    routeId: '6-5-south',
    objective: 'balanced',
    account: parseKC3AccountSnapshot(raw),
  })

  assert.equal(result.status, 'success')
  assert.ok(result.recommendations[0].metrics.airPower >= 165)
  assert.ok(
    result.recommendations[0].ships.some((build) =>
      build.equipment.some((gear) => gear?.typeId === 45),
    ),
  )
})

test('1-6 air-control route fills a compatible light cruiser with seaplanes', () => {
  const createAccount = (seaplaneCount) => {
    const raw = createRawSnapshot()
    raw.hqLevel = 1
    raw.ships[0].name = 'Fixture seaplane-capable light cruiser'
    raw.ships[0].shipTypeId = 3
    raw.ships[0].slotSizes = [1, 1, 1]
    raw.equipment.slice(0, seaplaneCount).forEach((gear) => {
      gear.typeId = 45
      gear.iconTypeId = 45
      gear.type = '45'
      gear.airPowerBySlotSize = { 0: 0, 1: 7 }
    })
    return parseKC3AccountSnapshot(raw)
  }

  const result = recommendFleet({
    mapId: '1-6',
    routeId: '1-6-kcwiki-air-control',
    objective: 'balanced',
    account: createAccount(3),
  })

  assert.equal(result.status, 'success', JSON.stringify(result))
  assert.ok(result.recommendations[0].metrics.airPower >= 19)
  const lightCruiser = result.recommendations[0].ships.find((build) => build.ship.shipTypeId === 3)
  assert.equal(lightCruiser.equipment.filter((gear) => gear?.typeId === 45).length, 3)

  const insufficient = recommendFleet({
    mapId: '1-6',
    routeId: '1-6-kcwiki-air-control',
    objective: 'balanced',
    account: createAccount(2),
  })
  assert.equal(insufficient.status, 'no-solution')
  assert.ok(
    insufficient.analysis.reasons.some((reason) => reason.code === 'AIR_POWER_INSUFFICIENT'),
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
