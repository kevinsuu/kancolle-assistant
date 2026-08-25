export const kc3ExpeditionPlannerMainWorld = (request) => {
  const resourceKeys = ['fuel', 'ammo', 'steel', 'bauxite']
  const emptyResources = () => ({ fuel: 0, ammo: 0, steel: 0, bauxite: 0 })
  const mapResources = (resource, transform) =>
    Object.fromEntries(resourceKeys.map((key) => [key, transform(Number(resource[key]) || 0, key)]))
  const addResources = (left, right) =>
    mapResources(left, (value, key) => value + Number(right[key] || 0))
  const extendedExpeditions = {
    100: { resource: [45, 45, 0, 0] },
    101: { resource: [70, 40, 0, 10] },
    102: { resource: [120, 0, 60, 60] },
    110: { resource: [0, 0, 10, 30] },
  }
  const minimumCompositions = {
    1: { any: 2 },
    2: { any: 4 },
    3: { any: 3 },
    4: { cl: 1, dd: 2 },
    5: { cl: 1, dd: 2, any: 1 },
    6: { any: 4 },
    7: { any: 6 },
    8: { any: 6 },
    9: { cl: 1, dd: 2, any: 1 },
    10: { cl: 2, any: 1 },
    11: { dd: 2, any: 2 },
    12: { dd: 2, any: 2 },
    13: { cl: 1, dd: 4, any: 1 },
    14: { cl: 1, dd: 3, any: 2 },
    15: { cvLike: 2, dd: 2, any: 2 },
    16: { cl: 1, dd: 2, any: 3 },
    17: { cl: 1, dd: 3, any: 2 },
    18: { cvLike: 3, dd: 2, any: 1 },
    19: { bbv: 2, dd: 2, any: 2 },
    20: { ssLike: 1, cl: 1 },
    21: { cl: 1, dd: 4 },
    22: { ca: 1, cl: 1, dd: 2, any: 2 },
    23: { bbv: 2, dd: 2, any: 2 },
    24: { cl: 1, dd: 4, any: 1 },
    25: { ca: 2, dd: 2 },
    26: { cvLike: 1, cl: 1, dd: 2 },
    27: { ssLike: 2 },
    28: { ssLike: 3 },
    29: { ssLike: 3 },
    30: { ssLike: 4 },
    31: { ssLike: 4 },
    32: { ct: 1, dd: 2 },
    33: { dd: 2 },
    34: { dd: 2 },
    35: { cvLike: 2, ca: 1, dd: 1, any: 2 },
    36: { av: 2, cl: 1, dd: 1, any: 2 },
    37: { cl: 1, dd: 5 },
    38: { dd: 5, any: 1 },
    39: { as: 1, ssLike: 4 },
    40: { cl: 1, av: 2, dd: 2, any: 1 },
    100: { dd: 3, any: 1 },
    101: { dd: 4 },
    102: { cl: 1, dd: 3, any: 1 },
    110: { cl: 1, av: 1, dd: 2, any: 2 },
  }
  const currentMaterials = window.PlayerManager?.hq?.lastMaterial

  if (
    !Array.isArray(currentMaterials) ||
    currentMaterials.length < 4 ||
    !window.Expedition ||
    !window.KC3Master?.available ||
    !window.PS
  ) {
    throw new Error('KC3 expedition data is not ready')
  }

  const current = {
    fuel: Number(currentMaterials[0]) || 0,
    ammo: Number(currentMaterials[1]) || 0,
    steel: Number(currentMaterials[2]) || 0,
    bauxite: Number(currentMaterials[3]) || 0,
  }
  const maxResource = Number(window.PlayerManager.maxResource) || 350000
  if (request.mode === 'summary') {
    return { generatedAt: new Date().toISOString(), current, maxResource }
  }

  const expeditionInfo = window.PS['KanColle.Expedition.New.Info']
  const requirementApi = window.PS['KanColle.Expedition.RequirementObject']
  const requirement = window.PS['KanColle.Expedition.Requirement']
  const shipType = window.PS['KanColle.Generated.SType']
  if (!expeditionInfo || !requirementApi || !requirement || !shipType) {
    throw new Error('KC3 expedition requirement engine is not ready')
  }

  const target = mapResources(request.target, (value) => value)
  const deficits = mapResources(target, (value, key) => Math.max(0, value - current[key]))
  const deficitKeys = resourceKeys.filter((key) => deficits[key] > 0)
  if (deficitKeys.length === 0 && !request.considerBuckets) {
    return {
      status: 'no-solution',
      reason: '目前四項資源都已達到設定目標。',
      reasonCode: 'TARGET_REACHED',
      reasonValues: {},
      generatedAt: new Date().toISOString(),
      current,
      target,
      deficits,
      maxResource,
    }
  }

  const plannerModifier = {
    type: 'normal',
    gs: request.incomeModifier.greatSuccess,
    daihatsu: request.incomeModifier.daihatsuCount,
  }
  const plannerModifierFactor = Number(window.Expedition.modifierToNumber(plannerModifier))
  const successFactor = plannerModifier.gs ? 1.5 : 1
  const daihatsuFactor = 1 + plannerModifier.daihatsu * 0.05
  const accountShips = Object.values(window.KC3ShipManager?.list || {})
    .filter((ship) => ship && Number(ship.masterId) > 0)
    .map((ship) => {
      const master = ship.master()
      return {
        masterId: Number(ship.masterId),
        level: Number(ship.level || 1),
        stype: Number(master?.api_stype || 0),
        maxFuel: Number(master?.api_fuel_max || 0),
        maxAmmo: Number(master?.api_bull_max || 0),
      }
    })
  const matchesCostType = (ship, type) => {
    if (type === 'dd') return ship.stype === 2
    if (type === 'cl') return ship.stype === 3
    if (type === 'ct') return ship.stype === 21
    if (type === 'ca') return ship.stype === 5
    if (type === 'as') return ship.stype === 20
    if (type === 'av') return ship.stype === 16
    if (type === 'bbv') return ship.stype === 10
    if (type === 'ssLike') return ship.stype === 13 || ship.stype === 14
    if (type === 'cvLike') return [7, 11, 16, 18].includes(ship.stype)
    return false
  }
  const shipCost = (ship, fuelPercent, ammoPercent) => {
    const marriageModifier = (value) =>
      value === 0 || ship.level <= 99 ? value : Math.max(1, Math.floor(value * 0.85))
    return {
      fuel: marriageModifier(Math.floor(ship.maxFuel * fuelPercent)),
      ammo: marriageModifier(Math.floor(ship.maxAmmo * ammoPercent)),
    }
  }
  const cheapestDistinctShips = (type, count, fuelPercent, ammoPercent) => {
    const seenMasterIds = new Set()
    const matches = accountShips
      .filter((ship) => matchesCostType(ship, type))
      .map((ship) => ({ ...ship, cost: shipCost(ship, fuelPercent, ammoPercent) }))
      .sort((left, right) => left.cost.fuel + left.cost.ammo - (right.cost.fuel + right.cost.ammo))
      .filter((ship) => {
        if (seenMasterIds.has(ship.masterId)) return false
        seenMasterIds.add(ship.masterId)
        return true
      })
    return matches.length >= count ? matches.slice(0, count) : null
  }
  const computeKanceptsAccountCost = (expeditionId, master) => {
    const sourceComposition = minimumCompositions[expeditionId]
    if (!sourceComposition) return null
    const composition = { ...sourceComposition }
    if (composition.any) {
      composition.dd = Number(composition.dd || 0) + composition.any
      delete composition.any
    }
    const fuelPercent = Number(master.api_use_fuel || 0)
    const ammoPercent = Number(master.api_use_bull || 0)
    const selectedGroups = Object.entries(composition).map(([type, count]) =>
      cheapestDistinctShips(type, Number(count), fuelPercent, ammoPercent),
    )
    if (selectedGroups.some((group) => group === null)) return null
    return selectedGroups.flat().reduce(
      (sum, ship) => ({
        fuel: sum.fuel + ship.cost.fuel,
        ammo: sum.ammo + ship.cost.ammo,
      }),
      { fuel: 0, ammo: 0 },
    )
  }
  const normalizeNullableNumber = (value) =>
    value === null || typeof value === 'undefined' ? null : Number(value)
  const normalizeNullableBoolean = (value) =>
    value === null || typeof value === 'undefined' ? null : Boolean(value)
  const normalizeRequirements = (raw, master) => ({
    flagShipLevel: Number(raw.flagShipLevel || 1),
    flagShipTypeOf: Array.isArray(raw.flagShipTypeOf) ? raw.flagShipTypeOf.map(String) : null,
    shipCount: Number(raw.shipCount === 1 ? master.api_deck_num : raw.shipCount),
    levelCount: normalizeNullableNumber(raw.levelCount),
    totalAsw: normalizeNullableNumber(raw.totalAsw),
    totalLos: normalizeNullableNumber(raw.totalLos),
    totalAa: normalizeNullableNumber(raw.totalAa),
    totalFp: normalizeNullableNumber(raw.totalFp),
    totalTorp: normalizeNullableNumber(raw.totalTorp),
    drumCount: normalizeNullableNumber(raw.drumCount),
    drumCarrierCount: normalizeNullableNumber(raw.drumCarrierCount),
    fleetSType: Array.isArray(raw.fleetSType)
      ? raw.fleetSType.map((item) => ({
          count: Number(item.stypeReqCount),
          oneOf: Array.isArray(item.stypeOneOf) ? item.stypeOneOf.map(String) : [],
        }))
      : [],
    sampleFleet: Array.isArray(master.api_sample_fleet)
      ? master.api_sample_fleet
          .filter((value) => Number(value) > 0)
          .map((value) =>
            typeof window.KC3Meta?.stype === 'function'
              ? String(window.KC3Meta.stype(Number(value)))
              : String(value),
          )
      : [],
  })
  const normalizeCheckResult = (raw) => ({
    flagShipLevel: Boolean(raw.flagShipLevel),
    flagShipTypeOf: normalizeNullableBoolean(raw.flagShipTypeOf),
    shipCount: Boolean(raw.shipCount),
    levelCount: normalizeNullableBoolean(raw.levelCount),
    totalAsw: normalizeNullableBoolean(raw.totalAsw),
    totalLos: normalizeNullableBoolean(raw.totalLos),
    totalAa: normalizeNullableBoolean(raw.totalAa),
    totalFp: normalizeNullableBoolean(raw.totalFp),
    totalTorp: normalizeNullableBoolean(raw.totalTorp),
    drumCount: normalizeNullableBoolean(raw.drumCount),
    drumCarrierCount: normalizeNullableBoolean(raw.drumCarrierCount),
    fleetSType: Array.isArray(raw.fleetSType) ? raw.fleetSType.map(Boolean) : [],
  })
  const checkValues = (result) =>
    [
      result.flagShipLevel,
      result.shipCount,
      result.flagShipTypeOf,
      result.levelCount,
      result.totalAsw,
      result.totalLos,
      result.totalAa,
      result.totalFp,
      result.totalTorp,
      result.drumCount,
      result.drumCarrierCount,
      ...result.fleetSType,
    ].filter((value) => value !== null)

  const makeFleetForRequirementEngine = (fleet, expeditionId) => {
    const ships = (fleet.ships || [])
      .map((rosterId) => window.KC3ShipManager.get(Number(rosterId)))
      .filter((ship) => ship && Number(ship.masterId) > 0)
      .map((ship) => {
        const master = ship.master()
        const stats = ship.nakedStats()
        const includeImprovement = expeditionId > 40
        let firepower = stats.fp + ship.expedEquipmentTotalStats('houg') + ship.statsSp('fp')
        let torpedo = stats.tp + ship.expedEquipmentTotalStats('raig') + ship.statsSp('tp')
        let antiAir = stats.aa + ship.expedEquipmentTotalStats('tyku')
        let lineOfSight = stats.ls + ship.expedEquipmentTotalStats('saku')
        let antiSubmarine = stats.as + ship.expedEquipmentTotalStats('tais')
        if (includeImprovement) {
          const equipment = ship.equipment(true)
          antiSubmarine += equipment
            .map((gear) => gear.aswStatImprovementBonus('exped'))
            .reduce((sum, value) => sum + Number(value || 0), 0)
          lineOfSight += equipment
            .map((gear) => gear.losStatImprovementBonus('exped'))
            .reduce((sum, value) => sum + Number(value || 0), 0)
          antiAir += equipment
            .map((gear) => gear.aaStatImprovementBonus('exped'))
            .reduce((sum, value) => sum + Number(value || 0), 0)
          firepower += equipment
            .map((gear) => gear.attackPowerImprovementBonus('exped'))
            .reduce((sum, value) => sum + Number(value || 0), 0)
        }
        return {
          ammo: 0,
          morale: Number(ship.morale || 0),
          stype: shipType.showSType(shipType.fromInt(Number(master.api_stype))),
          isCve: Boolean(ship.isEscortLightCarrier()),
          level: Number(ship.level),
          drumCount: Number(ship.countDrums()),
          asw: antiSubmarine,
          los: lineOfSight,
          aa: antiAir,
          fp: firepower,
          tp: torpedo,
        }
      })
    const flagship = ships[0]
    return {
      ships,
      encoded: requirement.fromRawFleet(ships),
      actual: {
        flagShipLevel: flagship?.level || 0,
        flagShipType: flagship?.isCve ? 'CVE' : String(flagship?.stype || ''),
        shipCount: ships.length,
        levelCount: ships.reduce((sum, ship) => sum + ship.level, 0),
        totalAsw: Math.floor(ships.reduce((sum, ship) => sum + ship.asw, 0)),
        totalLos: Math.floor(ships.reduce((sum, ship) => sum + ship.los, 0)),
        totalAa: Math.floor(ships.reduce((sum, ship) => sum + ship.aa, 0)),
        totalFp: Math.floor(ships.reduce((sum, ship) => sum + ship.fp, 0)),
        totalTorp: Math.floor(ships.reduce((sum, ship) => sum + ship.tp, 0)),
        drumCount: ships.reduce((sum, ship) => sum + ship.drumCount, 0),
        drumCarrierCount: ships.filter((ship) => ship.drumCount > 0).length,
        sparkledCount: ships.filter((ship) => ship.morale >= 50).length,
        types: ships.map((ship) => (ship.isCve ? 'CVE' : String(ship.stype))),
      },
    }
  }

  if (typeof window.PlayerManager.loadFleets === 'function') {
    window.PlayerManager.loadFleets()
  }
  const fleetSlots = (window.PlayerManager.fleets || [])
    .slice(1, 4)
    .filter((fleet) => fleet && fleet.active !== false && Number(fleet.fleetId) > 1)
    .map((fleet) => {
      const missionId = Number(fleet.mission?.[1] || 0)
      const missionMaster = missionId > 0 ? window.KC3Master.mission(missionId) : null
      return {
        fleet,
        fleetNumber: Number(fleet.fleetId),
        name: String(fleet.name || `第${fleet.fleetId}艦隊`),
        busy: Number(fleet.mission?.[0] || 0) > 0,
        currentMission:
          missionId > 0
            ? {
                id: missionId,
                displayNo: String(missionMaster?.api_disp_no || missionId),
                name: String(missionMaster?.api_name || ''),
                completesAt: Number(fleet.mission?.[2] || 0),
              }
            : null,
      }
    })

  if (fleetSlots.length < request.fleetCount) {
    return {
      status: 'no-solution',
      reason: `KC3 目前只有 ${fleetSlots.length} 支可用遠征艦隊，少於設定的 ${request.fleetCount} 支。`,
      reasonCode: 'INSUFFICIENT_FLEETS',
      reasonValues: { available: fleetSlots.length, requested: request.fleetCount },
      generatedAt: new Date().toISOString(),
      current,
      target,
      deficits,
      maxResource,
    }
  }

  const candidates = request.candidateIds.flatMap((id) => {
    try {
      const numericId = Number(id)
      const master = window.KC3Master.mission(numericId)
      const extended = extendedExpeditions[numericId]
      const info = extended
        ? {
            resource: {
              fuel: extended.resource[0],
              ammo: extended.resource[1],
              steel: extended.resource[2],
              bauxite: extended.resource[3],
            },
            timeInMin: Number(master?.api_time || 0),
          }
        : expeditionInfo.getInformation(numericId)
      if (!info || !master) return []
      const baseIncome = mapResources(info.resource, (value) => value)
      const resupplyCost = computeKanceptsAccountCost(numericId, master)
      if (!resupplyCost) return []
      const grossIncome = mapResources(baseIncome, (value) =>
        Math.floor(value * successFactor * daihatsuFactor),
      )
      const netIncome = {
        fuel: grossIncome.fuel - resupplyCost.fuel,
        ammo: grossIncome.ammo - resupplyCost.ammo,
        steel: grossIncome.steel,
        bauxite: grossIncome.bauxite,
      }
      const durationMinutes = Number(info.timeInMin)
      const effectiveCycleMinutes = Math.max(durationMinutes, request.afkMinutes)
      const hourlyIncome = mapResources(netIncome, (value) => (value * 60) / effectiveCycleMinutes)
      const rawRequirementPack = requirementApi.getExpeditionRequirementPack(numericId)
      const requirements = normalizeRequirements(
        requirementApi.requirementPackToObj(rawRequirementPack),
        master,
      )
      const rawInfo = expeditionInfo.findRawInfo(numericId) || {}
      const bucketReward = [rawInfo.api_win_item1, rawInfo.api_win_item2].find(
        (reward) => Array.isArray(reward) && Number(reward[0]) === 1,
      )
      const bucketMaxPerTrip = Number(bucketReward?.[1]) || 0
      return [
        {
          id: numericId,
          displayNo: String(master.api_disp_no || numericId),
          name: String(master.api_name || ''),
          durationMinutes,
          effectiveCycleMinutes,
          baseIncome,
          netIncome,
          hourlyIncome,
          bucketPotential: {
            maxPerTrip: bucketMaxPerTrip,
            hourly: (bucketMaxPerTrip * 60) / effectiveCycleMinutes,
          },
          estimatedResupplyCost: {
            fuel: Number(resupplyCost.fuel || 0),
            ammo: Number(resupplyCost.ammo || 0),
          },
          requirements,
          rawRequirementPack,
          modifier: {
            type: 'kancepts-account',
            greatSuccess: plannerModifier.gs,
            daihatsuCount: plannerModifier.daihatsu,
            factor: plannerModifierFactor,
          },
          greatSuccessCondition: rawInfo.kc3_gs_drum_count
            ? { type: 'drums', count: Number(rawInfo.kc3_gs_drum_count) }
            : rawInfo.kc3_gs_flagship_level
              ? { type: 'flagship-level' }
              : rawInfo.kc3_gs_all_sparkle
                ? { type: 'all-sparkle' }
                : { type: 'unknown' },
          monthly: Number(master.api_reset_type || 0) > 0,
        },
      ]
    } catch {
      return []
    }
  })

  if (candidates.length < request.fleetCount) {
    return {
      status: 'no-solution',
      reason:
        '可計算的遠征不足以分配所選艦隊；請確認候選已解鎖，且帳號內有足夠艦種建立 Kancepts 最低成本編成。',
      reasonCode: 'INSUFFICIENT_EXPEDITIONS',
      reasonValues: {},
      generatedAt: new Date().toISOString(),
      current,
      target,
      deficits,
      maxResource,
    }
  }

  const combinations = (values, count) => {
    const output = []
    const selected = []
    const visit = (start) => {
      if (selected.length === count) {
        output.push([...selected])
        return
      }
      for (let index = start; index <= values.length - (count - selected.length); index += 1) {
        selected.push(values[index])
        visit(index + 1)
        selected.pop()
      }
    }
    visit(0)
    return output
  }
  const permutations = (values, count) => {
    if (count === 0) return [[]]
    return values.flatMap((value, index) =>
      permutations(
        values.filter((_, candidateIndex) => candidateIndex !== index),
        count - 1,
      ).map((tail) => [value, ...tail]),
    )
  }
  const checkExpeditionWithFleet = (expedition, slot) => {
    const fleetForEngine = makeFleetForRequirementEngine(slot.fleet, expedition.id)
    const result = normalizeCheckResult(
      requirementApi.resultPackToObject(
        requirementApi.checkWithRequirementPack(expedition.rawRequirementPack)(
          fleetForEngine.encoded,
        ),
      ),
    )
    const checks = checkValues(result)
    const passedCount = checks.filter(Boolean).length
    const meetsRequirements = checks.length > 0 && passedCount === checks.length
    const isSupplied =
      typeof slot.fleet.isSupplied === 'function' ? Boolean(slot.fleet.isSupplied()) : false
    return {
      fleetNumber: slot.fleetNumber,
      fleetName: slot.name,
      busy: slot.busy,
      currentMission: slot.currentMission,
      shipCount: fleetForEngine.ships.length,
      meetsRequirements,
      isSupplied,
      actual: fleetForEngine.actual,
      result,
      fitScore:
        passedCount * 10 +
        (meetsRequirements ? 100 : 0) +
        (isSupplied ? 5 : 0) +
        (slot.busy ? 0 : 2),
    }
  }
  const fleetChecks = new Map(
    candidates.flatMap((expedition) =>
      fleetSlots.map((slot) => [
        `${expedition.id}:${slot.fleetNumber}`,
        checkExpeditionWithFleet(expedition, slot),
      ]),
    ),
  )
  const bestPairing = (expeditions) =>
    permutations(fleetSlots, expeditions.length)
      .map((slots) => {
        const pairings = expeditions.map((expedition, index) => ({
          expedition,
          fleet: fleetChecks.get(`${expedition.id}:${slots[index].fleetNumber}`),
        }))
        return {
          pairings,
          score: pairings.reduce((sum, pairing) => sum + pairing.fleet.fitScore, 0),
        }
      })
      .sort((left, right) => right.score - left.score)[0]

  const resourceWeights = mapResources(request.resourceWeights, (value) => value)
  const comparisonWindowMinutes = Math.max(60, request.afkMinutes)
  const plans = combinations(candidates, request.fleetCount).map((expeditions) => {
    const hourlyIncome = expeditions.reduce(
      (sum, expedition) => addResources(sum, expedition.hourlyIncome),
      emptyResources(),
    )
    const projectedIncome = mapResources(
      hourlyIncome,
      (value) => (value * comparisonWindowMinutes) / 60,
    )
    const goalCoverage =
      deficitKeys.length === 0
        ? 1
        : deficitKeys.reduce(
            (sum, key) =>
              sum + Math.min(Math.max(0, projectedIncome[key]), deficits[key]) / deficits[key],
            0,
          ) / deficitKeys.length
    const weightedHourlyIncome = resourceKeys.reduce(
      (sum, key) => sum + hourlyIncome[key] * resourceWeights[key],
      0,
    )
    const bucketPotentialHourly = expeditions.reduce(
      (sum, expedition) => sum + expedition.bucketPotential.hourly,
      0,
    )
    const estimatedHours =
      deficitKeys.length === 0
        ? 0
        : deficitKeys.every((key) => hourlyIncome[key] > 0)
          ? Math.max(...deficitKeys.map((key) => deficits[key] / hourlyIncome[key]))
          : null
    const pairing = bestPairing(expeditions)
    return {
      goalCoverage,
      weightedHourlyIncome,
      bucketPotentialHourly,
      prioritizesBuckets: request.considerBuckets,
      comparisonWindowMinutes,
      projectedIncome,
      hourlyIncome,
      estimatedHoursToTarget: estimatedHours,
      pairingScore: pairing.score,
      pairings: pairing.pairings.map(({ expedition, fleet }) => ({
        fleet,
        expedition: {
          id: expedition.id,
          displayNo: expedition.displayNo,
          name: expedition.name,
          durationMinutes: expedition.durationMinutes,
          effectiveCycleMinutes: expedition.effectiveCycleMinutes,
          baseIncome: expedition.baseIncome,
          netIncome: expedition.netIncome,
          hourlyIncome: expedition.hourlyIncome,
          bucketPotential: expedition.bucketPotential,
          estimatedResupplyCost: expedition.estimatedResupplyCost,
          requirements: expedition.requirements,
          modifier: expedition.modifier,
          greatSuccessCondition: expedition.greatSuccessCondition,
          monthly: expedition.monthly,
        },
      })),
    }
  })

  plans.sort((left, right) => {
    const bucketDifference = request.considerBuckets
      ? right.bucketPotentialHourly - left.bucketPotentialHourly
      : 0
    return (
      bucketDifference ||
      right.weightedHourlyIncome - left.weightedHourlyIncome ||
      (left.estimatedHoursToTarget ?? Number.POSITIVE_INFINITY) -
        (right.estimatedHoursToTarget ?? Number.POSITIVE_INFINITY) ||
      right.goalCoverage - left.goalCoverage ||
      right.pairingScore - left.pairingScore
    )
  })

  return {
    status: 'success',
    generatedAt: new Date().toISOString(),
    current,
    target,
    deficits,
    resourceWeights,
    maxResource,
    candidateCount: candidates.length,
    settings: {
      afkMinutes: request.afkMinutes,
      fleetCount: request.fleetCount,
      comparisonWindowMinutes,
      resourceWeights,
      considerBuckets: request.considerBuckets,
      mode: request.afkMinutes === 0 ? 'online' : 'afk',
      incomeModifier: {
        greatSuccess: plannerModifier.gs,
        daihatsuCount: plannerModifier.daihatsu,
        factor: plannerModifierFactor,
      },
      usesExpeditionTableCostConfig: false,
      resupplyCostModel: 'kancepts-account',
    },
    plans: plans.slice(0, 1),
  }
}

const executePlanner = (webContents, request) =>
  webContents.executeJavaScript(
    `(${kc3ExpeditionPlannerMainWorld.toString()})(${JSON.stringify(request)})`,
    true,
  )

export const readKC3ExpeditionSummary = (webContents) =>
  executePlanner(webContents, { mode: 'summary' })

export const planKC3Expeditions = (webContents, request) =>
  executePlanner(webContents, { mode: 'plan', ...request })
