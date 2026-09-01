import { parseKC3AccountSnapshot } from '@kancolle-assistant/recommendation-core'

const KC3_ACCOUNT_SNAPSHOT_SCRIPT = `(async () => {
  if (
    !window.KC3ShipManager ||
    !window.KC3GearManager ||
    !window.KC3Master ||
    !window.KC3Master.available
  ) {
    throw new Error('KC3 account managers are not ready')
  }

  const yieldToRenderer = () => new Promise((resolve) => window.setTimeout(resolve, 0))
  const snapshotStartedAt = window.performance.now()
  const openingAswProbeDiagnostics = {
    attemptedShipCount: 0,
    failedShipIds: new Set(),
    failureMessages: [],
    noEquipmentRuleCount: 0,
    sonarRuleCount: 0,
  }
  const recordOpeningAswProbeFailure = (ship, error) => {
    const shipId = Number(ship?.rosterId || 0)
    if (openingAswProbeDiagnostics.failedShipIds.has(shipId)) return
    openingAswProbeDiagnostics.failedShipIds.add(shipId)
    if (openingAswProbeDiagnostics.failureMessages.length >= 3) return
    const message = error instanceof Error ? error.message : String(error)
    openingAswProbeDiagnostics.failureMessages.push(message.replace(/\\s+/g, ' ').slice(0, 160))
  }
  window.KC3ShipManager.load()
  await yieldToRenderer()
  window.KC3GearManager.load()
  await yieldToRenderer()
  if (window.PlayerManager) {
    if (window.PlayerManager.hq && typeof window.PlayerManager.hq.load === 'function') {
      window.PlayerManager.hq.load()
    }
    if (typeof window.PlayerManager.loadFleets === 'function') {
      window.PlayerManager.loadFleets()
    }
  }
  await yieldToRenderer()

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

  const RENDERER_SLICE_MS = 8
  const mapResponsively = async (items, mapItem) => {
    const results = []
    let sliceStartedAt = window.performance.now()
    for (let index = 0; index < items.length; index += 1) {
      results.push(mapItem(items[index], index))
      if (
        index < items.length - 1 &&
        window.performance.now() - sliceStartedAt >= RENDERER_SLICE_MS
      ) {
        await yieldToRenderer()
        sliceStartedAt = window.performance.now()
      }
    }
    return results
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

  const currentFleetShipIdGroups = fleets
    .map((fleet) => (Array.isArray(fleet.ships) ? fleet.ships : []))
    .map((shipIds) => shipIds.map(Number).filter((id) => id > 0))
    .filter((shipIds) => shipIds.length > 0)
  const currentFleetShipIds = [...new Set(currentFleetShipIdGroups.flat())]

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

  const isSonarMaster = (master) => [14, 40].includes(Number(master?.api_type?.[2] || 0))
  const openingAswRulesForShip = (ship, slotnum, capacities, regularEquipableMasterIds) => {
    openingAswProbeDiagnostics.attemptedShipCount += 1
    if (typeof window.KC3Ship !== 'function' || typeof window.KC3Gear !== 'function') {
      recordOpeningAswProbeFailure(ship, new Error('KC3 OASW calculators are not ready'))
      return []
    }
    const emptyGear = new window.KC3Gear()
    const compatibleSonar = gearList.find((gear) => {
      if (!regularEquipableMasterIds.includes(Number(gear.masterId))) return false
      return isSonarMaster(window.KC3Master.slotitem(gear.masterId))
    })
    let probeFailed = false
    const canDoOpeningAsw = (probeGears, visibleAsw) => {
      if (probeFailed) return false
      try {
        const gearById = new Map(probeGears.map((gear) => [Number(gear.itemId), gear]))
        const probeShip = new window.KC3Ship(ship, true)
        const regularIds = probeGears.slice(0, slotnum).map((gear) => Number(gear.itemId))
        while (regularIds.length < Math.max(slotnum, 5)) regularIds.push(-1)
        probeShip.items = regularIds
        probeShip.ex_item = 0
        probeShip.slots = capacities.slice(0, slotnum).map(Number)
        probeShip.slotsMax = capacities.slice(0, slotnum).map(Number)
        probeShip.GearManager = {
          get: (itemId) => gearById.get(Number(itemId)) || emptyGear,
        }
        probeShip.as = [
          Number(visibleAsw),
          Math.max(Number(visibleAsw), Number((ship.as || [0, 0])[1]) || 0),
        ]
        probeShip.statsCache = {}
        return Boolean(probeShip.canDoOASW())
      } catch (error) {
        probeFailed = true
        recordOpeningAswProbeFailure(ship, error)
        return false
      }
    }
    const minimumVisibleAsw = (probeGears) => {
      if (!canDoOpeningAsw(probeGears, 220)) return null
      let lower = 0
      let upper = 220
      while (lower < upper) {
        const midpoint = Math.floor((lower + upper) / 2)
        if (canDoOpeningAsw(probeGears, midpoint)) upper = midpoint
        else lower = midpoint + 1
      }
      return lower
    }
    const rules = []
    const noneMinimum = minimumVisibleAsw([])
    if (noneMinimum !== null) {
      rules.push({ kind: 'none', minimumAsw: noneMinimum })
      openingAswProbeDiagnostics.noEquipmentRuleCount += 1
    }
    if (slotnum > 0 && compatibleSonar) {
      const sonarMinimum = minimumVisibleAsw([compatibleSonar])
      if (sonarMinimum !== null) {
        rules.push({ kind: 'sonar', minimumAsw: sonarMinimum })
        openingAswProbeDiagnostics.sonarRuleCount += 1
      }
    }
    return rules
  }

  const ships = await mapResponsively(shipList, (ship) => {
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
      currentEquipmentLosBonus: typeof ship.equipmentTotalStats === 'function'
        ? Number(ship.equipmentTotalStats('saku', true, true, true)) || 0
        : 0,
      slotSizes: capacities.slice(0, slotnum).map(Number),
      equippedItemIds: (ship.items || []).slice(0, slotnum).map(Number),
      expansionSlotItemId: Number(ship.ex_item || 0),
      expansionSlotUnlocked,
      expansionEquipableEquipmentIds,
      regularEquipableMasterIds,
      openingAswRules: openingAswRulesForShip(
        ship,
        slotnum,
        capacities,
        regularEquipableMasterIds,
      ),
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
  const equipment = await mapResponsively(gearList, (gear) => {
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
      antiInstallationAircraft:
        Number(master.api_type && master.api_type[2]) === 8 ||
        (Number(master.api_type && master.api_type[2]) === 7 &&
          Array.isArray(window.KC3GearManager?.antiLandDiveBomberIds) &&
          window.KC3GearManager.antiLandDiveBomberIds.includes(Number(gear.masterId))),
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
    currentFleetShipIdGroups,
    capabilities: {
      accountShips: true,
      accountEquipment: true,
      masterData: Boolean(window.KC3Master.available),
      currentFleet: Boolean(window.PlayerManager && Array.isArray(window.PlayerManager.fleets)),
    },
    diagnostics: {
      openingAswProbe: {
        attemptedShipCount: openingAswProbeDiagnostics.attemptedShipCount,
        failedShipCount: openingAswProbeDiagnostics.failedShipIds.size,
        noEquipmentRuleCount: openingAswProbeDiagnostics.noEquipmentRuleCount,
        sonarRuleCount: openingAswProbeDiagnostics.sonarRuleCount,
        failureMessages: openingAswProbeDiagnostics.failureMessages,
        elapsedMs: Math.round(window.performance.now() - snapshotStartedAt),
      },
    },
  }
})()`

export const readKC3AccountSnapshot = async (webContents, logger = () => {}) => {
  const rawSnapshot = await webContents.executeJavaScript(KC3_ACCOUNT_SNAPSHOT_SCRIPT, true)
  const diagnostics = rawSnapshot?.diagnostics?.openingAswProbe
  if (diagnostics) {
    logger('recommendation.oasw-snapshot-probe-completed', {
      operation: 'derive-opening-asw-candidate-rules',
      attemptedShipCount: Number(diagnostics.attemptedShipCount || 0),
      failedShipCount: Number(diagnostics.failedShipCount || 0),
      noEquipmentRuleCount: Number(diagnostics.noEquipmentRuleCount || 0),
      sonarRuleCount: Number(diagnostics.sonarRuleCount || 0),
      fallbackResult:
        Number(diagnostics.failedShipCount || 0) > 0 ? 'generic-core-threshold' : 'not-needed',
      reasonCodes: Number(diagnostics.failedShipCount || 0) > 0 ? ['KC3_OASW_PROBE_FAILED'] : [],
      messages: Array.isArray(diagnostics.failureMessages)
        ? diagnostics.failureMessages.slice(0, 3).map(String)
        : [],
      elapsedMs: Number(diagnostics.elapsedMs || 0),
    })
  }
  return parseKC3AccountSnapshot(rawSnapshot)
}

const combatEvaluationMode = (recommendation) => {
  if (recommendation.route.tags.includes('anti-installation')) return 'anti-installation'
  if (
    recommendation.route.tags.includes('asw-loadout') ||
    recommendation.route.calculatedConstraints?.some(
      (constraint) => constraint.kind === 'opening-asw',
    )
  ) {
    return 'anti-submarine'
  }
  return 'surface'
}

const antiInstallationTargetIds = (recommendation) => {
  if (!recommendation.route.tags.includes('anti-installation')) return []
  if (recommendation.mapId === '6-4') return [1665, 1668, 1656]
  if (recommendation.mapId === '7-5') return [1573, 1665, 1668, 1656, 1699]
  return [1573]
}

const gearEvaluationKey = (gear) =>
  gear ? `${gear.masterId}:${gear.improvement}:${gear.proficiency}` : '0'

const combatEvaluationPayload = (recommendations, snapshotKey) => {
  const uniqueBuilds = []
  const buildIndexes = new Map()
  const payloadRecommendations = recommendations.map((recommendation) => {
    const mode = combatEvaluationMode(recommendation)
    const targetIds = antiInstallationTargetIds(recommendation)
    return {
      id: recommendation.id,
      buildIndexes: recommendation.ships.map((build) => {
        const cacheKey = [
          build.ship.id,
          build.ship.level,
          build.ship.stats.hp,
          build.ship.stats.firepower,
          build.ship.stats.torpedo,
          build.ship.stats.armor,
          build.ship.stats.evasion,
          build.ship.stats.asw,
          build.ship.slotSizes.join(','),
          build.equipment.map(gearEvaluationKey).join(','),
          gearEvaluationKey(build.expansionSlot),
          mode,
          targetIds.join(','),
        ].join('|')
        const cachedIndex = buildIndexes.get(cacheKey)
        if (cachedIndex !== undefined) return cachedIndex
        const buildIndex = uniqueBuilds.length
        buildIndexes.set(cacheKey, buildIndex)
        uniqueBuilds.push({
          cacheKey,
          mode,
          targetIds,
          shipId: Number(build.ship.id),
          equipmentIds: build.equipment.map((gear) => Number(gear?.id || 0)),
          expansionSlotId: Number(build.expansionSlot?.id || 0),
          slotSizes: build.ship.slotSizes.map(Number),
        })
        return buildIndex
      }),
    }
  })
  return { snapshotKey, uniqueBuilds, recommendations: payloadRecommendations }
}

const combatEvaluationScript = (recommendations, snapshotKey) => {
  const payload = JSON.stringify(combatEvaluationPayload(recommendations, snapshotKey)).replaceAll(
    '<',
    '\\u003c',
  )

  return `(() => {
    if (!window.KC3ShipManager || !window.KC3GearManager || !window.KC3Ship) {
      throw new Error('KC3 combat calculators are not ready')
    }
    const payload = ${payload}
    const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
    const emptyStats = () => ({
      firepower: 0, torpedo: 0, antiAir: 0, armor: 0, asw: 0,
      los: 0, bombing: 0, accuracy: 0, evasion: 0,
    })
    const statSpecs = {
      firepower: ['fp', 'houg'], torpedo: ['tp', 'raig'], antiAir: ['aa', 'tyku'],
      armor: ['ar', 'souk'], asw: ['as', 'tais'], los: ['ls', 'saku'],
      accuracy: ['ht', 'houm'], evasion: ['ev', 'houk'],
    }
    const capPower = (ship, power, time, warfareType) => {
      try { return finite(ship.applyPowerCap(power, time, warfareType).power) }
      catch (_) { return finite(power) }
    }
    const antiLandPower = (ship, night, targetShipMasterId) => {
      try {
        if (night ? !ship.canDoNightAttack(targetShipMasterId)
          : !ship.canDoDayShellingAttack(targetShipMasterId)) return 0
        const basic = night
          ? (ship.isCarrier() && ship.canCarrierNightAirAttack()
            ? ship.nightAirAttackPower(0, true)
            : ship.nightBattlePower(0, true))
          : ship.shellingFirePower(0, true)
        const preconditions = night
          ? ['Shelling', 1, undefined, ['SingleAttack', 0], false, false, targetShipMasterId]
          : ['Shelling', 1, undefined, undefined, false, false, targetShipMasterId]
        const precap = ship.applyPrecapModifiers(basic, ...preconditions).power
        const capped = ship.applyPowerCap(precap, night ? 'Night' : 'Day', 'Shelling').power
        const postconditions = night
          ? ['Shelling', [], 0, false, false, 0, false, targetShipMasterId]
          : ['Shelling', undefined, 0, false, false, 0, false, targetShipMasterId]
        return finite(ship.applyPostcapModifiers(capped, ...postconditions).power)
      } catch (_) { return 0 }
    }
    const evaluateBuild = (build) => {
      const source = window.KC3ShipManager.get(build.shipId)
      if (!source || !source.masterId) throw new Error('Missing KC3 ship: ' + build.shipId)
      const probe = new window.KC3Ship(source, true)
      const regularIds = build.equipmentIds.slice()
      while (regularIds.length < Math.max(Number(probe.slotnum) || 0, 5)) regularIds.push(-1)
      probe.items = regularIds.map((id) => id > 0 ? id : -1)
      probe.ex_item = build.expansionSlotId > 0 ? build.expansionSlotId : 0
      probe.slots = build.slotSizes.slice()
      probe.slotsMax = build.slotSizes.slice()
      probe.GearManager = window.KC3GearManager
      probe.statsCache = {}
      const maximumHp = Math.max(finite((source.hp || [1, 1])[1]), 1)
      probe.hp = [maximumHp, maximumHp]
      probe.afterHp = [maximumHp, maximumHp]
      probe.morale = 49

      const effectiveStats = emptyStats()
      const equipmentBonus = emptyStats()
      Object.entries(statSpecs).forEach(([name, [attr, apiName]]) => {
        const naked = typeof source.estimateNakedStats === 'function'
          ? finite(source.estimateNakedStats(attr))
          : finite((source[attr] || [0])[0])
        const equipmentStats = probe.equipmentTotalStats(apiName, true, true, 'both')
        const equipmentTotal = Array.isArray(equipmentStats)
          ? finite(equipmentStats[0])
          : finite(equipmentStats)
        const value = naked + equipmentTotal
        effectiveStats[name] = value
        equipmentBonus[name] = Array.isArray(equipmentStats) ? finite(equipmentStats[1]) : 0
        probe[attr] = [value, finite((source[attr] || [value, value])[1]) || value]
      })
      probe.statsCache = {}

      let daySurfacePower = 0
      if (build.mode === 'surface' && probe.canDoDayShellingAttack()) {
        daySurfacePower = capPower(probe, probe.shellingFirePower(), 'Day', 'Shelling')
      }
      let nightSurfacePower = 0
      if (build.mode === 'surface' && probe.canDoNightAttack()) {
        const nightPower = probe.isCarrier() && probe.canCarrierNightAirAttack()
          ? probe.nightAirAttackPower()
          : probe.nightBattlePower()
        nightSurfacePower = capPower(probe, nightPower, 'Night', 'Shelling')
      }
      const openingAswCapable = build.mode === 'anti-submarine'
        ? Boolean(probe.canDoOASW())
        : false
      const antiSubmarineAttackCapable = build.mode === 'anti-submarine'
        ? Boolean(probe.canDoASW())
        : false
      const antiSubmarinePower = antiSubmarineAttackCapable
        ? capPower(probe, probe.antiSubWarfarePower(), 'Day', 'Antisub')
        : 0
      let shellingAccuracy = 0
      try {
        if (build.mode === 'surface') {
          shellingAccuracy = finite(
            probe.shellingAccuracy(1, true, 0, true, false, probe.isCarrier()).accuracy,
          )
        }
      } catch (_) {}
      const averageAntiLandPower = (night) => build.targetIds.length === 0
        ? 0
        : build.targetIds
          .map((targetShipMasterId) => antiLandPower(probe, night, targetShipMasterId))
          .reduce((total, power) => total + power, 0) / build.targetIds.length
      return {
        effectiveStats,
        equipmentBonus,
        daySurfacePower,
        nightSurfacePower,
        antiInstallationDayPower:
          build.mode === 'anti-installation' ? averageAntiLandPower(false) : 0,
        antiInstallationNightPower:
          build.mode === 'anti-installation' ? averageAntiLandPower(true) : 0,
        antiSubmarineAttackCapable,
        openingAswCapable,
        antiSubmarinePower,
        shellingAccuracy,
      }
    }
    const previousCache = window.__dameconCombatEvaluationCache
    const evaluationCache = previousCache?.snapshotKey === payload.snapshotKey
      ? previousCache
      : { snapshotKey: payload.snapshotKey, entries: new Map() }
    if (!(evaluationCache.entries instanceof Map) || evaluationCache.entries.size > 1000) {
      evaluationCache.entries = new Map()
    }
    const evaluations = payload.uniqueBuilds.map((build) => {
      if (evaluationCache.entries.has(build.cacheKey)) {
        return evaluationCache.entries.get(build.cacheKey)
      }
      const evaluation = evaluateBuild(build)
      evaluationCache.entries.set(build.cacheKey, evaluation)
      return evaluation
    })
    window.__dameconCombatEvaluationCache = evaluationCache
    return payload.recommendations.map((recommendation) => ({
      id: recommendation.id,
      ships: recommendation.buildIndexes.map((buildIndex) => evaluations[buildIndex]),
    }))
  })()`
}

export const readKC3CombatEvaluations = async (webContents, recommendations, snapshotKey = '') =>
  webContents.executeJavaScript(combatEvaluationScript(recommendations, snapshotKey), true)
