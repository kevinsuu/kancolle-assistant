import {
  parseKC3ExpeditionPlannerSnapshot,
  planExpeditions,
} from '@kancolle-assistant/recommendation-core'

export const kc3ExpeditionPlannerMainWorld = (request) => {
  const resourceKeys = ['fuel', 'ammo', 'steel', 'bauxite']
  const extendedExpeditions = {
    100: { resource: [45, 45, 0, 0] },
    101: { resource: [70, 40, 0, 10] },
    102: { resource: [120, 0, 60, 60] },
    110: { resource: [0, 0, 10, 30] },
  }
  const hq = window.PlayerManager?.hq

  if (typeof hq?.load === 'function') hq.load()
  const currentMaterials = hq?.lastMaterial

  if (
    !Array.isArray(currentMaterials) ||
    currentMaterials.length < 4 ||
    !window.Expedition ||
    !window.KC3Master?.available ||
    !window.PS
  ) {
    throw new Error('KC3 expedition data is not ready')
  }

  const generatedAt = new Date().toISOString()
  const current = {
    fuel: Number(currentMaterials[0]) || 0,
    ammo: Number(currentMaterials[1]) || 0,
    steel: Number(currentMaterials[2]) || 0,
    bauxite: Number(currentMaterials[3]) || 0,
  }
  const maxResource = Number(window.PlayerManager.maxResource) || 350000
  if (request.mode === 'summary') return { generatedAt, current, maxResource }

  const expeditionInfo = window.PS['KanColle.Expedition.New.Info']
  const requirementApi = window.PS['KanColle.Expedition.RequirementObject']
  const requirement = window.PS['KanColle.Expedition.Requirement']
  const shipType = window.PS['KanColle.Generated.SType']
  if (!expeditionInfo || !requirementApi || !requirement || !shipType) {
    throw new Error('KC3 expedition requirement engine is not ready')
  }

  const mapResources = (resource) =>
    Object.fromEntries(resourceKeys.map((key) => [key, Number(resource[key]) || 0]))
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

  if (typeof window.PlayerManager.loadFleets === 'function') window.PlayerManager.loadFleets()
  const fleetSlots = (window.PlayerManager.fleets || [])
    .slice(1, 4)
    .filter((fleet) => fleet && fleet.active !== false && Number(fleet.fleetId) > 1)
    .map((fleet) => {
      const busy = Number(fleet.mission?.[0] || 0) > 0
      const missionId = Number(fleet.mission?.[1] || 0)
      const completesAt = Number(fleet.mission?.[2] || 0)
      const missionMaster = busy && missionId > 0 ? window.KC3Master.mission(missionId) : null
      if (
        busy &&
        (missionId <= 0 || !Number.isFinite(completesAt) || completesAt <= 0 || !missionMaster)
      ) {
        throw new Error(`KC3 fleet ${fleet.fleetId} mission data is incomplete`)
      }
      return {
        fleet,
        fleetNumber: Number(fleet.fleetId),
        name: String(fleet.name || `第${fleet.fleetId}艦隊`),
        busy,
        currentMission:
          busy && missionId > 0
            ? {
                id: missionId,
                displayNo: String(missionMaster.api_disp_no || missionId),
                name: String(missionMaster.api_name || ''),
                completesAt,
              }
            : null,
      }
    })
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

      const rawRequirementPack = requirementApi.getExpeditionRequirementPack(numericId)
      const requirements = normalizeRequirements(
        requirementApi.requirementPackToObj(rawRequirementPack),
        master,
      )
      const rawInfo = expeditionInfo.findRawInfo(numericId) || {}
      const itemRewards = [
        { itemSlot: 'left', reward: rawInfo.api_win_item1 },
        { itemSlot: 'right', reward: rawInfo.api_win_item2 },
      ].filter(({ reward }) => Array.isArray(reward) && Number(reward[0]) > 0)
      const bucketReward = itemRewards.find(({ reward }) => Number(reward[0]) === 1)
      const bucketMaxPerTrip = Number(bucketReward?.reward?.[1]) || 0
      const bucketRewardRule =
        bucketReward?.itemSlot === 'right' && itemRewards.length > 1
          ? 'great-success-guaranteed'
          : 'random'
      const fleetChecks = fleetSlots.map((slot) => {
        const fleetForEngine = makeFleetForRequirementEngine(slot.fleet, numericId)
        return {
          fleetNumber: slot.fleetNumber,
          fleetName: slot.name,
          busy: slot.busy,
          currentMission: slot.currentMission,
          shipCount: fleetForEngine.ships.length,
          isSupplied:
            typeof slot.fleet.isSupplied === 'function' ? Boolean(slot.fleet.isSupplied()) : false,
          actual: fleetForEngine.actual,
          result: normalizeCheckResult(
            requirementApi.resultPackToObject(
              requirementApi.checkWithRequirementPack(rawRequirementPack)(fleetForEngine.encoded),
            ),
          ),
        }
      })
      return [
        {
          id: numericId,
          displayNo: String(master.api_disp_no || numericId),
          name: String(master.api_name || ''),
          durationMinutes: Number(info.timeInMin),
          baseIncome: mapResources(info.resource),
          bucketMaxPerTrip,
          bucketReward:
            bucketMaxPerTrip > 0
              ? {
                  item: 'bucket',
                  min: 0,
                  max: bucketMaxPerTrip,
                  itemSlot: bucketReward.itemSlot,
                  rewardRule: bucketRewardRule,
                  acquisitionProbability: null,
                }
              : null,
          fuelPercent: Number(master.api_use_fuel || 0),
          ammoPercent: Number(master.api_use_bull || 0),
          requirements,
          greatSuccessCondition: rawInfo.kc3_gs_drum_count
            ? { type: 'drums', count: Number(rawInfo.kc3_gs_drum_count) }
            : rawInfo.kc3_gs_flagship_level
              ? { type: 'flagship-level' }
              : rawInfo.kc3_gs_all_sparkle
                ? { type: 'all-sparkle' }
                : { type: 'unknown' },
          monthly: Number(master.api_reset_type || 0) > 0,
          fleetChecks,
        },
      ]
    } catch {
      return []
    }
  })

  return {
    generatedAt,
    current,
    maxResource,
    modifierFactor: Number(
      window.Expedition.modifierToNumber({
        type: 'normal',
        gs: request.incomeModifier.greatSuccess,
        daihatsu: request.incomeModifier.daihatsuCount,
      }),
    ),
    accountShips,
    fleetNumbers: fleetSlots.map((slot) => slot.fleetNumber),
    candidates,
  }
}

const executePlanner = (webContents, request) =>
  webContents.executeJavaScript(
    `(${kc3ExpeditionPlannerMainWorld.toString()})(${JSON.stringify(request)})`,
    true,
  )

export const readKC3ExpeditionSummary = (webContents) =>
  executePlanner(webContents, { mode: 'summary' })

export const readKC3ExpeditionPlannerSnapshot = (webContents, request) =>
  executePlanner(webContents, { mode: 'plan', ...request })

export const planKC3Expeditions = async (webContents, request, planner = planExpeditions) => {
  const value = await readKC3ExpeditionPlannerSnapshot(webContents, request)
  return planner({ snapshot: parseKC3ExpeditionPlannerSnapshot(value), request })
}
