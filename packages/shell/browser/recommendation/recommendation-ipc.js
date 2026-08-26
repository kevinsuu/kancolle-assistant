import { getMapOptions } from '@kancolle-assistant/recommendation-core'
import {
  ACCOUNT_CHANNEL,
  EXPEDITION_PLAN_CHANNEL,
  EXPEDITION_SUMMARY_CHANNEL,
  MAP_OPTIONS_CHANNEL,
  RECOMMEND_CHANNEL,
  RESOURCE_LEDGER_SUMMARY_CHANNEL,
} from './channels'
import { readKC3AccountSnapshot } from './kc3-bridge'
import { planKC3Expeditions, readKC3ExpeditionSummary } from './kc3-expedition-planner'
import { readKC3ResourceLedgerSummary } from './kc3-resource-ledger'
import { toRecommendationRendererResult } from './presentation'

const errorResult = (code, message) => ({ status: 'error', error: { code, message } })

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

const readAccount = async (event, getKc3ExtensionId) => {
  if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
    return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
  }
  try {
    return await readKC3AccountSnapshot(event.sender)
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
    !request.target ||
    !request.resourceWeights ||
    !request.incomeModifier
  ) {
    return null
  }
  const target = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Number(request.target[key])]))
  const resourceWeights = Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, Number(request.resourceWeights[key])]),
  )
  if (
    RESOURCE_KEYS.some(
      (key) => !Number.isInteger(target[key]) || target[key] < 0 || target[key] > 350000,
    ) ||
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
    typeof request.considerBuckets !== 'boolean' ||
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
    target,
    resourceWeights,
    afkMinutes: request.afkMinutes,
    fleetCount: request.fleetCount,
    candidateIds,
    considerBuckets: request.considerBuckets,
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
}) => {
  ipcMain.handle(MAP_OPTIONS_CHANNEL, async (event) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    return { status: 'success', maps: getMapOptions() }
  })

  ipcMain.handle(ACCOUNT_CHANNEL, async (event) => {
    const snapshot = await readAccount(event, getKc3ExtensionId)
    if (snapshot.status === 'error') return snapshot
    return {
      status: 'success',
      account: {
        shipCount: snapshot.ships.length,
        equipmentCount: snapshot.equipment.length,
        generatedAt: snapshot.generatedAt,
        capabilities: snapshot.metadata.capabilities,
      },
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
    if (!parsedRequest) return errorResult('INVALID_REQUEST', '遠征目標或配對條件格式不正確。')
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

    const snapshot = await readAccount(event, getKc3ExtensionId)
    if (snapshot.status === 'error') return snapshot

    let result
    try {
      result = await recommend({ ...parsedRequest, account: snapshot })
    } catch (error) {
      logger('recommendation.failed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        message: error?.message || String(error),
      })
      return errorResult('SOLVER_FAILED', '推薦計算失敗，請稍後再試。')
    }
    if (result.status !== 'error') {
      logger('recommendation.completed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        status: result.status,
        elapsedMs: result.elapsedMs,
        recommendationCount: result.status === 'success' ? result.recommendations.length : 0,
      })
    }
    return toRecommendationRendererResult(result)
  })
}
