import { getMapOptions, scoreFleet } from '@kancolle-assistant/recommendation-core'
import {
  ACCOUNT_CHANNEL,
  EXPEDITION_PLAN_CHANNEL,
  EXPEDITION_SUMMARY_CHANNEL,
  MAP_OPTIONS_CHANNEL,
  RECOMMEND_CHANNEL,
  RESOURCE_LEDGER_SUMMARY_CHANNEL,
} from './channels'
import { readKC3AccountSnapshot, readKC3CombatEvaluations } from './kc3-bridge'
import { planKC3Expeditions, readKC3ExpeditionSummary } from './kc3-expedition-planner'
import { readKC3ResourceLedgerSummary } from './kc3-resource-ledger'
import { toRecommendationRendererResult } from './presentation'

const errorResult = (code, message) => ({ status: 'error', error: { code, message } })
const EXACT_COMBAT_CANDIDATE_LIMIT = 18

const guidePriority = (recommendation) =>
  recommendation.route.tags.includes('guide-primary')
    ? 0
    : recommendation.route.tags.includes('guide-alternative')
      ? 1
      : 2

const applyCombatEvaluations = (result, evaluations, objective) => {
  if (!Array.isArray(evaluations)) throw new Error('KC3 combat evaluation result is invalid')
  const evaluationsById = new Map(evaluations.map((evaluation) => [evaluation.id, evaluation]))
  const enriched = result.recommendations.map((recommendation) => {
    const evaluation = evaluationsById.get(recommendation.id)
    if (!evaluation || evaluation.ships.length !== recommendation.ships.length) {
      throw new Error(`KC3 combat evaluation is incomplete: ${recommendation.id}`)
    }
    const ships = recommendation.ships.map((build, index) => ({
      ...build,
      combat: evaluation?.ships[index],
    }))
    return {
      ...recommendation,
      ships,
      score: scoreFleet(ships, recommendation.metrics, objective, recommendation.route),
      reasons: [
        ...recommendation.reasons,
        {
          code: 'KC3_COMBAT_EVALUATION_APPLIED',
          message: 'KC3 已依完整配裝複算裝備加成與有效戰鬥力。',
        },
      ],
    }
  })
  const seenFleets = new Set()
  const ranked = enriched
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

const isAllowedStrategyRoomSender = (event, extensionId) => {
  if (!extensionId) return false
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  try {
    const url = new URL(senderUrl)
    return (
      url.protocol === 'chrome-extension:' &&
      url.hostname === extensionId &&
      url.pathname === '/pages/strategy/strategy.html'
    )
  } catch {
    return false
  }
}

const readAccount = async (event, getKc3ExtensionId, readAccountSnapshot) => {
  if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
    return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
  }
  try {
    return await readAccountSnapshot(event.sender)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const code =
      message.includes('not ready') || message.includes('port data')
        ? 'KC3_UNAVAILABLE'
        : 'KC3_SCHEMA_INVALID'
    return errorResult(
      code,
      code === 'KC3_UNAVAILABLE'
        ? 'KC3 尚未完成母港資料同步，請回到遊戲母港後再重新同步。'
        : `KC3 帳號資料格式無法解析：${message}`,
    )
  }
}

const parseRequest = (request) => {
  if (!request || typeof request !== 'object') return null
  if (typeof request.mapId !== 'string' || typeof request.objective !== 'string') return null
  const mapOption = getMapOptions().find((item) => item.id === request.mapId)
  if (!mapOption || !mapOption.objectives.includes(request.objective)) return null
  if (
    typeof request.avoidCurrentFleetEquipment !== 'undefined' &&
    typeof request.avoidCurrentFleetEquipment !== 'boolean'
  ) {
    return null
  }
  return {
    mapId: request.mapId,
    routeId: typeof request.routeId === 'string' ? request.routeId : undefined,
    objective: request.objective,
    preferences: {
      avoidCurrentFleetEquipment: request.avoidCurrentFleetEquipment === true,
    },
  }
}

const RESOURCE_KEYS = ['fuel', 'ammo', 'steel', 'bauxite']
const ALLOWED_EXPEDITION_IDS = new Set([
  ...Array.from({ length: 40 }, (_, index) => index + 1),
  100,
  101,
  102,
  110,
])
const RESOURCE_LEDGER_RANGES = ['today', 'yesterday', 'rolling24']
const parseExpeditionRequest = (request) => {
  if (
    !request ||
    typeof request !== 'object' ||
    !request.resourceWeights ||
    !request.incomeModifier
  ) {
    return null
  }
  const resourceWeights = Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, Number(request.resourceWeights[key])]),
  )
  if (
    RESOURCE_KEYS.some(
      (key) =>
        !Number.isInteger(resourceWeights[key]) ||
        resourceWeights[key] < -5 ||
        resourceWeights[key] > 20,
    ) ||
    !Number.isInteger(request.afkMinutes) ||
    request.afkMinutes < 0 ||
    request.afkMinutes > 2880 ||
    !Number.isInteger(request.fleetCount) ||
    request.fleetCount < 1 ||
    request.fleetCount > 3 ||
    typeof request.incomeModifier.greatSuccess !== 'boolean' ||
    !Number.isInteger(request.bucketWeight) ||
    request.bucketWeight < -5 ||
    request.bucketWeight > 20 ||
    !Number.isInteger(request.incomeModifier.daihatsuCount) ||
    request.incomeModifier.daihatsuCount < 0 ||
    request.incomeModifier.daihatsuCount > 4 ||
    !Array.isArray(request.candidateIds)
  ) {
    return null
  }
  const candidateIds = [...new Set(request.candidateIds.map(Number))]
    .filter((id) => ALLOWED_EXPEDITION_IDS.has(id))
    .sort((left, right) => left - right)
  if (candidateIds.length < request.fleetCount) return null
  return {
    resourceWeights,
    afkMinutes: request.afkMinutes,
    fleetCount: request.fleetCount,
    candidateIds,
    bucketWeight: request.bucketWeight,
    incomeModifier: {
      greatSuccess: request.incomeModifier.greatSuccess,
      daihatsuCount: request.incomeModifier.daihatsuCount,
    },
  }
}

export const registerRecommendationIpc = ({
  ipcMain,
  getKc3ExtensionId,
  recommend,
  planExpeditions: planExpeditionsInWorker,
  summarizeResourceLedger: summarizeResourceLedgerInWorker,
  logger,
  readAccountSnapshot = readKC3AccountSnapshot,
  readCombatEvaluations = readKC3CombatEvaluations,
}) => {
  const accountSummary = (snapshot) => ({
    shipCount: snapshot.ships.length,
    equipmentCount: snapshot.equipment.length,
    generatedAt: snapshot.generatedAt,
    capabilities: snapshot.metadata.capabilities,
  })
  const accountSnapshots = new WeakMap()
  const recommendationResults = new WeakMap()
  const readCachedAccount = async (event, forceRefresh = false) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    const sender = event.sender
    if (forceRefresh) {
      accountSnapshots.delete(sender)
      recommendationResults.delete(sender)
    }
    if (!forceRefresh && accountSnapshots.has(sender)) return accountSnapshots.get(sender)
    const snapshot = await readAccount(event, getKc3ExtensionId, readAccountSnapshot)
    if (snapshot.status !== 'error') accountSnapshots.set(sender, snapshot)
    return snapshot
  }

  ipcMain.handle(MAP_OPTIONS_CHANNEL, async (event) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    return { status: 'success', maps: getMapOptions() }
  })

  ipcMain.handle(ACCOUNT_CHANNEL, async (event, request) => {
    const snapshot = await readCachedAccount(event, request?.forceRefresh === true)
    if (snapshot.status === 'error') return snapshot
    return {
      status: 'success',
      account: accountSummary(snapshot),
    }
  })

  ipcMain.handle(EXPEDITION_SUMMARY_CHANNEL, async (event) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    try {
      return { status: 'success', ...(await readKC3ExpeditionSummary(event.sender)) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return errorResult(
        'KC3_UNAVAILABLE',
        message.includes('not ready')
          ? 'KC3 尚未完成母港與遠征資料同步，請回到遊戲母港後再重新同步。'
          : `KC3 遠征資料無法讀取：${message}`,
      )
    }
  })

  ipcMain.handle(EXPEDITION_PLAN_CHANNEL, async (event, request) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    const parsedRequest = parseExpeditionRequest(request)
    if (!parsedRequest) return errorResult('INVALID_REQUEST', '遠征配對條件格式不正確。')
    try {
      const result = await planKC3Expeditions(event.sender, parsedRequest, planExpeditionsInWorker)
      logger('expedition-planner.completed', {
        fleetCount: parsedRequest.fleetCount,
        candidateCount: parsedRequest.candidateIds.length,
        status: result.status,
      })
      return result
    } catch (error) {
      logger('expedition-planner.failed', { message: error?.message || String(error) })
      return errorResult('PLANNER_FAILED', '遠征配對計算失敗，請確認 KC3 已同步後再試。')
    }
  })

  ipcMain.handle(RESOURCE_LEDGER_SUMMARY_CHANNEL, async (event, request) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    if (!request || !RESOURCE_LEDGER_RANGES.includes(request.range)) {
      return errorResult('INVALID_REQUEST', '資源統計期間格式不正確。')
    }
    try {
      return {
        status: 'success',
        ...(await readKC3ResourceLedgerSummary(
          event.sender,
          { range: request.range },
          summarizeResourceLedgerInWorker,
        )),
      }
    } catch (error) {
      logger('resource-ledger.failed', { message: error?.message || String(error) })
      return errorResult(
        'KC3_UNAVAILABLE',
        'KC3 資源紀錄尚未就緒，請先回到遊戲母港同步後再重新整理。',
      )
    }
  })

  ipcMain.handle(RECOMMEND_CHANNEL, async (event, request) => {
    const parsedRequest = parseRequest(request)
    if (!parsedRequest) return errorResult('INVALID_REQUEST', '推薦條件格式不正確。')

    const snapshot = await readCachedAccount(event)
    if (snapshot.status === 'error') return snapshot
    const cacheKey = JSON.stringify(parsedRequest)
    const cachedResults = recommendationResults.get(event.sender)
    if (cachedResults?.snapshot === snapshot && cachedResults.results.has(cacheKey)) {
      return {
        ...cachedResults.results.get(cacheKey),
        account: accountSummary(snapshot),
      }
    }

    let result
    const requestStartedAt = Date.now()
    let exactCombatElapsedMs = 0
    try {
      result = await recommend({
        ...parsedRequest,
        account: snapshot,
        candidateLimit: EXACT_COMBAT_CANDIDATE_LIMIT,
      })
      if (result.status === 'success') {
        try {
          const exactCombatStartedAt = Date.now()
          const evaluations = await readCombatEvaluations(
            event.sender,
            result.recommendations,
            snapshot.generatedAt,
          )
          exactCombatElapsedMs = Date.now() - exactCombatStartedAt
          result = applyCombatEvaluations(result, evaluations, parsedRequest.objective)
        } catch (error) {
          logger('recommendation.combat-evaluation-failed', {
            message: error?.message || String(error),
          })
          result = { ...result, recommendations: result.recommendations.slice(0, 3) }
        }
      }
    } catch (error) {
      logger('recommendation.failed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        message: error?.message || String(error),
      })
      return errorResult('SOLVER_FAILED', '推薦計算失敗，請稍後再試。')
    }
    if (result.status !== 'error') {
      const routeCount =
        getMapOptions()
          .find((map) => map.id === parsedRequest.mapId)
          ?.routes.filter(
            (route) =>
              route.objectives.includes(parsedRequest.objective) &&
              (!parsedRequest.routeId || route.id === parsedRequest.routeId),
          ).length ?? 0
      logger('recommendation.completed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        routeId: parsedRequest.routeId ?? null,
        searchMode: parsedRequest.routeId ? 'selected-route' : 'auto-compare',
        routeCount,
        status: result.status,
        elapsedMs: result.elapsedMs,
        exactCombatElapsedMs,
        totalElapsedMs: Date.now() - requestStartedAt,
        recommendationCount: result.status === 'success' ? result.recommendations.length : 0,
      })
    }
    const rendererResult = toRecommendationRendererResult(result)
    if (result.status !== 'error') {
      const cache =
        cachedResults?.snapshot === snapshot ? cachedResults : { snapshot, results: new Map() }
      cache.results.set(cacheKey, rendererResult)
      recommendationResults.set(event.sender, cache)
    }
    return {
      ...rendererResult,
      account: accountSummary(snapshot),
    }
  })
}
