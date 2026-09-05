import {
  getMapOptions,
  getRouteTemplates,
  scoreFleet,
} from '@kancolle-assistant/recommendation-core'
import { toRecommendationRendererResult } from './presentation'
const EXACT_COMBAT_CANDIDATE_LIMIT = 18
const SELECTED_ROUTE_CANDIDATE_LIMIT = 3
const errorResult = (code, message) => ({ status: 'error', error: { code, message } })
const sanitizedErrorMessage = (error) =>
  String(error?.message || error)
    .replace(/\s+/g, ' ')
    .slice(0, 240)
const recommendationLogContext = (parsedRequest) => ({
  mapId: parsedRequest.mapId,
  objective: parsedRequest.objective,
  routeId: parsedRequest.routeId ?? null,
})
const guidePriority = (recommendation) =>
  recommendation.route.tags.includes('guide-primary')
    ? 0
    : recommendation.route.tags.includes('guide-alternative')
      ? 1
      : 2

const GUIDE_OBJECTIVE_PRIORITY = [
  'balanced',
  'boss-clear',
  'low-cost',
  'leveling',
  'resource-fuel',
  'resource-bauxite',
  'resource-burner',
  'resource-ammo',
  'resource-steel',
  'resource-bucket',
  'resource-devmat',
]

const routeObjective = (route) =>
  GUIDE_OBJECTIVE_PRIORITY.find((objective) => route.objectives?.includes(objective)) ??
  route.objectives?.[0] ??
  'balanced'

export const applyCombatEvaluations = (
  result,
  evaluations,
  objective,
  { logger = () => {}, logContext = {}, elapsedMs = 0 } = {},
) => {
  if (!Array.isArray(evaluations)) throw new Error('KC3 combat evaluation result is invalid')
  const evaluationsById = new Map(evaluations.map((evaluation) => [evaluation.id, evaluation]))
  const openingAswCandidates = []
  const enriched = result.recommendations.map((recommendation) => {
    const evaluation = evaluationsById.get(recommendation.id)
    if (!evaluation || evaluation.ships.length !== recommendation.ships.length) {
      throw new Error(`KC3 combat evaluation is incomplete: ${recommendation.id}`)
    }
    const ships = recommendation.ships.map((build, index) => ({
      ...build,
      combat: evaluation?.ships[index],
    }))
    const exactOpeningAswCount = evaluation.ships.filter(
      (ship) => ship?.openingAswCapable === true,
    ).length
    const metrics = recommendation.metrics.openingAswRequired
      ? { ...recommendation.metrics, openingAswCount: exactOpeningAswCount }
      : recommendation.metrics
    if (metrics.openingAswRequired) {
      openingAswCandidates.push({
        routeId: recommendation.route.id,
        count: exactOpeningAswCount,
        minimum: metrics.openingAswMinimum,
      })
    }
    return {
      ...recommendation,
      ships,
      metrics,
      score: scoreFleet(ships, metrics, objective, recommendation.route),
      reasons: [
        ...recommendation.reasons,
        {
          code: 'KC3_COMBAT_EVALUATION_APPLIED',
          message: 'KC3 已依完整配裝複算裝備加成與有效戰鬥力。',
        },
      ],
    }
  })
  const eligible = enriched.filter(
    (recommendation) =>
      !recommendation.metrics.openingAswRequired ||
      recommendation.metrics.openingAswCount >= recommendation.metrics.openingAswMinimum,
  )
  if (openingAswCandidates.length > 0) {
    const rejectedCandidateCount = openingAswCandidates.filter(
      ({ count, minimum }) => count < minimum,
    ).length
    const qualifyingCandidateCount = openingAswCandidates.length - rejectedCandidateCount
    logger('recommendation.oasw-loadout-validation-completed', {
      ...logContext,
      operation: 'validate-complete-opening-asw-loadouts',
      candidateCount: openingAswCandidates.length,
      evaluatedShipCount: evaluations.reduce(
        (total, evaluation) => total + evaluation.ships.length,
        0,
      ),
      qualifyingCandidateCount,
      rejectedCandidateCount,
      bestObservedOpeningAsw: Math.max(...openingAswCandidates.map(({ count }) => count)),
      requiredMinimum: Math.min(...openingAswCandidates.map(({ minimum }) => minimum)),
      routeIds: [...new Set(openingAswCandidates.map(({ routeId }) => routeId))],
      selectedBranch: 'kc3-complete-loadout',
      outcome:
        qualifyingCandidateCount > 0
          ? 'passed'
          : eligible.length > 0
            ? 'oasw-rejected-non-oasw-remains'
            : 'rejected-all',
      reasonCodes: rejectedCandidateCount > 0 ? ['OASW_INSUFFICIENT'] : [],
      elapsedMs,
    })
  }
  if (enriched.length > 0 && eligible.length === 0) {
    const best = Math.max(...openingAswCandidates.map(({ count }) => count), 0)
    const minimum = Math.min(...openingAswCandidates.map(({ minimum }) => minimum))
    const reason = {
      code: 'OASW_INSUFFICIENT',
      message: `KC3 依完整配裝驗證後，先制對潛可成立 ${best} 艘，最低需要 ${minimum} 艘。`,
      values: { best, minimum },
    }
    return {
      status: 'no-solution',
      analysis: { reasons: [reason] },
      diagnostics: {
        ...(result.diagnostics ?? {}),
        recommendationCandidateCount: 0,
        bestOpeningAsw: best,
        openingAswMinimum: minimum,
        reasonCodes: [...new Set([...(result.diagnostics?.reasonCodes ?? []), reason.code])],
      },
      elapsedMs: result.elapsedMs,
      solverVersion: result.solverVersion,
    }
  }
  const seenFleets = new Set()
  const ranked = eligible
    .sort(
      (left, right) =>
        guidePriority(left) - guidePriority(right) ||
        right.score.total - left.score.total ||
        left.id.localeCompare(right.id),
    )
    .filter((recommendation) => {
      const signature = `${recommendation.route.id}:${recommendation.ships
        .map((build) => build.ship.id)
        .join('-')}`
      if (seenFleets.has(signature)) return false
      seenFleets.add(signature)
      return true
    })
  const selected = []
  const selectedRouteIds = new Set()
  ranked.forEach((recommendation) => {
    if (selected.length >= 3 || selectedRouteIds.has(recommendation.route.id)) return
    selected.push(recommendation)
    selectedRouteIds.add(recommendation.route.id)
  })
  ranked.forEach((recommendation) => {
    if (selected.length >= 3 || selected.includes(recommendation)) return
    selected.push(recommendation)
  })
  return { ...result, recommendations: selected }
}

const slowestRecommendationPhase = (timings) =>
  Object.entries(timings).reduce(
    (slowest, [phase, elapsedMs]) =>
      elapsedMs > slowest.elapsedMs ? { phase, elapsedMs } : slowest,
    { phase: 'unknown', elapsedMs: 0 },
  )

export const createRecommendationCalculation =
  ({ recommend, logger, readCombatEvaluations, recommendationSlowThresholdMs }) =>
  async ({ parsedRequest, snapshot, target }) => {
    let result
    const requestStartedAt = Date.now()
    let solverElapsedMs = 0
    let exactCombatElapsedMs = 0
    const selectedRouteNeedsExactOpeningAsw = getRouteTemplates(
      parsedRequest.mapId,
      parsedRequest.objective,
      parsedRequest.routeId,
    ).some((route) =>
      route.calculatedConstraints.some((constraint) => constraint.kind === 'opening-asw'),
    )
    const candidateLimit =
      !parsedRequest.routeId || selectedRouteNeedsExactOpeningAsw
        ? EXACT_COMBAT_CANDIDATE_LIMIT
        : SELECTED_ROUTE_CANDIDATE_LIMIT
    try {
      const solverStartedAt = Date.now()
      result = await recommend({
        ...parsedRequest,
        account: snapshot,
        candidateLimit,
      })
      solverElapsedMs = Date.now() - solverStartedAt
      if (result.status === 'success') {
        try {
          const exactCombatStartedAt = Date.now()
          const evaluations = await readCombatEvaluations(
            target,
            result.recommendations,
            snapshot.generatedAt,
          )
          exactCombatElapsedMs = Date.now() - exactCombatStartedAt
          result = applyCombatEvaluations(result, evaluations, parsedRequest.objective, {
            logger,
            logContext: recommendationLogContext(parsedRequest),
            elapsedMs: exactCombatElapsedMs,
          })
        } catch (error) {
          const exactOpeningAswCandidateCount = result.recommendations.filter(
            (recommendation) => recommendation.metrics.openingAswRequired,
          ).length
          const fallbackRecommendations = result.recommendations
            .filter((recommendation) => !recommendation.metrics.openingAswRequired)
            .slice(0, 3)
          logger('recommendation.combat-evaluation-failed', {
            ...recommendationLogContext(parsedRequest),
            operation: 'evaluate-complete-loadouts',
            candidateCount: result.recommendations.length,
            exactOpeningAswCandidateCount,
            affectedCandidateCount: result.recommendations.length,
            fallbackResult:
              fallbackRecommendations.length > 0
                ? 'non-oasw-solver-ranking'
                : 'error-no-unverified-oasw-output',
            reasonCodes: ['KC3_COMBAT_EVALUATION_FAILED'],
            message: sanitizedErrorMessage(error),
          })
          result =
            fallbackRecommendations.length > 0
              ? { ...result, recommendations: fallbackRecommendations }
              : errorResult(
                  'KC3_COMBAT_EVALUATION_FAILED',
                  'KC3 無法驗證完成配裝的先制對潛條件，請重新同步後再試。',
                )
        }
      }
    } catch (error) {
      const message = error?.message || String(error)
      if (message.includes('timed out')) {
        return errorResult(
          'RECOMMENDATION_TIMEOUT',
          '推薦計算逾時，請確認參考路線複雜度或重新同步後再試。',
        )
      }
      logger('recommendation.failed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        message,
      })
      return errorResult('SOLVER_FAILED', '推薦計算失敗，請稍後再試。')
    }
    if (result.status !== 'error') {
      const totalElapsedMs = Date.now() - requestStartedAt
      const timings = {
        solverElapsedMs,
        exactCombatElapsedMs,
      }
      const slowestPhase = slowestRecommendationPhase(timings)
      const routeCount =
        getMapOptions()
          .find((map) => map.id === parsedRequest.mapId)
          ?.routes.filter(
            (route) =>
              route.objectives.includes(parsedRequest.objective) &&
              (!parsedRequest.routeId || route.id === parsedRequest.routeId),
          ).length ?? 0
      const diagnostics = result.diagnostics ?? {}
      logger('recommendation.completed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        routeId: parsedRequest.routeId ?? null,
        searchMode: parsedRequest.routeId ? 'selected-route' : 'auto-compare',
        routeCount,
        status: result.status,
        elapsedMs: result.elapsedMs,
        solverElapsedMs,
        exactCombatElapsedMs,
        totalElapsedMs,
        slowestPhase: slowestPhase.phase,
        slowestPhaseElapsedMs: slowestPhase.elapsedMs,
        recommendationCount: result.status === 'success' ? result.recommendations.length : 0,
        routeCandidateCount: diagnostics.routeCandidateCount ?? routeCount,
        availableRouteCount: diagnostics.availableRouteCount ?? null,
        fleetSearchEligibleShipCount: diagnostics.fleetSearchEligibleShipCount ?? 0,
        fleetSearchCandidatePoolCount: diagnostics.fleetSearchCandidatePoolCount ?? 0,
        fleetSearchRequiredCandidateCount: diagnostics.fleetSearchRequiredCandidateCount ?? 0,
        fleetSearchInfeasiblePartialStateCount:
          diagnostics.fleetSearchInfeasiblePartialStateCount ?? 0,
        fleetSearchMaxDepth: diagnostics.fleetSearchMaxDepth ?? 0,
        fleetSearchCompleteStateCount: diagnostics.fleetSearchCompleteStateCount ?? 0,
        fleetSearchConstraintValidStateCount: diagnostics.fleetSearchConstraintValidStateCount ?? 0,
        fleetSearchSpecialAttackRejectedCount:
          diagnostics.fleetSearchSpecialAttackRejectedCount ?? 0,
        fleetSearchZeroCandidateRouteCount: diagnostics.fleetSearchZeroCandidateRouteCount ?? 0,
        evaluatedFleetCandidateCount: diagnostics.evaluatedFleetCandidateCount ?? null,
        gearSolutionCount: diagnostics.gearSolutionCount ?? null,
        currentFleetShipCount: diagnostics.currentFleetShipCount ?? 0,
        currentLoadoutCandidateCount: diagnostics.currentLoadoutCandidateCount ?? 0,
        currentLoadoutAcceptedCount: diagnostics.currentLoadoutAcceptedCount ?? 0,
        currentLoadoutBestAirPower: diagnostics.currentLoadoutBestAirPower ?? null,
        currentLoadoutBestLos: diagnostics.currentLoadoutBestLos ?? null,
        currentFleetComparisonRouteCount: diagnostics.currentFleetComparisonRouteCount ?? 0,
        currentFleetAlternativeCandidateCount:
          diagnostics.currentFleetAlternativeCandidateCount ?? 0,
        currentFleetAlternativeAcceptedCount: diagnostics.currentFleetAlternativeAcceptedCount ?? 0,
        recommendationCandidateCount: diagnostics.recommendationCandidateCount ?? null,
        bestAirPower: diagnostics.bestAirPower ?? null,
        airPowerMinimum: diagnostics.airPowerMinimum ?? null,
        bestLos: diagnostics.bestLos ?? null,
        losMinimum: diagnostics.losMinimum ?? null,
        bestOpeningAsw: diagnostics.bestOpeningAsw ?? null,
        openingAswMinimum: diagnostics.openingAswMinimum ?? null,
        zuiunCutInCandidateCount: diagnostics.zuiunCutInCandidateCount ?? 0,
        zuiunCutInFallbackCandidateCount: diagnostics.zuiunCutInFallbackCandidateCount ?? 0,
        reasonCodes:
          diagnostics.reasonCodes ??
          (result.status === 'no-solution'
            ? [...new Set(result.analysis.reasons.map(({ code }) => code))]
            : []),
      })
      if (totalElapsedMs > recommendationSlowThresholdMs) {
        logger('recommendation.slow-completed', {
          ...recommendationLogContext(parsedRequest),
          thresholdMs: recommendationSlowThresholdMs,
          totalElapsedMs,
          solverElapsedMs,
          exactCombatElapsedMs,
          slowestPhase: slowestPhase.phase,
          slowestPhaseElapsedMs: slowestPhase.elapsedMs,
        })
      }
    }
    return toRecommendationRendererResult(result)
  }
