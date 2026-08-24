import { getMapOptions, recommendFleet } from '@damecon/recommendation-core'
import { readKC3AccountSnapshot } from './kc3-bridge'

const ACCOUNT_CHANNEL = 'recommendation:account-summary'
const MAP_OPTIONS_CHANNEL = 'recommendation:map-options'
const RECOMMEND_CHANNEL = 'recommendation:recommend'
const OBJECTIVES = new Set([
  'balanced',
  'boss-clear',
  'low-cost',
  'leveling',
  'resource-fuel',
  'resource-ammo',
  'resource-steel',
  'resource-bauxite',
  'resource-bucket',
  'resource-devmat',
])

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
  if (typeof request.mapId !== 'string' || !OBJECTIVES.has(request.objective)) return null
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

export const registerRecommendationIpc = ({ ipcMain, getKc3ExtensionId, logger }) => {
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

  ipcMain.handle(RECOMMEND_CHANNEL, async (event, request) => {
    const parsedRequest = parseRequest(request)
    if (!parsedRequest) return errorResult('INVALID_REQUEST', '推薦條件格式不正確。')

    const snapshot = await readAccount(event, getKc3ExtensionId)
    if (snapshot.status === 'error') return snapshot

    const result = recommendFleet({ ...parsedRequest, account: snapshot })
    if (result.status !== 'error') {
      logger('recommendation.completed', {
        mapId: parsedRequest.mapId,
        objective: parsedRequest.objective,
        status: result.status,
        elapsedMs: result.elapsedMs,
        recommendationCount: result.status === 'success' ? result.recommendations.length : 0,
      })
    }
    return result
  })
}
