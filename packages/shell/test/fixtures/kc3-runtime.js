const HOUR_MS = 60 * 60 * 1000
const FIXED_NOW = Date.parse('2026-08-24T17:15:00.000Z')

const createShip = ({ rosterId, masterId, level, maxFuel, maxAmmo, morale = 49 }) => ({
  rosterId,
  masterId,
  level,
  morale,
  master: () => ({ api_stype: 2, api_fuel_max: maxFuel, api_bull_max: maxAmmo }),
  nakedStats: () => ({ fp: 20, tp: 30, aa: 15, ls: 10, as: 12 }),
  expedEquipmentTotalStats: () => 0,
  statsSp: () => 0,
  equipment: () => [],
  isEscortLightCarrier: () => false,
  countDrums: () => 0,
})

const ships = [
  createShip({ rosterId: 1, masterId: 101, level: 120, maxFuel: 20, maxAmmo: 20, morale: 55 }),
  createShip({ rosterId: 2, masterId: 102, level: 80, maxFuel: 15, maxAmmo: 20 }),
  createShip({ rosterId: 3, masterId: 103, level: 70, maxFuel: 15, maxAmmo: 25 }),
  createShip({ rosterId: 4, masterId: 104, level: 60, maxFuel: 20, maxAmmo: 25 }),
  createShip({ rosterId: 5, masterId: 105, level: 50, maxFuel: 25, maxAmmo: 30 }),
  createShip({ rosterId: 6, masterId: 106, level: 40, maxFuel: 30, maxAmmo: 30 }),
]

const missionData = {
  1: {
    name: 'Practice voyage',
    displayNo: '01',
    durationMinutes: 20,
    baseIncome: { fuel: 30, ammo: 30, steel: 0, bauxite: 0 },
    shipCount: 2,
    bucketMax: 0,
  },
  2: {
    name: 'Bucket voyage',
    displayNo: '02',
    durationMinutes: 30,
    baseIncome: { fuel: 100, ammo: 0, steel: 0, bauxite: 0 },
    shipCount: 4,
    bucketMax: 1,
  },
  3: {
    name: 'Ammo voyage',
    displayNo: '03',
    durationMinutes: 40,
    baseIncome: { fuel: 0, ammo: 100, steel: 0, bauxite: 0 },
    shipCount: 3,
    bucketMax: 0,
  },
}

const nullableChecks = {
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

const createFleet = ({ fleetId, shipIds, supplied, mission = [0, 0, 0] }) => ({
  fleetId,
  name: `Fixture fleet ${fleetId}`,
  active: true,
  ships: shipIds,
  mission,
  isSupplied: () => supplied,
})

export const createExpeditionWindow = () => {
  const shipMap = Object.fromEntries(ships.map((ship) => [ship.rosterId, ship]))
  const fleets = [
    createFleet({ fleetId: 1, shipIds: [1, 2, 3, 4, 5, 6], supplied: true }),
    createFleet({ fleetId: 2, shipIds: [1, 2, 3, 4], supplied: true }),
    createFleet({
      fleetId: 3,
      shipIds: [2, 3, 4],
      supplied: false,
      mission: [1, 3, FIXED_NOW + HOUR_MS],
    }),
    createFleet({ fleetId: 4, shipIds: [5, 6], supplied: true }),
  ]

  return {
    PlayerManager: {
      hq: { lastMaterial: [1000, 2000, 3000, 4000] },
      maxResource: 350000,
      fleets,
      loadFleets: () => {},
    },
    Expedition: {
      modifierToNumber: ({ gs, daihatsu }) => (gs ? 1.5 : 1) * (1 + daihatsu * 0.05),
    },
    KC3Master: {
      available: true,
      mission: (id) => {
        const mission = missionData[id]
        if (!mission) return null
        return {
          api_disp_no: mission.displayNo,
          api_name: mission.name,
          api_time: mission.durationMinutes,
          api_deck_num: mission.shipCount,
          api_use_fuel: 0.1,
          api_use_bull: 0.1,
          api_sample_fleet: [2, 2, 0, 0, 0, 0],
          api_reset_type: 0,
        }
      },
    },
    KC3ShipManager: {
      list: shipMap,
      get: (id) => shipMap[id],
    },
    KC3Meta: { stype: (id) => `SType ${id}` },
    PS: {
      'KanColle.Expedition.New.Info': {
        getInformation: (id) => {
          const mission = missionData[id]
          return mission
            ? { resource: mission.baseIncome, timeInMin: mission.durationMinutes }
            : null
        },
        findRawInfo: (id) => {
          const mission = missionData[id]
          return mission?.bucketMax
            ? { api_win_item1: [1, mission.bucketMax], kc3_gs_all_sparkle: true }
            : {}
        },
      },
      'KanColle.Expedition.RequirementObject': {
        getExpeditionRequirementPack: (id) => ({ id }),
        requirementPackToObj: ({ id }) => ({
          flagShipLevel: 1,
          shipCount: missionData[id].shipCount,
          ...nullableChecks,
        }),
        checkWithRequirementPack:
          ({ id }) =>
          (encoded) => ({
            flagShipLevel: Number(encoded[0]?.level || 0) >= 1,
            shipCount: encoded.length >= missionData[id].shipCount,
            ...nullableChecks,
          }),
        resultPackToObject: (result) => result,
      },
      'KanColle.Expedition.Requirement': {
        fromRawFleet: (fleetShips) => fleetShips,
      },
      'KanColle.Generated.SType': {
        fromInt: (id) => id,
        showSType: (id) => `SType ${id}`,
      },
    },
  }
}

class Query {
  constructor(records) {
    this.records = [...records]
  }

  between(lower, upper, includeLower, includeUpper) {
    this.records = this.records.filter((record) => {
      const lowerMatch = includeLower ? record.hour >= lower : record.hour > lower
      const upperMatch = includeUpper ? record.hour <= upper : record.hour < upper
      return lowerMatch && upperMatch
    })
    return this
  }

  below(value) {
    this.records = this.records.filter((record) => record.hour < value)
    return this
  }

  reverse() {
    this.records.sort((left, right) => right.hour - left.hour)
    return this
  }

  and(predicate) {
    this.records = this.records.filter(predicate)
    return this
  }

  async toArray() {
    return [...this.records]
  }

  async first() {
    return this.records[0]
  }
}

const createTable = (records) => ({ where: () => new Query(records) })

export const createLedgerWindow = () => {
  const todayStartHour = Math.floor(Date.parse('2026-08-24T15:00:00.000Z') / HOUR_MS)
  const yesterdayStartHour = todayStartHour - 24
  const hq = 'fixture-hq'
  const empty = () => Array.from({ length: 8 }, () => 0)
  const first = empty()
  first[0] = 10
  first[5] = -2
  const second = empty()
  second[0] = -4
  second[1] = 3
  const yesterday = empty()
  yesterday[2] = 5

  return {
    KC3Database: {
      loadIfNecessary: async () => {},
      con: {
        navaloverall: createTable([
          { hq, hour: yesterdayStartHour + 23, type: 'quest-reward', data: yesterday },
          { hq, hour: todayStartHour, type: 'exped-return', data: first },
          { hq, hour: todayStartHour + 1, type: 'repair-dock', data: second },
          { hq: 'another-player', hour: todayStartHour, type: 'quest', data: first },
        ]),
        resource: createTable([
          {
            hq,
            hour: todayStartHour - 1,
            rsc1: 900,
            rsc2: 1900,
            rsc3: 2900,
            rsc4: 3900,
          },
          {
            hq,
            hour: todayStartHour + 1,
            rsc1: 910,
            rsc2: 1910,
            rsc3: 2910,
            rsc4: 3910,
          },
        ]),
        useitem: createTable([
          {
            hq,
            hour: todayStartHour - 1,
            torch: 10,
            bucket: 20,
            devmat: 30,
            screw: 40,
          },
        ]),
      },
    },
    PlayerManager: {
      hq: {
        id: hq,
        lastMaterial: [1000, 2000, 3000, 4000],
        load: () => {},
      },
      consumables: { torch: 11, buckets: 21, devmats: 31, screws: 41 },
      loadConsumables: () => {},
    },
  }
}

export { FIXED_NOW, HOUR_MS }
