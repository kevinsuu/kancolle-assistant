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
    regularEquipableMasterIds: equipableMasterIds,
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

module.exports = { createRawSnapshot }
