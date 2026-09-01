import { calculateFleetMetrics, satisfiesCalculatedConstraints } from './metrics'
import { NORMAL_MAP_ROUTES, getRouteTemplates } from './rules'
import { recommendationMessages, recommendationTitle } from './solver/explanations'
import { analyzeFleetAvailability, generateFleetCandidates } from './solver/fleet-search'
import type { FleetSearchDiagnostics } from './solver/fleet-search'
import { buildGearSolutions, createGearSearchContext } from './solver/gear-search'
import { scoreFleet } from './solver/scoring'
import { hasZuiunMultiAngleAttack, isIseClassKaiNi } from './solver/zuiun'
import type { FleetSearchState } from './solver/internal-types'
import type {
  AccountSnapshot,
  FleetRecommendation,
  OwnedEquipment,
  RecommendFleetInput,
  RecommendFleetResult,
  RecommendedShipBuild,
  UnsatisfiedRequirement,
} from './types'

export const SOLVER_VERSION = '0.1.0'

const MIN_FLEETS_TO_EQUIP = 3
const MAX_FLEETS_TO_EQUIP = 18
const SUCCESSFUL_FLEETS_PER_ROUTE = 3
const AUTO_COMPARE_MIN_FLEETS_TO_EQUIP = 1
const AUTO_COMPARE_MAX_FLEETS_TO_EQUIP = 6
const AUTO_COMPARE_SUCCESSFUL_FLEETS_PER_ROUTE = 1
const SELECTED_ROUTE_MIN_FLEETS_TO_EQUIP = 1
const SELECTED_ROUTE_MAX_FLEETS_TO_EQUIP = 6
const SELECTED_ROUTE_SUCCESSFUL_FLEETS_PER_ROUTE = 1

const guidePriority = (recommendation: FleetRecommendation): number =>
  recommendation.route.tags.includes('guide-primary')
    ? 0
    : recommendation.route.tags.includes('guide-alternative')
      ? 1
      : 2

const routeTagCount = (tags: readonly string[], prefix: string): number => {
  const tag = tags.find((candidate) => candidate.startsWith(prefix))
  return tag ? Number(tag.slice(prefix.length)) || 0 : 0
}

const fleetSearchDiagnosticsSummary = (
  diagnosticsByRoute: ReadonlyMap<string, FleetSearchDiagnostics>,
) => {
  const diagnostics = [...diagnosticsByRoute.values()]
  return {
    fleetSearchEligibleShipCount: diagnostics.reduce(
      (total, item) => total + item.eligibleShipCount,
      0,
    ),
    fleetSearchCandidatePoolCount: diagnostics.reduce(
      (total, item) => total + item.candidatePoolCount,
      0,
    ),
    fleetSearchRequiredCandidateCount: diagnostics.reduce(
      (total, item) => total + item.requiredCandidateCount,
      0,
    ),
    fleetSearchInfeasiblePartialStateCount: diagnostics.reduce(
      (total, item) => total + item.infeasiblePartialStateCount,
      0,
    ),
    fleetSearchMaxDepth: diagnostics.reduce((maximum, item) => Math.max(maximum, item.maxDepth), 0),
    fleetSearchCompleteStateCount: diagnostics.reduce(
      (total, item) => total + item.completeStateCount,
      0,
    ),
    fleetSearchConstraintValidStateCount: diagnostics.reduce(
      (total, item) => total + item.constraintValidStateCount,
      0,
    ),
    fleetSearchSpecialAttackRejectedCount: diagnostics.reduce(
      (total, item) => total + item.specialAttackRejectedCount,
      0,
    ),
    fleetSearchZeroCandidateRouteCount: diagnostics.filter(
      (item) => item.constraintValidStateCount === 0,
    ).length,
  }
}

const currentLoadoutForFleet = (
  fleet: FleetSearchState,
  account: AccountSnapshot,
): readonly RecommendedShipBuild[] | null => {
  const memberIds = new Set(fleet.members.map(({ ship }) => ship.id))
  const matchesCurrentFleet = account.currentFleetShipIdGroups.some(
    (shipIds) =>
      shipIds.length === memberIds.size && shipIds.every((shipId) => memberIds.has(shipId)),
  )
  if (!matchesCurrentFleet) return null

  const equipmentById = new Map(account.equipment.map((gear) => [gear.id, gear]))
  const usedEquipmentIds = new Set<number>()
  let equippedItemCount = 0
  const builds: RecommendedShipBuild[] = []

  for (const member of fleet.members) {
    const equipment: (OwnedEquipment | null)[] = []
    for (const equipmentId of member.ship.equippedItemIds) {
      if (equipmentId === null) return null
      const gear = equipmentById.get(equipmentId)
      if (!gear || gear.currentlyEquippedBy !== member.ship.id || usedEquipmentIds.has(gear.id)) {
        return null
      }
      usedEquipmentIds.add(gear.id)
      equippedItemCount += 1
      equipment.push(gear)
    }

    const expansionEquipmentId = member.ship.expansionSlotItemId
    const expansionSlot =
      expansionEquipmentId === null ? null : (equipmentById.get(expansionEquipmentId) ?? null)
    if (
      expansionEquipmentId !== null &&
      (!expansionSlot ||
        expansionSlot.currentlyEquippedBy !== member.ship.id ||
        usedEquipmentIds.has(expansionSlot.id))
    ) {
      return null
    }
    if (expansionSlot) {
      usedEquipmentIds.add(expansionSlot.id)
      equippedItemCount += 1
    }
    builds.push({ ship: member.ship, role: member.role, equipment, expansionSlot })
  }

  return equippedItemCount > 0 ? builds : null
}

export const recommendFleet = (input: RecommendFleetInput): RecommendFleetResult => {
  const startedAt = Date.now()
  const routes = getRouteTemplates(input.mapId, input.objective, input.routeId)
  if (routes.length === 0) {
    if (input.routeId === undefined) {
      const matchingRoutes = NORMAL_MAP_ROUTES.filter(
        (route) => route.mapId === input.mapId && route.objectives.includes(input.objective),
      )
      const requiresStableBoss = ['balanced', 'boss-clear', 'low-cost'].includes(input.objective)
      const hasStableRoute = matchingRoutes.some((route) => route.stableBoss)
      if (matchingRoutes.length === 0) {
        return {
          status: 'error',
          error: { code: 'RULE_NOT_FOUND', message: '找不到指定關卡規則。' },
        }
      }
      return {
        status: 'error',
        error: {
          code: requiresStableBoss && !hasStableRoute ? 'NO_STABLE_ROUTE' : 'NO_AUTOMATED_ROUTE',
          message:
            requiresStableBoss && !hasStableRoute
              ? '這個關卡沒有可保證固定進王的已驗證編成。'
              : '這個關卡目前只有需要人工確認的編成，請明確選擇路線並依警告設定。',
        },
      }
    }
    return { status: 'error', error: { code: 'RULE_NOT_FOUND', message: '找不到指定關卡規則。' } }
  }

  const routeAvailability = routes.map((route) => ({
    route,
    reasons: analyzeFleetAvailability(input.account, route),
  }))
  const availableRoutes = routeAvailability.filter(({ reasons }) => reasons.length === 0)
  if (availableRoutes.length === 0) {
    const reasons = routeAvailability.flatMap(({ reasons }) => reasons)
    return {
      status: 'no-solution',
      analysis: { reasons },
      diagnostics: {
        routeCandidateCount: routes.length,
        availableRouteCount: 0,
        ...fleetSearchDiagnosticsSummary(new Map()),
        evaluatedFleetCandidateCount: 0,
        gearSolutionCount: 0,
        currentFleetShipCount: input.account.currentFleetShipIds.length,
        currentLoadoutCandidateCount: 0,
        currentLoadoutAcceptedCount: 0,
        currentLoadoutBestAirPower: null,
        currentLoadoutBestLos: null,
        recommendationCandidateCount: 0,
        bestAirPower: 0,
        airPowerMinimum: null,
        bestLos: null,
        losMinimum: null,
        bestOpeningAsw: 0,
        openingAswMinimum: null,
        zuiunCutInCandidateCount: 0,
        zuiunCutInFallbackCandidateCount: 0,
        reasonCodes: [...new Set(reasons.map(({ code }) => code))],
      },
      elapsedMs: Date.now() - startedAt,
      solverVersion: SOLVER_VERSION,
    }
  }

  const recommendationCandidates: FleetRecommendation[] = []
  let bestAirPower = 0
  let bestLos = Number.NEGATIVE_INFINITY
  let bestOpeningAsw = 0
  let speedRequirementFailed = false
  let nightCarrierRequirementFailed = false
  let antiInstallationRequirementFailed = false
  let antiInstallationShellMinimum = Number.POSITIVE_INFINITY
  let antiInstallationCarrierRequirementFailed = false
  let drumCanisterRequirementFailed = false
  let drumCanisterCarrierMinimum = Number.POSITIVE_INFINITY
  let specialAttackRequirementFailed = false
  let evaluatedFleetCandidateCount = 0
  let gearSolutionCount = 0
  let currentLoadoutCandidateCount = 0
  let currentLoadoutAcceptedCount = 0
  let currentLoadoutBestAirPower: number | null = null
  let currentLoadoutBestLos: number | null = null
  let zuiunCutInCandidateCount = 0
  let zuiunCutInFallbackCandidateCount = 0
  const fleetSearchDiagnosticsByRoute = new Map<string, FleetSearchDiagnostics>()
  const avoidCurrentFleetEquipment = input.preferences?.avoidCurrentFleetEquipment ?? false
  const gearSearchContext = createGearSearchContext(input.account, avoidCurrentFleetEquipment)
  const successfulFleetSignatures = new Set<string>()
  const candidateLimit = Math.min(Math.max(Math.trunc(input.candidateLimit ?? 3), 3), 24)
  const selectedRouteFastPath = input.routeId !== undefined && candidateLimit <= 3

  const searchRoutes = ({
    minimumFleetCount,
    maximumFleetCount,
    successfulFleetTarget,
    diagnoseSpecialFailures,
    globalSuccessfulFleetTarget,
  }: {
    minimumFleetCount: number
    maximumFleetCount: number
    successfulFleetTarget: number
    diagnoseSpecialFailures: boolean
    globalSuccessfulFleetTarget?: number
  }): void => {
    for (const [routeIndex, { route }] of availableRoutes.entries()) {
      if (
        globalSuccessfulFleetTarget !== undefined &&
        successfulFleetSignatures.size >= globalSuccessfulFleetTarget
      ) {
        break
      }
      const fleetSearch = generateFleetCandidates(
        input.account,
        route,
        input.objective,
        selectedRouteFastPath ? input.account.currentFleetShipIds : [],
        selectedRouteFastPath ? input.account.currentFleetShipIdGroups : [],
      )
      const fleetCandidates = fleetSearch.candidates
      fleetSearchDiagnosticsByRoute.set(route.id, fleetSearch.diagnostics)
      if (route.tags.includes('special-attack-modeled') && fleetCandidates.length === 0) {
        specialAttackRequirementFailed = true
      }
      const airPowerConstraint = route.calculatedConstraints.find(
        (constraint) => constraint.kind === 'air-power',
      )
      const airPowerMinimum = airPowerConstraint?.minimum ?? null
      const losRequired = route.calculatedConstraints.some(
        (constraint) => constraint.kind === 'los',
      )
      const fastPlusRequired = route.tags.includes('fast+')
      const antiInstallationShellCount = routeTagCount(
        route.tags,
        'anti-installation-type3-shells-',
      )
      const antiInstallationSurfaceCount = routeTagCount(
        route.tags,
        'anti-installation-surface-gears-',
      )
      const antiInstallationCarrierCount = routeTagCount(route.tags, 'anti-installation-carriers-')
      const drumCanisterCarrierCount = routeTagCount(route.tags, 'drum-canister-carriers-')
      const bbvSeaplaneLosPriority = route.tags.includes('bbv-seaplane-los-priority')
      const bbvSeaplaneAirPriority = route.tags.includes('bbv-seaplane-air-priority')
      const surfaceSeaplaneAirPriority = route.tags.includes('surface-seaplane-air-priority')
      const flexibleCarrierAirPriority = route.tags.includes('flexible-carrier-air-priority')
      const nightCarrierRequired = route.tags.includes('night-carrier')
      const submarineSeaplaneAirControl = route.tags.includes('submarine-seaplane-air-control')
      const submarineLosPriority = route.tags.includes('submarine-los-priority')
      const mayaAaciPreferred = route.tags.includes('guide-prefer-maya-aaci')
      const zuiunCutInPreferred = route.tags.includes('ise-class-zuiun-cut-in-preferred')
      const openingTorpedoPreferred = route.tags.includes('opening-torpedo-preferred')
      const failedSpecialFleets = []
      const failedGearFleets = []
      let successfulFleetCount = 0

      for (
        let fleetIndex = 0;
        fleetIndex < Math.min(fleetCandidates.length, maximumFleetCount);
        fleetIndex += 1
      ) {
        const fleet = fleetCandidates[fleetIndex]
        evaluatedFleetCandidateCount += 1
        const searchedGearSolutions = buildGearSolutions(
          fleet,
          gearSearchContext,
          airPowerMinimum,
          fastPlusRequired,
          antiInstallationShellCount,
          antiInstallationSurfaceCount,
          nightCarrierRequired,
          antiInstallationCarrierCount,
          flexibleCarrierAirPriority,
          drumCanisterCarrierCount,
          bbvSeaplaneLosPriority,
          bbvSeaplaneAirPriority,
          surfaceSeaplaneAirPriority,
          losRequired,
          submarineSeaplaneAirControl,
          submarineLosPriority,
          mayaAaciPreferred,
          zuiunCutInPreferred,
          openingTorpedoPreferred,
        )
        const currentLoadout =
          input.routeId === undefined ? null : currentLoadoutForFleet(fleet, input.account)
        if (currentLoadout) currentLoadoutCandidateCount += 1
        const gearSolutions = currentLoadout
          ? [currentLoadout, ...searchedGearSolutions]
          : searchedGearSolutions
        gearSolutionCount += gearSolutions.length
        if (gearSolutions.length === 0) failedGearFleets.push(fleet)
        if (gearSolutions.length === 0 && (fastPlusRequired || nightCarrierRequired)) {
          failedSpecialFleets.push(fleet)
        }
        let fleetAccepted = false
        gearSolutions.forEach((builds, gearIndex) => {
          if (
            input.routeId === undefined &&
            builds.some((build) => build.equipment.some((gear) => gear === null))
          ) {
            return
          }
          const metrics = calculateFleetMetrics(builds, route, input.account.hqLevel)
          bestAirPower = Math.max(bestAirPower, metrics.airPower)
          bestLos = Math.max(bestLos, metrics.los33)
          bestOpeningAsw = Math.max(bestOpeningAsw, metrics.openingAswCount)
          if (currentLoadout && gearIndex === 0) {
            currentLoadoutBestAirPower = Math.max(
              currentLoadoutBestAirPower ?? Number.NEGATIVE_INFINITY,
              metrics.airPower,
            )
            currentLoadoutBestLos = Math.max(
              currentLoadoutBestLos ?? Number.NEGATIVE_INFINITY,
              metrics.los33,
            )
          }
          const wrongSpeed =
            (fastPlusRequired && !['fast+', 'fastest'].includes(metrics.finalSpeedClass)) ||
            (route.tags.includes('fast') && metrics.finalSpeedClass === 'slow') ||
            (route.tags.includes('slow') && metrics.finalSpeedClass !== 'slow')
          if (wrongSpeed) {
            speedRequirementFailed = true
            return
          }
          if (!satisfiesCalculatedConstraints(metrics)) return
          if (currentLoadout && gearIndex === 0) currentLoadoutAcceptedCount += 1
          const score = scoreFleet(builds, metrics, input.objective, route)
          const messages = recommendationMessages(builds, metrics, route)
          if (zuiunCutInPreferred) {
            const iseClassKaiNiBuild = builds.find((build) => isIseClassKaiNi(build.ship))
            if (iseClassKaiNiBuild) {
              if (hasZuiunMultiAngleAttack(iseClassKaiNiBuild)) {
                zuiunCutInCandidateCount += 1
              } else {
                zuiunCutInFallbackCandidateCount += 1
              }
            }
          }
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
        if (fleetAccepted) {
          successfulFleetCount += 1
          successfulFleetSignatures.add(
            `${route.id}:${fleet.members.map(({ ship }) => ship.id).join('-')}`,
          )
        }
        if (fleetIndex + 1 >= minimumFleetCount && successfulFleetCount >= successfulFleetTarget) {
          break
        }
      }

      if (diagnoseSpecialFailures && successfulFleetCount === 0 && failedSpecialFleets.length > 0) {
        if (fastPlusRequired && nightCarrierRequired) {
          const speedOnlyAvailable = failedSpecialFleets.some(
            (fleet) =>
              buildGearSolutions(
                fleet,
                gearSearchContext,
                airPowerMinimum,
                true,
                antiInstallationShellCount,
                antiInstallationSurfaceCount,
                false,
                antiInstallationCarrierCount,
                flexibleCarrierAirPriority,
                drumCanisterCarrierCount,
                bbvSeaplaneLosPriority,
                bbvSeaplaneAirPriority,
                surfaceSeaplaneAirPriority,
                losRequired,
                submarineSeaplaneAirControl,
                submarineLosPriority,
                mayaAaciPreferred,
                zuiunCutInPreferred,
                openingTorpedoPreferred,
              ).length > 0,
          )
          if (speedOnlyAvailable) nightCarrierRequirementFailed = true
          else speedRequirementFailed = true
        } else {
          if (fastPlusRequired) speedRequirementFailed = true
          if (nightCarrierRequired) nightCarrierRequirementFailed = true
        }
      }
      if (
        diagnoseSpecialFailures &&
        successfulFleetCount === 0 &&
        failedGearFleets.length > 0 &&
        (antiInstallationShellCount > 0 ||
          antiInstallationSurfaceCount > 0 ||
          antiInstallationCarrierCount > 0)
      ) {
        const canBuildWithoutAntiInstallation = failedGearFleets.some(
          (fleet) =>
            buildGearSolutions(
              fleet,
              gearSearchContext,
              airPowerMinimum,
              fastPlusRequired,
              0,
              0,
              nightCarrierRequired,
              0,
              flexibleCarrierAirPriority,
              drumCanisterCarrierCount,
              bbvSeaplaneLosPriority,
              bbvSeaplaneAirPriority,
              surfaceSeaplaneAirPriority,
              losRequired,
              submarineSeaplaneAirControl,
              submarineLosPriority,
              mayaAaciPreferred,
              zuiunCutInPreferred,
              openingTorpedoPreferred,
            ).length > 0,
        )
        const canBuildShellSetup = failedGearFleets.some(
          (fleet) =>
            buildGearSolutions(
              fleet,
              gearSearchContext,
              airPowerMinimum,
              fastPlusRequired,
              antiInstallationShellCount,
              antiInstallationSurfaceCount,
              nightCarrierRequired,
              0,
              flexibleCarrierAirPriority,
              drumCanisterCarrierCount,
              bbvSeaplaneLosPriority,
              bbvSeaplaneAirPriority,
              surfaceSeaplaneAirPriority,
              losRequired,
              submarineSeaplaneAirControl,
              submarineLosPriority,
              mayaAaciPreferred,
              zuiunCutInPreferred,
              openingTorpedoPreferred,
            ).length > 0,
        )
        if (
          (antiInstallationShellCount > 0 || antiInstallationSurfaceCount > 0) &&
          canBuildWithoutAntiInstallation &&
          !canBuildShellSetup
        ) {
          antiInstallationRequirementFailed = true
          antiInstallationShellMinimum = Math.min(
            antiInstallationShellMinimum,
            antiInstallationShellCount + antiInstallationSurfaceCount,
          )
        }
        if (antiInstallationCarrierCount > 0 && canBuildShellSetup) {
          antiInstallationCarrierRequirementFailed = true
        }
      }
      if (
        diagnoseSpecialFailures &&
        successfulFleetCount === 0 &&
        failedGearFleets.length > 0 &&
        drumCanisterCarrierCount > 0 &&
        failedGearFleets.some(
          (fleet) =>
            buildGearSolutions(
              fleet,
              gearSearchContext,
              airPowerMinimum,
              fastPlusRequired,
              antiInstallationShellCount,
              antiInstallationSurfaceCount,
              nightCarrierRequired,
              antiInstallationCarrierCount,
              flexibleCarrierAirPriority,
              0,
              bbvSeaplaneLosPriority,
              bbvSeaplaneAirPriority,
              surfaceSeaplaneAirPriority,
              losRequired,
              submarineSeaplaneAirControl,
              submarineLosPriority,
              mayaAaciPreferred,
              zuiunCutInPreferred,
              openingTorpedoPreferred,
            ).length > 0,
        )
      ) {
        drumCanisterRequirementFailed = true
        drumCanisterCarrierMinimum = Math.min(drumCanisterCarrierMinimum, drumCanisterCarrierCount)
      }
    }
  }

  const autoComparingRoutes = input.routeId === undefined && availableRoutes.length > 1
  if (autoComparingRoutes) {
    searchRoutes({
      minimumFleetCount: AUTO_COMPARE_MIN_FLEETS_TO_EQUIP,
      maximumFleetCount: AUTO_COMPARE_MAX_FLEETS_TO_EQUIP,
      successfulFleetTarget: AUTO_COMPARE_SUCCESSFUL_FLEETS_PER_ROUTE,
      diagnoseSpecialFailures: false,
    })
    if (successfulFleetSignatures.size < 3) {
      searchRoutes({
        minimumFleetCount: MIN_FLEETS_TO_EQUIP,
        maximumFleetCount: MAX_FLEETS_TO_EQUIP,
        successfulFleetTarget: SUCCESSFUL_FLEETS_PER_ROUTE,
        diagnoseSpecialFailures: true,
        globalSuccessfulFleetTarget: 3,
      })
    }
  } else {
    searchRoutes({
      minimumFleetCount: selectedRouteFastPath
        ? SELECTED_ROUTE_MIN_FLEETS_TO_EQUIP
        : MIN_FLEETS_TO_EQUIP,
      maximumFleetCount: selectedRouteFastPath
        ? SELECTED_ROUTE_MAX_FLEETS_TO_EQUIP
        : MAX_FLEETS_TO_EQUIP,
      successfulFleetTarget: selectedRouteFastPath
        ? SELECTED_ROUTE_SUCCESSFUL_FLEETS_PER_ROUTE
        : SUCCESSFUL_FLEETS_PER_ROUTE,
      diagnoseSpecialFailures: true,
    })
  }

  const keepGearVariants = candidateLimit > 3
  const seenFleets = new Set<string>()
  const rankedRecommendations = recommendationCandidates
    .sort(
      (left, right) =>
        guidePriority(left) - guidePriority(right) ||
        right.score.total - left.score.total ||
        left.ships
          .map((build) => build.ship.id)
          .join('-')
          .localeCompare(right.ships.map((build) => build.ship.id).join('-')),
    )
    .filter((recommendation) => {
      const signature = `${recommendation.route.id}:${recommendation.ships
        .map((build) =>
          keepGearVariants
            ? `${build.ship.id}[${build.equipment.map((gear) => gear?.id ?? 0).join(',')};${build.expansionSlot?.id ?? 0}]`
            : build.ship.id,
        )
        .join('-')}`
      if (seenFleets.has(signature)) return false
      seenFleets.add(signature)
      return true
    })
  const selectedRecommendations: FleetRecommendation[] = []
  const selectedRouteIds = new Set<string>()
  rankedRecommendations.forEach((recommendation) => {
    if (
      selectedRecommendations.length >= Math.min(3, candidateLimit) ||
      selectedRouteIds.has(recommendation.route.id)
    ) {
      return
    }
    selectedRecommendations.push(recommendation)
    selectedRouteIds.add(recommendation.route.id)
  })
  rankedRecommendations.forEach((recommendation) => {
    if (
      selectedRecommendations.length >= candidateLimit ||
      selectedRecommendations.includes(recommendation)
    ) {
      return
    }
    selectedRecommendations.push(recommendation)
  })
  const recommendations = selectedRecommendations.map((recommendation, index) => ({
    ...recommendation,
    title: recommendationTitle(recommendation.route.name, input.objective, index),
  }))
  const fleetSearchSummary = fleetSearchDiagnosticsSummary(fleetSearchDiagnosticsByRoute)

  if (recommendations.length === 0) {
    const reasons: UnsatisfiedRequirement[] = []
    const airMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints
        .filter((item) => item.kind === 'air-power' && item.required !== false)
        .map((item) => item.minimum),
    )
    const losMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints.filter((item) => item.kind === 'los').map((item) => item.minimum),
    )
    const openingAswMinimums = availableRoutes.flatMap(({ route }) =>
      route.calculatedConstraints
        .filter((item) => item.kind === 'opening-asw')
        .map((item) => item.minimum),
    )
    const airMinimum = airMinimums.length > 0 ? Math.min(...airMinimums) : null
    const losMinimum = losMinimums.length > 0 ? Math.min(...losMinimums) : null
    const openingAswMinimum = openingAswMinimums.length > 0 ? Math.min(...openingAswMinimums) : null
    if (evaluatedFleetCandidateCount === 0) {
      reasons.push({
        code: 'FLEET_CANDIDATE_SEARCH_EXHAUSTED',
        message: '帳號艦娘數量看似足夠，但候選搜尋未找到同時滿足指定艦、艦種與帶路條件的完整艦隊。',
        values: {
          eligible: fleetSearchSummary.fleetSearchEligibleShipCount,
          candidatePool: fleetSearchSummary.fleetSearchCandidatePoolCount,
          requiredCandidates: fleetSearchSummary.fleetSearchRequiredCandidateCount,
          maxDepth: fleetSearchSummary.fleetSearchMaxDepth,
        },
      })
    }
    if (gearSolutionCount > 0 && airMinimum !== null && bestAirPower < airMinimum) {
      reasons.push({
        code: 'AIR_POWER_INSUFFICIENT',
        message: `目前搜尋到的最高制空值為 ${bestAirPower}，最低需要 ${airMinimum}。`,
        values: { best: bestAirPower, minimum: airMinimum },
      })
    }
    if (gearSolutionCount > 0 && losMinimum !== null && bestLos < losMinimum) {
      reasons.push({
        code: 'LOS_INSUFFICIENT',
        message: `目前搜尋到的最高 33 式索敵為 ${Math.max(bestLos, 0).toFixed(1)}，最低需要 ${losMinimum}。`,
        values: { best: Math.max(bestLos, 0).toFixed(1), minimum: losMinimum },
      })
    }
    if (gearSolutionCount > 0 && openingAswMinimum !== null && bestOpeningAsw < openingAswMinimum) {
      reasons.push({
        code: 'OASW_INSUFFICIENT',
        message: `目前方案可成立的先制對潛艦為 ${bestOpeningAsw} 艘，最低需要 ${openingAswMinimum} 艘。`,
        values: { best: bestOpeningAsw, minimum: openingAswMinimum },
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
    if (antiInstallationRequirementFailed) {
      const minimum = Number.isFinite(antiInstallationShellMinimum)
        ? antiInstallationShellMinimum
        : 3
      reasons.push({
        code: 'ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
        message: `目前無法為 ${minimum} 艘可用的戰艦／重巡級各配置一件三式彈系裝備。`,
        values: { minimum },
      })
    }
    if (antiInstallationCarrierRequirementFailed) {
      reasons.push({
        code: 'ANTI_INSTALLATION_CARRIER_AIRCRAFT_INSUFFICIENT',
        message: '目前無法讓路線要求的所有空母同時保有對陸攻擊能力與制空配置。',
      })
    }
    if (drumCanisterRequirementFailed) {
      const minimum = Number.isFinite(drumCanisterCarrierMinimum) ? drumCanisterCarrierMinimum : 2
      reasons.push({
        code: 'DRUM_CANISTER_EQUIPMENT_INSUFFICIENT',
        message: `目前無法為 ${minimum} 艘可用艦娘各配置一個運輸桶，無法保證路線分歧。`,
        values: { minimum },
      })
    }
    if (specialAttackRequirementFailed) {
      reasons.push({
        code: 'SPECIAL_ATTACK_UNAVAILABLE',
        message:
          '目前沒有可成立的特殊砲擊組合；需要大和改二／重＋武藏改二、長門／陸奧改二＋戰艦，或 Nelson／Rodney 改與兩艘可參與艦。',
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
      diagnostics: {
        routeCandidateCount: routes.length,
        availableRouteCount: availableRoutes.length,
        ...fleetSearchSummary,
        evaluatedFleetCandidateCount,
        gearSolutionCount,
        currentFleetShipCount: input.account.currentFleetShipIds.length,
        currentLoadoutCandidateCount,
        currentLoadoutAcceptedCount,
        currentLoadoutBestAirPower,
        currentLoadoutBestLos,
        recommendationCandidateCount: recommendationCandidates.length,
        bestAirPower,
        airPowerMinimum: airMinimum,
        bestLos: Number.isFinite(bestLos) ? bestLos : null,
        losMinimum,
        bestOpeningAsw,
        openingAswMinimum,
        zuiunCutInCandidateCount,
        zuiunCutInFallbackCandidateCount,
        reasonCodes: [...new Set(reasons.map(({ code }) => code))],
      },
      elapsedMs: Date.now() - startedAt,
      solverVersion: SOLVER_VERSION,
    }
  }

  return {
    status: 'success',
    recommendations,
    diagnostics: {
      routeCandidateCount: routes.length,
      availableRouteCount: availableRoutes.length,
      ...fleetSearchSummary,
      evaluatedFleetCandidateCount,
      gearSolutionCount,
      currentFleetShipCount: input.account.currentFleetShipIds.length,
      currentLoadoutCandidateCount,
      currentLoadoutAcceptedCount,
      currentLoadoutBestAirPower,
      currentLoadoutBestLos,
      recommendationCandidateCount: recommendationCandidates.length,
      bestAirPower,
      airPowerMinimum:
        availableRoutes
          .flatMap(({ route }) =>
            route.calculatedConstraints
              .filter((constraint) => constraint.kind === 'air-power')
              .map((constraint) => constraint.minimum),
          )
          .sort((left, right) => left - right)[0] ?? null,
      bestLos: Number.isFinite(bestLos) ? bestLos : null,
      losMinimum:
        availableRoutes
          .flatMap(({ route }) =>
            route.calculatedConstraints
              .filter((constraint) => constraint.kind === 'los')
              .map((constraint) => constraint.minimum),
          )
          .sort((left, right) => left - right)[0] ?? null,
      bestOpeningAsw,
      openingAswMinimum:
        availableRoutes
          .flatMap(({ route }) =>
            route.calculatedConstraints
              .filter((constraint) => constraint.kind === 'opening-asw')
              .map((constraint) => constraint.minimum),
          )
          .sort((left, right) => left - right)[0] ?? null,
      zuiunCutInCandidateCount,
      zuiunCutInFallbackCandidateCount,
      reasonCodes: [],
    },
    elapsedMs: Date.now() - startedAt,
    solverVersion: SOLVER_VERSION,
  }
}
