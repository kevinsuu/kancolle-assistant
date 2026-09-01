import type {
  AccountSnapshot,
  EquipmentInstanceId,
  EquipmentMasterId,
  EquipmentStats,
  OwnedEquipment,
  OwnedShip,
  ShipInstanceId,
  ShipMasterId,
  ShipSpeed,
  ShipStats,
} from './types'

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown, path: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} 必須是物件`)
  }
  return value as UnknownRecord
}

const asArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} 必須是陣列`)
  return value
}

const asNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} 必須是有限數字`)
  }
  return value
}

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') throw new Error(`${path} 必須是字串`)
  return value
}

const optionalString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

const asBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${path} 必須是布林值`)
  return value
}

const optionalNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const numberArray = (value: unknown, path: string): readonly number[] =>
  asArray(value, path).map((item, index) => asNumber(item, `${path}[${index}]`))

const speedFromValue = (value: number): ShipSpeed => {
  if (value >= 20) return 'fastest'
  if (value >= 15) return 'fast+'
  if (value >= 10) return 'fast'
  return 'slow'
}

const parseStats = (value: unknown, path: string): ShipStats => {
  const record = asRecord(value, path)
  return {
    hp: asNumber(record.hp, `${path}.hp`),
    firepower: asNumber(record.firepower, `${path}.firepower`),
    torpedo: asNumber(record.torpedo, `${path}.torpedo`),
    antiAir: asNumber(record.antiAir, `${path}.antiAir`),
    armor: asNumber(record.armor, `${path}.armor`),
    evasion: asNumber(record.evasion, `${path}.evasion`),
    asw: asNumber(record.asw, `${path}.asw`),
    los: asNumber(record.los, `${path}.los`),
    luck: asNumber(record.luck, `${path}.luck`),
  }
}

const parseEquipmentStats = (value: unknown, path: string): EquipmentStats => {
  const record = asRecord(value, path)
  return {
    firepower: optionalNumber(record.firepower),
    torpedo: optionalNumber(record.torpedo),
    antiAir: optionalNumber(record.antiAir),
    armor: optionalNumber(record.armor),
    asw: optionalNumber(record.asw),
    los: optionalNumber(record.los),
    bombing: optionalNumber(record.bombing),
    accuracy: optionalNumber(record.accuracy),
    evasion: optionalNumber(record.evasion),
  }
}

const parseOwnedShip = (value: unknown, index: number): OwnedShip => {
  const path = `ships[${index}]`
  const record = asRecord(value, path)
  const name = asString(record.name, `${path}.name`)
  const speedValue = asNumber(record.speedValue, `${path}.speedValue`)
  const equippedItemIds = numberArray(record.equippedItemIds, `${path}.equippedItemIds`).map(
    (id) => (id > 0 ? (id as EquipmentInstanceId) : null),
  )
  const expansionSlotItemId = optionalNumber(record.expansionSlotItemId, 0)
  const fastPlusPatterns = asArray(record.fastPlusPatterns, `${path}.fastPlusPatterns`).map(
    (value, patternIndex) => {
      const patternPath = `${path}.fastPlusPatterns[${patternIndex}]`
      const pattern = asRecord(value, patternPath)
      return {
        turbineCount: asNumber(pattern.turbineCount, `${patternPath}.turbineCount`),
        enhancedBoilerCount: asNumber(
          pattern.enhancedBoilerCount,
          `${patternPath}.enhancedBoilerCount`,
        ),
        newModelBoilerBelow7Count: asNumber(
          pattern.newModelBoilerBelow7Count,
          `${patternPath}.newModelBoilerBelow7Count`,
        ),
        newModelBoilerAtLeast7Count: asNumber(
          pattern.newModelBoilerAtLeast7Count,
          `${patternPath}.newModelBoilerAtLeast7Count`,
        ),
      }
    },
  )
  const openingAswRules = (Array.isArray(record.openingAswRules) ? record.openingAswRules : []).map(
    (value, ruleIndex) => {
      const rulePath = `${path}.openingAswRules[${ruleIndex}]`
      const rule = asRecord(value, rulePath)
      const kind = asString(rule.kind, `${rulePath}.kind`)
      if (!['none', 'sonar'].includes(kind)) throw new Error(`${rulePath}.kind 無法辨識`)
      return {
        kind: kind as 'none' | 'sonar',
        minimumAsw: asNumber(rule.minimumAsw, `${rulePath}.minimumAsw`),
      }
    },
  )
  const nightCarrierPatterns = asArray(
    record.nightCarrierPatterns,
    `${path}.nightCarrierPatterns`,
  ).map((value, patternIndex) => {
    const patternPath = `${path}.nightCarrierPatterns[${patternIndex}]`
    const pattern = asRecord(value, patternPath)
    return {
      nightAircraftCount: asNumber(pattern.nightAircraftCount, `${patternPath}.nightAircraftCount`),
      nightOperationsPersonnelCount: asNumber(
        pattern.nightOperationsPersonnelCount,
        `${patternPath}.nightOperationsPersonnelCount`,
      ),
      swordfishCount: asNumber(pattern.swordfishCount, `${patternPath}.swordfishCount`),
    }
  })

  return {
    id: asNumber(record.id, `${path}.id`) as ShipInstanceId,
    masterId: asNumber(record.masterId, `${path}.masterId`) as ShipMasterId,
    name,
    canonicalName: optionalString(record.canonicalName, name),
    level: asNumber(record.level, `${path}.level`),
    shipTypeId: asNumber(record.shipTypeId, `${path}.shipTypeId`),
    shipType: asString(record.shipType, `${path}.shipType`),
    speed: speedFromValue(speedValue),
    speedValue,
    stats: parseStats(record.stats, `${path}.stats`),
    nakedLos: asNumber(record.nakedLos, `${path}.nakedLos`),
    currentEquipmentLosBonus: optionalNumber(record.currentEquipmentLosBonus),
    slotSizes: numberArray(record.slotSizes, `${path}.slotSizes`),
    equippedItemIds,
    expansionSlotItemId:
      expansionSlotItemId > 0 ? (expansionSlotItemId as EquipmentInstanceId) : null,
    expansionSlotUnlocked: asBoolean(record.expansionSlotUnlocked, `${path}.expansionSlotUnlocked`),
    expansionEquipableEquipmentIds: numberArray(
      record.expansionEquipableEquipmentIds,
      `${path}.expansionEquipableEquipmentIds`,
    ).map((id) => id as EquipmentInstanceId),
    regularEquipableMasterIds: numberArray(
      record.regularEquipableMasterIds,
      `${path}.regularEquipableMasterIds`,
    ).map((id) => id as EquipmentMasterId),
    openingAswRules,
    fastPlusPatterns,
    nightCarrierPatterns,
    locked: asBoolean(record.locked, `${path}.locked`),
    morale: optionalNumber(record.morale),
    eventTag: optionalNumber(record.eventTag) || null,
    fuelCost: optionalNumber(record.fuelCost),
    ammoCost: optionalNumber(record.ammoCost),
  }
}

const parseOwnedEquipment = (value: unknown, index: number): OwnedEquipment => {
  const path = `equipment[${index}]`
  const record = asRecord(value, path)
  const holder = optionalNumber(record.currentlyEquippedBy, 0)
  const airPowerRecord = asRecord(record.airPowerBySlotSize, `${path}.airPowerBySlotSize`)
  const airPowerBySlotSize = Object.fromEntries(
    Object.entries(airPowerRecord).map(([slotSize, power]) => [
      slotSize,
      asNumber(power, `${path}.airPowerBySlotSize.${slotSize}`),
    ]),
  )

  return {
    id: asNumber(record.id, `${path}.id`) as EquipmentInstanceId,
    masterId: asNumber(record.masterId, `${path}.masterId`) as EquipmentMasterId,
    name: asString(record.name, `${path}.name`),
    typeId: asNumber(record.typeId, `${path}.typeId`),
    iconTypeId: asNumber(record.iconTypeId, `${path}.iconTypeId`),
    type: asString(record.type, `${path}.type`),
    improvement: optionalNumber(record.improvement),
    proficiency: optionalNumber(record.proficiency, -1),
    locked: asBoolean(record.locked, `${path}.locked`),
    currentlyEquippedBy: holder > 0 ? (holder as ShipInstanceId) : null,
    antiInstallationAircraft:
      typeof record.antiInstallationAircraft === 'boolean'
        ? record.antiInstallationAircraft
        : asNumber(record.typeId, `${path}.typeId`) === 8,
    stats: parseEquipmentStats(record.stats, `${path}.stats`),
    losImprovement: optionalNumber(record.losImprovement),
    airPowerBySlotSize,
  }
}

export const parseKC3AccountSnapshot = (value: unknown): AccountSnapshot => {
  const record = asRecord(value, 'snapshot')
  const capabilities = asRecord(record.capabilities, 'snapshot.capabilities')
  const ships = asArray(record.ships, 'snapshot.ships').map(parseOwnedShip)
  const equipment = asArray(record.equipment, 'snapshot.equipment').map(parseOwnedEquipment)

  if (ships.length === 0) throw new Error('KC3 尚未同步艦娘資料')
  if (equipment.length === 0) throw new Error('KC3 尚未同步裝備資料')

  const shipIds = new Set<number>()
  ships.forEach((ship) => {
    if (shipIds.has(ship.id)) throw new Error(`艦娘 instance ID 重複：${ship.id}`)
    shipIds.add(ship.id)
  })

  const equipmentIds = new Set<number>()
  equipment.forEach((gear) => {
    if (equipmentIds.has(gear.id)) throw new Error(`裝備 instance ID 重複：${gear.id}`)
    equipmentIds.add(gear.id)
  })

  const currentFleetShipIds = numberArray(
    record.currentFleetShipIds,
    'snapshot.currentFleetShipIds',
  ).map((id) => id as ShipInstanceId)
  const currentFleetShipIdGroups =
    record.currentFleetShipIdGroups === undefined
      ? currentFleetShipIds.length > 0 && currentFleetShipIds.length <= 6
        ? [currentFleetShipIds]
        : []
      : asArray(record.currentFleetShipIdGroups, 'snapshot.currentFleetShipIdGroups')
          .map((group, index) =>
            numberArray(group, `snapshot.currentFleetShipIdGroups[${index}]`).map(
              (id) => id as ShipInstanceId,
            ),
          )
          .filter((group) => group.length > 0)

  return {
    generatedAt: asString(record.generatedAt, 'snapshot.generatedAt'),
    hqLevel: asNumber(record.hqLevel, 'snapshot.hqLevel'),
    ships,
    equipment,
    currentFleetShipIds,
    currentFleetShipIdGroups,
    metadata: {
      source: 'kc3',
      schemaVersion: 1,
      capabilities: {
        accountShips: asBoolean(capabilities.accountShips, 'capabilities.accountShips'),
        accountEquipment: asBoolean(capabilities.accountEquipment, 'capabilities.accountEquipment'),
        masterData: asBoolean(capabilities.masterData, 'capabilities.masterData'),
        currentFleet: asBoolean(capabilities.currentFleet, 'capabilities.currentFleet'),
      },
    },
  }
}
