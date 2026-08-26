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

  const regularEquipableMasterIdsCache = new Map()
  const regularEquipableMasterIdsForShip = (shipMasterId) => {
    const cacheKey = Number(shipMasterId)
    if (regularEquipableMasterIdsCache.has(cacheKey)) {
      return regularEquipableMasterIdsCache.get(cacheKey)
    }
    const masterIds = gearMasterIds.filter((gearMasterId) => {
      const gearMaster = window.KC3Master.slotitem(gearMasterId)
      if (!gearMaster) return false
      return Boolean(window.KC3Master.equip_on_ship(
        shipMasterId,
        gearMasterId,
        gearMaster.api_type[2],
        0,
      ) & 1)
    })
    regularEquipableMasterIdsCache.set(cacheKey, masterIds)
    return masterIds
  }

  const gearEquipabilityKey = (gear) => String(gear.masterId) + ':' + String(Number(gear.stars || 0))
  const uniqueGearEquipability = [...new Map(gearList.map((gear) => [
    gearEquipabilityKey(gear),
    gear,
  ])).values()]
  const expansionEquipabilityCache = new Map()
  const expansionEquipableEquipmentIdsForShip = (shipMasterId) => {
    const cacheKey = Number(shipMasterId)
    let compatibleKeys = expansionEquipabilityCache.get(cacheKey)
    if (!compatibleKeys) {
      compatibleKeys = new Set(uniqueGearEquipability.filter((gear) => {
        const gearMaster = window.KC3Master.slotitem(gear.masterId)
        if (!gearMaster) return false
        return Boolean(window.KC3Master.equip_on_ship(
          shipMasterId,
          gear.masterId,
          gearMaster.api_type[2],
          Number(gear.stars || 0),
        ) & 2)
      }).map(gearEquipabilityKey))
      expansionEquipabilityCache.set(cacheKey, compatibleKeys)
    }
    return gearList
      .filter((gear) => compatibleKeys.has(gearEquipabilityKey(gear)))
      .map((gear) => Number(gear.itemId))
  }

  const fastPlusPatternCache = new Map()
  const fastPlusPatternsForShip = (ship, master, slotnum, expansionSlotUnlocked) => {
    const maxGearCount = slotnum + (expansionSlotUnlocked ? 1 : 0)
    const cacheKey = String(master.api_id) + ':' + String(maxGearCount)
    if (fastPlusPatternCache.has(cacheKey)) return fastPlusPatternCache.get(cacheKey)
    const noSpeedGear = {
      turbineCount: 0,
      enhancedBoilerCount: 0,
      newModelBoilerBelow7Count: 0,
      newModelBoilerAtLeast7Count: 0,
    }
    if (Number(master.api_soku || 0) >= 15) {
      const patterns = [noSpeedGear]
      fastPlusPatternCache.set(cacheKey, patterns)
      return patterns
    }
    const calculateSpeed = (turbineCount, enhancedCount, newBelow7Count, newAtLeast7Count) => {
      const probeGears = []
      let probeId = 900000000
      const addProbeGears = (masterId, stars, count) => {
        for (let index = 0; index < count; index += 1) {
          probeGears.push(new window.KC3Gear({
            itemId: probeId,
            masterId,
            stars,
            lock: 0,
            ace: -1,
          }))
          probeId += 1
        }
      }
      addProbeGears(33, 0, turbineCount)
      addProbeGears(34, 0, enhancedCount)
      addProbeGears(87, 0, newBelow7Count)
      addProbeGears(87, 7, newAtLeast7Count)

      const gearById = new Map(probeGears.map((gear) => [gear.itemId, gear]))
      const emptyGear = new window.KC3Gear()
      const probeShip = new window.KC3Ship(ship, true)
      probeShip.GearManager = {
        get: (itemId) => gearById.get(Number(itemId)) || emptyGear,
      }
      const regularIds = probeGears.slice(0, slotnum).map((gear) => gear.itemId)
      while (regularIds.length < Math.max(slotnum, 4)) regularIds.push(-1)
      probeShip.items = regularIds
      probeShip.ex_item = probeGears[slotnum] ? probeGears[slotnum].itemId : 0
      const speedBonus = Number(probeShip.statsBonusOnShip('sp') || 0)
      return Math.min(20, Number(master.api_soku || 0) + speedBonus)
    }

    const pattern = (
      turbineCount,
      enhancedBoilerCount,
      newModelBoilerBelow7Count,
      newModelBoilerAtLeast7Count,
    ) => ({
      turbineCount,
      enhancedBoilerCount,
      newModelBoilerBelow7Count,
      newModelBoilerAtLeast7Count,
    })
    const candidatePatterns = [
      noSpeedGear,
      pattern(0, 0, 0, 1),
      pattern(1, 1, 0, 0),
      pattern(1, 0, 1, 0),
      pattern(1, 0, 0, 1),
      pattern(1, 0, 2, 0),
      pattern(1, 0, 1, 1),
      pattern(1, 0, 0, 2),
      pattern(1, 1, 1, 0),
      pattern(1, 1, 0, 1),
      pattern(1, 2, 1, 0),
      pattern(1, 2, 0, 1),
      pattern(1, 3, 0, 0),
    ]
    const candidates = candidatePatterns.filter((candidate) => {
      const total = candidate.turbineCount + candidate.enhancedBoilerCount +
        candidate.newModelBoilerBelow7Count + candidate.newModelBoilerAtLeast7Count
      return total <= maxGearCount && calculateSpeed(
        candidate.turbineCount,
        candidate.enhancedBoilerCount,
        candidate.newModelBoilerBelow7Count,
        candidate.newModelBoilerAtLeast7Count,
      ) >= 15
    })
    const patterns = candidates.filter((candidate) => !candidates.some((other) =>
      other !== candidate &&
      other.turbineCount <= candidate.turbineCount &&
      other.enhancedBoilerCount <= candidate.enhancedBoilerCount &&
      other.newModelBoilerBelow7Count <= candidate.newModelBoilerBelow7Count &&
      other.newModelBoilerAtLeast7Count <= candidate.newModelBoilerAtLeast7Count &&
      (
        other.turbineCount < candidate.turbineCount ||
        other.enhancedBoilerCount < candidate.enhancedBoilerCount ||
        other.newModelBoilerBelow7Count < candidate.newModelBoilerBelow7Count ||
        other.newModelBoilerAtLeast7Count < candidate.newModelBoilerAtLeast7Count
      )
    ))
    fastPlusPatternCache.set(cacheKey, patterns)
    return patterns
  }

  const nightAircraftIconTypeIds = new Set([45, 46, 58])
  const nightOperationsPersonnelMasterIds = new Set([258, 259])
  const swordfishMasterIds = new Set([242, 243, 244])
  const representativeNightAircraft = gearList.find((gear) => {
    const gearMaster = window.KC3Master.slotitem(gear.masterId)
    return gearMaster && nightAircraftIconTypeIds.has(Number(gearMaster.api_type[3]))
  })
  const representativeNightOperationsPersonnel = gearList.find((gear) =>
    nightOperationsPersonnelMasterIds.has(Number(gear.masterId)))
  const representativeSwordfish = gearList.find((gear) =>
    swordfishMasterIds.has(Number(gear.masterId)))
  const nightCarrierPatternCache = new Map()
  const nightCarrierPatternsForShip = (ship, master, slotnum, capacities, expansionSlotUnlocked) => {
    if (![7, 11, 18].includes(Number(master.api_stype))) return []
    const cacheKey = [
      master.api_id,
      slotnum,
      capacities.slice(0, slotnum).join(','),
      Number(expansionSlotUnlocked),
    ].join(':')
    if (nightCarrierPatternCache.has(cacheKey)) return nightCarrierPatternCache.get(cacheKey)
    const pattern = (nightAircraftCount, nightOperationsPersonnelCount, swordfishCount) => ({
      nightAircraftCount,
      nightOperationsPersonnelCount,
      swordfishCount,
    })
    const candidatePatterns = [pattern(0, 0, 0)]
    if (representativeNightAircraft) candidatePatterns.push(pattern(1, 0, 0))
    if (representativeSwordfish) candidatePatterns.push(pattern(0, 0, 1))
    if (representativeNightAircraft && representativeNightOperationsPersonnel) {
      candidatePatterns.push(pattern(1, 1, 0))
    }
    const reachesNightBattle = (candidate) => {
      const probeGears = [
        ...Array.from({ length: candidate.nightAircraftCount }, () => representativeNightAircraft),
        ...Array.from(
          { length: candidate.nightOperationsPersonnelCount },
          () => representativeNightOperationsPersonnel,
        ),
        ...Array.from({ length: candidate.swordfishCount }, () => representativeSwordfish),
      ].filter(Boolean)
      const positiveSlotIndexes = capacities.slice(0, slotnum)
        .map((size, index) => ({ size: Number(size), index }))
        .filter(({ size }) => size > 0)
        .map(({ index }) => index)
      const regularIds = Array.from({ length: Math.max(slotnum, 5) }, () => -1)
      const usedSlotIndexes = new Set()
      let expansionItemId = expansionSlotUnlocked ? -1 : 0
      for (const gear of probeGears) {
        const gearMaster = window.KC3Master.slotitem(gear.masterId)
        const isAircraft = gearMaster && (
          nightAircraftIconTypeIds.has(Number(gearMaster.api_type[3])) ||
          swordfishMasterIds.has(Number(gear.masterId))
        )
        const availableRegularIndexes = (isAircraft ? positiveSlotIndexes : regularIds.map((_, i) => i))
          .filter((index) => index < slotnum && !usedSlotIndexes.has(index))
        if (availableRegularIndexes.length > 0) {
          const slotIndex = availableRegularIndexes[0]
          regularIds[slotIndex] = Number(gear.itemId)
          usedSlotIndexes.add(slotIndex)
        } else if (!isAircraft && expansionSlotUnlocked && expansionItemId < 0) {
          expansionItemId = Number(gear.itemId)
        } else {
          return false
        }
      }
      const gearById = new Map(probeGears.map((gear) => [Number(gear.itemId), gear]))
      const emptyGear = new window.KC3Gear()
      const probeShip = new window.KC3Ship(ship, true)
      const maximumHp = Math.max(Number((probeShip.hp || [0, 1])[1]) || 1, 1)
      probeShip.hp = [maximumHp, maximumHp]
      probeShip.afterHp = [maximumHp, maximumHp]
      probeShip.items = regularIds
      probeShip.ex_item = expansionItemId
      probeShip.GearManager = {
        get: (itemId) => gearById.get(Number(itemId)) || emptyGear,
      }
      return Boolean(probeShip.canDoNightAttack())
    }
    const candidates = candidatePatterns.filter(reachesNightBattle)
    const patterns = candidates.filter((candidate) => !candidates.some((other) =>
      other !== candidate &&
      other.nightAircraftCount <= candidate.nightAircraftCount &&
      other.nightOperationsPersonnelCount <= candidate.nightOperationsPersonnelCount &&
      other.swordfishCount <= candidate.swordfishCount &&
      (
        other.nightAircraftCount < candidate.nightAircraftCount ||
        other.nightOperationsPersonnelCount < candidate.nightOperationsPersonnelCount ||
        other.swordfishCount < candidate.swordfishCount
      )
    ))
    nightCarrierPatternCache.set(cacheKey, patterns)
    return patterns
  }

  const ships = shipList.map((ship) => {
    const master = window.KC3Master.ship(ship.masterId)
    if (!master) throw new Error('Missing KC3 ship master: ' + ship.masterId)
    const slotnum = Number(ship.slotnum) || 0
    const capacities = Array.isArray(ship.slotsMax)
      ? ship.slotsMax
      : (Array.isArray(master.api_maxeq) ? master.api_maxeq : ship.slots || [])
    const regularEquipableMasterIds = regularEquipableMasterIdsForShip(ship.masterId)
    const expansionSlotUnlocked = Number(ship.ex_item) !== 0
    const expansionEquipableEquipmentIds = expansionSlotUnlocked
      ? expansionEquipableEquipmentIdsForShip(ship.masterId)
      : []
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
      speedValue: Number(master.api_soku || 0),
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
      expansionSlotUnlocked,
      expansionEquipableEquipmentIds,
      regularEquipableMasterIds,
      fastPlusPatterns: fastPlusPatternsForShip(ship, master, slotnum, expansionSlotUnlocked),
      nightCarrierPatterns: nightCarrierPatternsForShip(
        ship,
        master,
        slotnum,
        capacities,
        expansionSlotUnlocked,
      ),
      locked: Boolean(ship.lock),
      morale: Number(ship.morale || ship.cond || 0),
      eventTag: Number(ship.sally || 0),
      fuelCost: Number(master.api_fuel_max || 0),
      ammoCost: Number(master.api_bull_max || 0),
    }
  })

  const airPowerByGearConfiguration = new Map()
  const equipment = gearList.map((gear) => {
    const master = window.KC3Master.slotitem(gear.masterId)
    if (!master) throw new Error('Missing KC3 equipment master: ' + gear.masterId)
    const airPowerCacheKey = [gear.masterId, Number(gear.stars || 0), Number(gear.ace ?? -1)].join(':')
    let airPowerBySlotSize = airPowerByGearConfiguration.get(airPowerCacheKey)
    if (!airPowerBySlotSize) {
      airPowerBySlotSize = Object.fromEntries(slotSizes.map((slotSize) => [
        String(slotSize),
        typeof gear.fighterVeteran === 'function' ? Number(gear.fighterVeteran(slotSize)) : 0,
      ]))
      airPowerByGearConfiguration.set(airPowerCacheKey, airPowerBySlotSize)
    }
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
