const createStats = (index) => ({
  hp: 30 + index,
  firepower: 40 + index * 2,
  torpedo: 60 + index * 3,
  antiAir: 45 + index,
  armor: 35 + index,
  evasion: 50 + index * 2,
  asw: 55 + index * 4,
  los: 20 + index,
  luck: 10 + index,
})

const createEquipmentStats = (typeId, index) => ({
  firepower: typeId === 1 ? 2 + (index % 2) : 0,
  torpedo: typeId === 5 ? 5 + (index % 3) : 0,
  antiAir: typeId === 12 ? 2 : 0,
  armor: 0,
  asw: 0,
  los: typeId === 12 ? 4 + (index % 2) : 0,
  bombing: 0,
  accuracy: typeId === 12 ? 2 : 1,
  evasion: 0,
})

const createEquipment = (id, masterId, typeId, index) => ({
  id,
  masterId,
  name: `Fixture gear ${id}`,
  typeId,
  iconTypeId: typeId,
  type: String(typeId),
  improvement: index % 3,
  proficiency: -1,
  locked: true,
  currentlyEquippedBy: 0,
  stats: createEquipmentStats(typeId, index),
  losImprovement: 0,
  airPowerBySlotSize: { 0: 0 },
})

const createRawSnapshot = ({ shipCount = 6 } = {}) => {
  const equipment = []
  const equipmentTypes = [
    ...Array.from({ length: 12 }, () => 1),
    ...Array.from({ length: 6 }, () => 12),
    ...Array.from({ length: 6 }, () => 5),
  ]
  equipmentTypes.forEach((typeId, index) => {
    equipment.push(createEquipment(1001 + index, 2001 + index, typeId, index))
  })
  const equipableMasterIds = equipment.map((gear) => gear.masterId)
  const ships = Array.from({ length: shipCount }, (_, index) => ({
    id: 101 + index,
    masterId: 501 + index,
    name: `Fixture destroyer ${index + 1}`,
    level: 40 + index * 5,
    shipTypeId: 2,
    shipType: 'Destroyer',
    speedValue: 10,
    stats: createStats(index),
    nakedLos: 18 + index,
    slotSizes: [0, 0, 0],
    equippedItemIds: [0, 0, 0],
    expansionSlotItemId: 0,
    expansionSlotUnlocked: false,
    expansionEquipableEquipmentIds: [],
    regularEquipableMasterIds: equipableMasterIds,
    fastPlusPatterns: [],
    nightCarrierPatterns: [],
    locked: true,
    morale: 49,
    eventTag: 0,
    fuelCost: 15 + index,
    ammoCost: 20 + index,
  }))
  return {
    generatedAt: '2026-08-24T00:00:00.000Z',
    hqLevel: 100,
    ships,
    equipment,
    currentFleetShipIds: ships.slice(0, 2).map((ship) => ship.id),
    capabilities: {
      accountShips: true,
      accountEquipment: true,
      masterData: true,
      currentFleet: true,
    },
  }
}

const createResourceRawSnapshot = () => {
  const landingCraft = Array.from({ length: 15 }, (_, index) =>
    createEquipment(3001 + index, 4001 + index, 24, index),
  )
  const drums = Array.from({ length: 5 }, (_, index) =>
    createEquipment(3101 + index, 4101 + index, 30, index),
  )
  const torpedoes = Array.from({ length: 2 }, (_, index) =>
    createEquipment(3201 + index, 4201 + index, 5, index),
  )
  const equipment = [...landingCraft, ...drums, ...torpedoes]
  const transportMasterIds = [...landingCraft, ...drums].map((gear) => gear.masterId)
  const ships = [
    {
      id: 201,
      masterId: 601,
      name: 'Fixture oiler',
      level: 80,
      shipTypeId: 22,
      shipType: 'Fleet Oiler',
      speedValue: 5,
      stats: createStats(1),
      nakedLos: 20,
      slotSizes: [0, 0, 0],
      equippedItemIds: [0, 0, 0],
      expansionSlotItemId: 0,
      expansionSlotUnlocked: false,
      expansionEquipableEquipmentIds: [],
      regularEquipableMasterIds: transportMasterIds,
      fastPlusPatterns: [],
      nightCarrierPatterns: [],
      locked: true,
      morale: 49,
      eventTag: 0,
      fuelCost: 25,
      ammoCost: 10,
    },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: 202 + index,
      masterId: 602 + index,
      name: `Fixture transport destroyer ${index + 1}`,
      level: 60 + index,
      shipTypeId: 2,
      shipType: 'Destroyer',
      speedValue: 10,
      stats: createStats(index),
      nakedLos: 18 + index,
      slotSizes: [0, 0, 0],
      equippedItemIds: [0, 0, 0],
      expansionSlotItemId: 0,
      expansionSlotUnlocked: false,
      expansionEquipableEquipmentIds: [],
      regularEquipableMasterIds: transportMasterIds,
      fastPlusPatterns: [],
      nightCarrierPatterns: [],
      locked: true,
      morale: 49,
      eventTag: 0,
      fuelCost: 15,
      ammoCost: 20,
    })),
    {
      id: 206,
      masterId: 606,
      name: 'Fixture incompatible destroyer',
      level: 175,
      shipTypeId: 2,
      shipType: 'Destroyer',
      speedValue: 10,
      stats: createStats(20),
      nakedLos: 40,
      slotSizes: [0, 0, 0],
      equippedItemIds: [0, 0, 0],
      expansionSlotItemId: 0,
      expansionSlotUnlocked: false,
      expansionEquipableEquipmentIds: [],
      regularEquipableMasterIds: [],
      fastPlusPatterns: [],
      nightCarrierPatterns: [],
      locked: true,
      morale: 49,
      eventTag: 0,
      fuelCost: 15,
      ammoCost: 20,
    },
    {
      id: 207,
      masterId: 607,
      name: 'Fixture submarine',
      level: 50,
      shipTypeId: 13,
      shipType: 'Submarine',
      speedValue: 5,
      stats: createStats(0),
      nakedLos: 10,
      slotSizes: [0, 0],
      equippedItemIds: [0, 0],
      expansionSlotItemId: 0,
      expansionSlotUnlocked: false,
      expansionEquipableEquipmentIds: [],
      regularEquipableMasterIds: torpedoes.map((gear) => gear.masterId),
      fastPlusPatterns: [],
      nightCarrierPatterns: [],
      locked: true,
      morale: 49,
      eventTag: 0,
      fuelCost: 10,
      ammoCost: 20,
    },
  ]

  return {
    generatedAt: '2026-08-25T00:00:00.000Z',
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

module.exports = { createRawSnapshot, createResourceRawSnapshot }
