import { parseKC3AccountSnapshot } from '@kancolle-assistant/recommendation-core'

const KC3_ACCOUNT_SNAPSHOT_SCRIPT = `(() => {
  if (
    !window.KC3ShipManager ||
    !window.KC3GearManager ||
    !window.KC3Master ||
    !window.KC3Master.available
  ) {
    throw new Error('KC3 account managers are not ready')
  }

  window.KC3ShipManager.load()
  window.KC3GearManager.load()
  if (window.PlayerManager) {
    if (window.PlayerManager.hq && typeof window.PlayerManager.hq.load === 'function') {
      window.PlayerManager.hq.load()
    }
    if (typeof window.PlayerManager.loadFleets === 'function') {
      window.PlayerManager.loadFleets()
    }
  }

  const shipList = Object.values(window.KC3ShipManager.list || {})
  const gearList = Object.values(window.KC3GearManager.list || {})
  const fleets = window.PlayerManager && Array.isArray(window.PlayerManager.fleets)
    ? window.PlayerManager.fleets
    : []
  const hqLevel = Number(window.PlayerManager && window.PlayerManager.hq
    ? window.PlayerManager.hq.level
    : 0)

  if (!shipList.length || !gearList.length || hqLevel <= 0) {
    throw new Error('KC3 has not synchronized port data yet')
  }

  const gearMasterIds = [...new Set(gearList.map((gear) => Number(gear.masterId)))]
  const slotSizes = [...new Set(shipList.flatMap((ship) => {
    const master = window.KC3Master.ship(ship.masterId)
    const capacities = Array.isArray(ship.slotsMax)
      ? ship.slotsMax
      : (master && Array.isArray(master.api_maxeq) ? master.api_maxeq : ship.slots || [])
    return capacities.slice(0, Number(ship.slotnum) || capacities.length)
  }))].filter((size) => Number(size) >= 0)

  const holderByGearId = new Map()
  shipList.forEach((ship) => {
    ;(ship.items || []).forEach((gearId) => {
      if (Number(gearId) > 0) holderByGearId.set(Number(gearId), Number(ship.rosterId))
    })
    if (Number(ship.ex_item) > 0) {
      holderByGearId.set(Number(ship.ex_item), Number(ship.rosterId))
    }
  })

  const currentFleetShipIds = [...new Set(fleets.flatMap((fleet) =>
    Array.isArray(fleet.ships) ? fleet.ships : []
  ))].map(Number).filter((id) => id > 0)

  const ships = shipList.map((ship) => {
    const master = window.KC3Master.ship(ship.masterId)
    if (!master) throw new Error('Missing KC3 ship master: ' + ship.masterId)
    const slotnum = Number(ship.slotnum) || 0
    const capacities = Array.isArray(ship.slotsMax)
      ? ship.slotsMax
      : (Array.isArray(master.api_maxeq) ? master.api_maxeq : ship.slots || [])
    const regularEquipableMasterIds = gearMasterIds.filter((gearMasterId) => {
      const gearMaster = window.KC3Master.slotitem(gearMasterId)
      if (!gearMaster) return false
      return Boolean(window.KC3Master.equip_on_ship(
        ship.masterId,
        gearMasterId,
        gearMaster.api_type[2],
        0,
      ) & 1)
    })
    const nakedStat = (name, fallback) => {
      if (typeof ship.estimateNakedStats !== 'function') return Number(fallback) || 0
      const value = ship.estimateNakedStats(name)
      return Number.isFinite(value) ? Number(value) : (Number(fallback) || 0)
    }

    return {
      id: Number(ship.rosterId),
      masterId: Number(ship.masterId),
      name: typeof ship.name === 'function' ? String(ship.name()) : String(master.api_name || ''),
      level: Number(ship.level),
      shipTypeId: Number(master.api_stype),
      shipType: typeof ship.stype === 'function' ? String(ship.stype()) : String(master.api_stype),
      speedValue: Number(ship.speed || master.api_soku || 0),
      stats: {
        hp: nakedStat('hp', ship.hp && ship.hp[1]),
        firepower: nakedStat('fp', ship.fp && ship.fp[0]),
        torpedo: nakedStat('tp', ship.tp && ship.tp[0]),
        antiAir: nakedStat('aa', ship.aa && ship.aa[0]),
        armor: nakedStat('ar', ship.ar && ship.ar[0]),
        evasion: nakedStat('ev', ship.ev && ship.ev[0]),
        asw: nakedStat('as', ship.as && ship.as[0]),
        los: nakedStat('ls', ship.ls && ship.ls[0]),
        luck: nakedStat('lk', ship.lk && ship.lk[0]),
      },
      nakedLos: typeof ship.nakedLoS === 'function'
        ? Math.max(0, Number(ship.nakedLoS()))
        : Math.max(0, nakedStat('ls', ship.ls && ship.ls[0])),
      slotSizes: capacities.slice(0, slotnum).map(Number),
      equippedItemIds: (ship.items || []).slice(0, slotnum).map(Number),
      expansionSlotItemId: Number(ship.ex_item || 0),
      expansionSlotUnlocked: Number(ship.ex_item) !== 0,
      regularEquipableMasterIds,
      locked: Boolean(ship.lock),
      morale: Number(ship.morale || ship.cond || 0),
      eventTag: Number(ship.sally || 0),
      fuelCost: Number(master.api_fuel_max || 0),
      ammoCost: Number(master.api_bull_max || 0),
    }
  })

  const equipment = gearList.map((gear) => {
    const master = window.KC3Master.slotitem(gear.masterId)
    if (!master) throw new Error('Missing KC3 equipment master: ' + gear.masterId)
    const airPowerBySlotSize = Object.fromEntries(slotSizes.map((slotSize) => [
      String(slotSize),
      typeof gear.fighterVeteran === 'function' ? Number(gear.fighterVeteran(slotSize)) : 0,
    ]))
    return {
      id: Number(gear.itemId),
      masterId: Number(gear.masterId),
      name: typeof gear.name === 'function' ? String(gear.name()) : String(master.api_name || ''),
      typeId: Number(master.api_type && master.api_type[2] || 0),
      iconTypeId: Number(master.api_type && master.api_type[3] || 0),
      type: String(master.api_type && master.api_type[2] || ''),
      improvement: Number(gear.stars || 0),
      proficiency: Number(gear.ace ?? -1),
      locked: Boolean(gear.lock),
      currentlyEquippedBy: holderByGearId.get(Number(gear.itemId)) || 0,
      stats: {
        firepower: Number(master.api_houg || 0),
        torpedo: Number(master.api_raig || 0),
        antiAir: Number(master.api_tyku || 0),
        armor: Number(master.api_souk || 0),
        asw: Number(master.api_tais || 0),
        los: Number(master.api_saku || 0),
        bombing: Number(master.api_baku || 0),
        accuracy: Number(master.api_houm || 0),
        evasion: Number(master.api_houk || 0),
      },
      losImprovement: typeof gear.losStatImprovementBonus === 'function'
        ? Number(gear.losStatImprovementBonus())
        : 0,
      airPowerBySlotSize,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    hqLevel,
    ships,
    equipment,
    currentFleetShipIds,
    capabilities: {
      accountShips: true,
      accountEquipment: true,
      masterData: Boolean(window.KC3Master.available),
      currentFleet: Boolean(window.PlayerManager && Array.isArray(window.PlayerManager.fleets)),
    },
  }
})()`

export const readKC3AccountSnapshot = async (webContents) => {
  const rawSnapshot = await webContents.executeJavaScript(KC3_ACCOUNT_SNAPSHOT_SCRIPT, true)
  return parseKC3AccountSnapshot(rawSnapshot)
}
