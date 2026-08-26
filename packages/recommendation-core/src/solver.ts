import { calculateFleetMetrics, satisfiesCalculatedConstraints } from './metrics'
import { getRouteTemplates } from './rules'
import { recommendationMessages, recommendationTitle } from './solver/explanations'
import { analyzeFleetAvailability, generateFleetCandidates } from './solver/fleet-search'
import { buildGearSolutions, createGearSearchContext } from './solver/gear-search'
import { scoreFleet } from './solver/scoring'
import type {
  FleetRecommendation,
  RecommendFleetInput,
  RecommendFleetResult,
  UnsatisfiedRequirement,
} from './types'

export const SOLVER_VERSION = '0.1.0'

const MIN_FLEETS_TO_EQUIP = 6
const MAX_FLEETS_TO_EQUIP = 18
const SUCCESSFUL_FLEETS_PER_ROUTE = 3

export const recommendFleet = (input: RecommendFleetInput): RecommendFleetResult => {
  const startedAt = Date.now()
  const routes = getRouteTemplates(input.mapId, input.objective, input.routeId)
  if (routes.length === 0) {
    return { status: 'error', error: { code: 'RULE_NOT_FOUND', message: '找不到指定關卡規則。' } }
  }

  const routeAvailability = routes.map((route) => ({
    route,
    reasons: analyzeFleetAvailability(input.account, route),
  }))
  const availableRoutes = routeAvailability.filter(({ reasons }) => reasons.length === 0)
  if (availableRoutes.length === 0) {
    return {
      status: 'no-solution',
      analysis: { reasons: routeAvailability.flatMap(({ reasons }) => reasons) },
      elapsedMs: Date.now() - startedAt,
      solverVersion: SOLVER_VERSION,
    }
  }

  const recommendationCandidates: FleetRecommendation[] = []
  let bestAirPower = 0
  let bestLos = Number.NEGATIVE_INFINITY
  let speedRequirementFailed = false
  let nightCarrierRequirementFailed = false
  const avoidCurrentFleetEquipment = input.preferences?.avoidCurrentFleetEquipment ?? false
  const gearSearchContext = createGearSearchContext(input.account, avoidCurrentFleetEquipment)

  availableRoutes.forEach(({ route }, routeIndex) => {
    const fleetCandidates = generateFleetCandidates(input.account, route, input.objective)
    const airPowerRequired = route.calculatedConstraints.some(
      (constraint) => constraint.kind === 'air-power',
    )
    const fastPlusRequired = route.tags.includes('fast+')
    const antiInstallationRequired = route.tags.includes('anti-installation')
    const nightCarrierRequired = route.tags.includes('night-carrier')
    const failedSpecialFleets = []
    let successfulFleetCount = 0

    for (
      let fleetIndex = 0;
      fleetIndex < Math.min(fleetCandidates.length, MAX_FLEETS_TO_EQUIP);
      fleetIndex += 1
    ) {
      const fleet = fleetCandidates[fleetIndex]
      const gearSolutions = buildGearSolutions(
        fleet,
        gearSearchContext,
        airPowerRequired,
        fastPlusRequired,
        antiInstallationRequired,
        nightCarrierRequired,
      )
      if (gearSolutions.length === 0 && (fastPlusRequired || nightCarrierRequired)) {
        failedSpecialFleets.push(fleet)
      }
      let fleetAccepted = false
      gearSolutions.forEach((builds, gearIndex) => {
        const metrics = calculateFleetMetrics(builds, route, input.account.hqLevel)
        bestAirPower = Math.max(bestAirPower, metrics.airPower)
        bestLos = Math.max(bestLos, metrics.los33)
        const wrongSpeed =
          (fastPlusRequired && !['fast+', 'fastest'].includes(metrics.finalSpeedClass)) ||
          (route.tags.includes('fast') && metrics.finalSpeedClass === 'slow') ||
          (route.tags.includes('slow') && metrics.finalSpeedClass !== 'slow')
        if (wrongSpeed) {
          speedRequirementFailed = true
          return
        }
        if (!satisfiesCalculatedConstraints(metrics)) return
        const score = scoreFleet(builds, metrics, input.objective)
        const messages = recommendationMessages(builds, metrics, route)
        fleetAccepted = true
        recommendationCandidates.push({
          id: `${route.id}-${routeIndex}-${fleetIndex}-${gearIndex}`,
          title: '',
          mapId: input.mapId,
          route,
          ships: builds,
          metrics,
          score,
          reasons: messages.reasons,
          warnings: messages.warnings,
        })
      })
      if (fleetAccepted) successfulFleetCount += 1
      if (
        fleetIndex + 1 >= MIN_FLEETS_TO_EQUIP &&
        successfulFleetCount >= SUCCESSFUL_FLEETS_PER_ROUTE
      ) {
        break
      }
    }

    if (successfulFleetCount === 0 && failedSpecialFleets.length > 0) {
      if (fastPlusRequired && nightCarrierRequired) {
        const speedOnlyAvailable = failedSpecialFleets.some(
          (fleet) =>
            buildGearSolutions(
              fleet,
              gearSearchContext,
              airPowerRequired,
              true,
              antiInstallationRequired,
              false,
            ).length > 0,
        )
        if (speedOnlyAvailable) nightCarrierRequirementFailed = true
        else speedRequirementFailed = true
      } else {
        if (fastPlusRequired) speedRequirementFailed = true
        if (nightCarrierRequired) nightCarrierRequirementFailed = true
      }
    }
  })

  const seenFleets = new Set<string>()
  const rankedRecommendations = recommendationCandidates
    .sort(
      (left, right) =>
        right.score.total - left.score.total ||
        left.ships
          .map((build) => build.ship.id)
          .join('-')
          .localeCompare(right.ships.map((build) => build.ship.id).join('-')),
    )
    .filter((recommendation) => {
      const signature = `${recommendation.route.id}:${recommendation.ships
        .map((build) => build.ship.id)
        .join('-')}`
      if (seenFleets.has(signature)) return false
      seenFleets.add(signature)
      return true
    })
  const selectedRecommendations: FleetRecommendation[] = []
  const selectedRouteIds = new Set<string>()
  rankedRecommendations.forEach((recommendation) => {
    if (selectedRecommendations.length >= 3 || selectedRouteIds.has(recommendation.route.id)) return
    selectedRecommendations.push(recommendation)
    selectedRouteIds.add(recommendation.route.id)
  })
  rankedRecommendations.forEach((recommendation) => {
    if (selectedRecommendations.length >= 3 || selectedRecommendations.includes(recommendation)) {
      return
    }
    selectedRecommendations.push(recommendation)
  })
  const recommendations = selectedRecommendations.map((recommendation, index) => ({
    ...recommendation,
    title: recommendationTitle(recommendation.route.name, input.objective, index),
  }))

  if (recommendations.length === 0) {
    const reasons: UnsatisfiedRequirement[] = []
    const airMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints
        .filter((item) => item.kind === 'air-power')
        .map((item) => item.minimum),
    )
    const losMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints.filter((item) => item.kind === 'los').map((item) => item.minimum),
    )
    const airMinimum = airMinimums.length > 0 ? Math.min(...airMinimums) : null
    const losMinimum = losMinimums.length > 0 ? Math.min(...losMinimums) : null
    if (airMinimum !== null && bestAirPower < airMinimum) {
      reasons.push({
        code: 'AIR_POWER_INSUFFICIENT',
        message: `目前搜尋到的最高制空值為 ${bestAirPower}，最低需要 ${airMinimum}。`,
        values: { best: bestAirPower, minimum: airMinimum },
      })
    }
    if (losMinimum !== null && bestLos < losMinimum) {
      reasons.push({
        code: 'LOS_INSUFFICIENT',
        message: `目前搜尋到的最高 33 式索敵為 ${Math.max(bestLos, 0).toFixed(1)}，最低需要 ${losMinimum}。`,
        values: { best: Math.max(bestLos, 0).toFixed(1), minimum: losMinimum },
      })
    }
    if (speedRequirementFailed) {
      reasons.push({
        code: 'FLEET_SPEED_INSUFFICIENT',
        message: '目前候選艦隊的速度不符合路線帶路條件；已拒絕輸出不合法的方案。',
      })
    }
    if (nightCarrierRequirementFailed) {
      reasons.push({
        code: 'NIGHT_CARRIER_UNAVAILABLE',
        message: '目前候選空母沒有可成立的夜戰特性或帳號持有裝備組合。',
      })
    }
    if (reasons.length === 0) {
      reasons.push({
        code: 'EQUIPMENT_ASSIGNMENT_FAILED',
        message: '持有裝備無法同時滿足可裝備性、裝備唯一性、制空與索敵條件。',
      })
    }
    return {
      status: 'no-solution',
      analysis: { reasons },
      elapsedMs: Date.now() - startedAt,
      solverVersion: SOLVER_VERSION,
    }
  }

  return {
    status: 'success',
    recommendations,
    elapsedMs: Date.now() - startedAt,
    solverVersion: SOLVER_VERSION,
  }
}
