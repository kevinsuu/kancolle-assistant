import { createRecommendationCalculation } from './recommendation-calculation'
export { applyCombatEvaluations } from './recommendation-calculation'
import { createSnapshotCache } from './snapshot-cache'
import { SNAPSHOT_CHANGED_CHANNEL } from './channels'
import {
  getMapOptions,
  normalizeResourceLedgerGranularity,
  resourcePreferencesFromPriorityMap,
  resourcePreferencesToWeights,
  validateResourcePriorityMap,
  validateResourcePreferenceMap,
} from '@kancolle-assistant/recommendation-core'
import {
  ACCOUNT_CHANNEL,
  EXPEDITION_PLAN_CHANNEL,
  EXPEDITION_SUMMARY_CHANNEL,
  MAP_OPTIONS_CHANNEL,
  QUEST_RECOMMENDATIONS_CHANNEL,
  RECOMMEND_CHANNEL,
  RESOURCE_LEDGER_SUMMARY_CHANNEL,
} from './channels'
import { readKC3AccountSnapshot, readKC3CombatEvaluations } from './kc3-bridge'
import { planKC3Expeditions, readKC3ExpeditionSummary } from './kc3-expedition-planner'
import { readKC3ResourceLedgerSummary } from './kc3-resource-ledger'
import { readKC3QuestRecommendations } from './kc3-quest-recommendation'

const errorResult = (code, message) => ({ status: 'error', error: { code, message } })
const RECOMMENDATION_SLOW_THRESHOLD_MS = 3_000
const EXPEDITION_WEIGHT_MIN = -5
const EXPEDITION_WEIGHT_MAX = 20
const EXPEDITION_WEIGHT_STEP = 5
const sanitizedErrorMessage = (error) =>
  (error?.message || String(error)).replace(/\s+/g, ' ').slice(0, 240)

const isExpeditionWeightValue = (value) =>
  Number.isInteger(value) &&
  value >= EXPEDITION_WEIGHT_MIN &&
  value <= EXPEDITION_WEIGHT_MAX &&
  value % EXPEDITION_WEIGHT_STEP === 0

const parsePriorityRank = (value) => {
  if (value === null) return null
  const rank = Number(value)
  return Number.isInteger(rank) && rank >= 1 && rank <= 5 ? rank : undefined
}

const parseResourcePreference = (preference) => {
  if (!preference || typeof preference !== 'object') return null
  if (preference.mode === 'ignore') return { mode: 'ignore' }
  if (preference.mode === 'constraint') {
    const minimumNetYieldPerHour = Number(preference.minimumNetYieldPerHour ?? 0)
    return Number.isFinite(minimumNetYieldPerHour)
      ? { mode: 'constraint', minimumNetYieldPerHour }
      : null
  }
  if (preference.mode === 'optimize') {
    const rank = parsePriorityRank(preference.rank)
    return rank === null || typeof rank === 'undefined' ? null : { mode: 'optimize', rank }
  }
  return null
}

const vectorToResourceWeights = (weights) => ({
  fuel: weights.fuel,
  ammo: weights.ammo,
  steel: weights.steel,
  bauxite: weights.bauxite,
})

const isAllowedStrategyRoomSender = (event, extensionId) => {
  if (!extensionId) return false
  try {
    const url = new URL(event.senderFrame?.url || event.sender.getURL())
    return (
      url.protocol === 'chrome-extension:' &&
      url.hostname === extensionId &&
      url.pathname === '/pages/strategy/strategy.html'
    )
  } catch {
    return false
  }
}

const getSnapshotExecutionTarget = (event) =>
  typeof event.senderFrame?.executeJavaScript === 'function' ? event.senderFrame : event.sender

const readAccountFromTarget = async (target, readAccountSnapshot, logger) => {
  try {
    return await readAccountSnapshot(target, logger)
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

const readAccount = async (event, getKc3ExtensionId, readAccountSnapshot, logger) => {
  if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
    return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
  }
  return readAccountFromTarget(getSnapshotExecutionTarget(event), readAccountSnapshot, logger)
}

const parseRequest = (request) => {
  if (!request || typeof request !== 'object') return null
  if (typeof request.mapId !== 'string' || typeof request.objective !== 'string') return null
  const mapOption = getMapOptions().find((item) => item.id === request.mapId)
  if (!mapOption || !mapOption.objectives.includes(request.objective)) return null
  return {
    mapId: request.mapId,
    routeId: typeof request.routeId === 'string' ? request.routeId : undefined,
    objective: request.objective,
  }
}

const recommendationCacheKey = (request) => JSON.stringify(request)

const recommendationLogContext = (parsedRequest) => ({
  mapId: parsedRequest.mapId,
  objective: parsedRequest.objective,
  routeId: parsedRequest.routeId ?? null,
})

const RESOURCE_KEYS = ['fuel', 'ammo', 'steel', 'bauxite']
const EXPEDITION_UTILITY_RESOURCE_KEYS = [...RESOURCE_KEYS, 'bucket']
const ALLOWED_EXPEDITION_IDS = new Set([
  ...Array.from({ length: 40 }, (_, index) => index + 1),
  100,
  101,
  102,
  110,
])
const RESOURCE_LEDGER_RANGES = ['today', 'yesterday', 'rolling24']
const EXPEDITION_LOG_RESOURCE_KEYS = [...RESOURCE_KEYS, 'bucket']

const parsePriorityPreference = (preference) => {
  if (!preference || typeof preference !== 'object' || preference.mode !== 'priority') return null
  if (preference.preferences && typeof preference.preferences === 'object') {
    const preferences = Object.fromEntries(
      EXPEDITION_UTILITY_RESOURCE_KEYS.map((key) => [
        key,
        parseResourcePreference(preference.preferences[key]),
      ]),
    )
    if (Object.values(preferences).some((item) => item === null)) return null
    if (!validateResourcePreferenceMap(preferences)) return null
    return { mode: 'priority', preferences }
  }
  const priorities = Object.fromEntries(
    EXPEDITION_UTILITY_RESOURCE_KEYS.map((key) => [
      key,
      parsePriorityRank(preference.priorities?.[key]),
    ]),
  )
  if (Object.values(priorities).some((rank) => typeof rank === 'undefined')) return null
  if (!validateResourcePriorityMap(priorities)) return null
  return { mode: 'priority', preferences: resourcePreferencesFromPriorityMap(priorities) }
}

const resourceLogValue = (values, key) =>
  typeof values?.[key] === 'number' && Number.isFinite(values[key]) ? values[key] : null

const expeditionScoringSummaryRows = (result) => {
  if (result.status !== 'success') return []
  return result.plans.map((plan, index) => ({
    rank: index + 1,
    expeditions: plan.pairings.map(({ expedition }) => expedition.displayNo).join(' + '),
    expeditionNames: plan.pairings.map(({ expedition }) => expedition.name).join(' + '),
    score: plan.scoreDetails.totalScore,
    fuelPerHour: resourceLogValue(plan.scoreDetails.expectedNetYield, 'fuel'),
    ammoPerHour: resourceLogValue(plan.scoreDetails.expectedNetYield, 'ammo'),
    steelPerHour: resourceLogValue(plan.scoreDetails.expectedNetYield, 'steel'),
    bauxitePerHour: resourceLogValue(plan.scoreDetails.expectedNetYield, 'bauxite'),
    bucketPerHour: resourceLogValue(plan.scoreDetails.expectedNetYield, 'bucket'),
  }))
}

const expeditionPlanScoringDebug = (plan, index) => ({
  rank: index + 1,
  expeditionIds: plan.pairings.map(({ expedition }) => expedition.displayNo),
  expeditionNames: plan.pairings.map(({ expedition }) => expedition.name),
  totalScore: plan.scoreDetails.totalScore,
  resources: Object.fromEntries(
    EXPEDITION_LOG_RESOURCE_KEYS.map((key) => [
      key,
      {
        expectedNetYield: resourceLogValue(plan.scoreDetails.expectedNetYield, key),
        benchmark: resourceLogValue(plan.scoreDetails.benchmark, key),
        satisfaction: resourceLogValue(plan.scoreDetails.satisfaction, key),
        utility: resourceLogValue(plan.scoreDetails.utility, key),
        normalizedWeight: resourceLogValue(plan.scoreDetails.normalizedWeight, key),
        weightedContribution: resourceLogValue(plan.scoreDetails.weightedContribution, key),
      },
    ]),
  ),
})

const expeditionCompletedScoringDebug = (result) => ({
  status: result.status,
  candidateCount: result.candidateCount,
  combinationCount: result.combinationCount,
  prunedCombinationCount: result.prunedCombinationCount,
  totalCombinationCount:
    result.optimizationDebug?.context?.totalCombinationCount ?? result.combinationCount,
  paretoRemovedCount:
    result.optimizationDebug?.context?.paretoRemovedCount ??
    result.combinationCount - result.prunedCombinationCount,
  remainingCombinationCount:
    result.optimizationDebug?.context?.remainingCombinationCount ?? result.prunedCombinationCount,
  plans: result.plans.map(expeditionPlanScoringDebug),
})

const parseExpeditionRequest = (request) => {
  if (!request || typeof request !== 'object' || !request.incomeModifier) return null
  const priorityPreference = parsePriorityPreference(request.preference)
  const priorityWeights = priorityPreference
    ? resourcePreferencesToWeights(priorityPreference.preferences)
    : null
  const legacyResourceWeights =
    !priorityPreference && request.resourceWeights
      ? Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Number(request.resourceWeights[key])]))
      : null
  const legacyBucketWeight = !priorityPreference ? Number(request.bucketWeight) : 0
  const resourceWeights = priorityWeights
    ? vectorToResourceWeights(priorityWeights)
    : legacyResourceWeights
  const bucketWeight = priorityWeights ? priorityWeights.bucket : legacyBucketWeight
  if (
    !resourceWeights ||
    (!priorityPreference &&
      RESOURCE_KEYS.some((key) => !isExpeditionWeightValue(resourceWeights[key]))) ||
    !Number.isInteger(request.afkMinutes) ||
    request.afkMinutes < 0 ||
    request.afkMinutes > 2880 ||
    !Number.isInteger(request.fleetCount) ||
    request.fleetCount < 1 ||
    request.fleetCount > 3 ||
    typeof request.incomeModifier.greatSuccess !== 'boolean' ||
    (!priorityPreference && !isExpeditionWeightValue(bucketWeight)) ||
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
    bucketWeight,
    ...(priorityPreference ? { preference: priorityPreference } : {}),
    debug: request.debug === true,
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
  readQuestRecommendations = readKC3QuestRecommendations,
  recommendationSlowThresholdMs = RECOMMENDATION_SLOW_THRESHOLD_MS,
  syncQuestList,
}) => {
  const accountSummary = (snapshot) => ({
    shipCount: snapshot.ships.length,
    equipmentCount: snapshot.equipment.length,
    generatedAt: snapshot.generatedAt,
    capabilities: snapshot.metadata.capabilities,
    snapshotVersion: snapshotVersions.get(snapshot),
  })
  const snapshotVersions = new WeakMap()
  const contexts = new Map()
  const contextFor = (event) => {
    const session = event.sender.session || null
    const extensionId = getKc3ExtensionId()
    let context = contexts.get(session)
    if (context && context.extensionId !== extensionId) {
      context.dispose()
      contexts.delete(session)
      context = null
    }
    if (!context) {
      const senders = new Map()
      const cache = createSnapshotCache({
        logger,
        notify: (message) => {
          let affectedWindowCount = 0
          for (const sender of senders.keys()) {
            if (sender.isDestroyed?.() || !isAllowedStrategyRoomSender({ sender }, extensionId))
              continue
            try {
              sender.send?.(SNAPSHOT_CHANGED_CHANNEL, message)
              affectedWindowCount++
            } catch (error) {
              logger('recommendation.snapshot-notify-failed', {
                message: sanitizedErrorMessage(error),
                outcome: 'failed',
              })
            }
          }
          logger('recommendation.snapshot-notified', { ...message, affectedWindowCount })
        },
      })
      const onExtensionUnloaded = (_event, extension) => {
        if (extension?.id !== extensionId) return
        context.dispose()
        contexts.delete(session)
      }
      session?.on?.('extension-unloaded', onExtensionUnloaded)
      context = {
        extensionId,
        cache,
        senders,
        dispose: () => {
          session?.removeListener?.('extension-unloaded', onExtensionUnloaded)
          cache.dispose()
          for (const cleanup of senders.values()) cleanup()
          senders.clear()
        },
      }
      contexts.set(session, context)
    }
    if (!context.senders.has(event.sender)) {
      const sender = event.sender,
        ownedContext = context
      const cleanup = () => {
        sender.removeListener?.('destroyed', cleanup)
        sender.removeListener?.('did-start-navigation', navigation)
        ownedContext.senders.delete(sender)
      }
      const navigation = (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) cleanup()
      }
      sender.once?.('destroyed', cleanup)
      sender.on?.('did-start-navigation', navigation)
      context.senders.set(sender, cleanup)
    }
    return context.cache
  }
  const calculateRecommendation = createRecommendationCalculation({
    recommend,
    logger,
    readCombatEvaluations,
    recommendationSlowThresholdMs,
  })
  const readCachedAccount = async (event, forceRefresh = false) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    const cache = contextFor(event)
    const snapshot = await cache.read(
      () => readAccount(event, getKc3ExtensionId, readAccountSnapshot, logger),
      forceRefresh,
    )
    if (snapshot.status !== 'error') snapshotVersions.set(snapshot, cache.version(snapshot))
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
        combinationCount: result.status === 'success' ? result.combinationCount : 0,
        prunedCombinationCount: result.status === 'success' ? result.prunedCombinationCount : 0,
        status: result.status,
        debug: parsedRequest.debug,
        scoring: expeditionScoringSummaryRows(result),
      })
      if (result.status === 'success') {
        logger(
          'expedition-planner.completed.scoring-json',
          `\n${JSON.stringify(expeditionCompletedScoringDebug(result), null, 2)}`,
        )
      }
      if (result.optimizationDebug) {
        logger(
          'expedition-planner.completed.optimization-debug-json',
          `\n${JSON.stringify(result.optimizationDebug, null, 2)}`,
        )
      } else if (parsedRequest.debug) {
        logger('expedition-planner.completed.optimization-debug-missing', {
          message: 'debug request was enabled, but the planner did not return optimizationDebug.',
        })
      }
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
    const granularity =
      typeof request.granularity === 'undefined'
        ? 'hourly'
        : normalizeResourceLedgerGranularity(request.granularity)
    if (!granularity) {
      return errorResult('INVALID_REQUEST', '資源統計刻度格式不正確。')
    }
    try {
      return {
        status: 'success',
        ...(await readKC3ResourceLedgerSummary(
          event.sender,
          { range: request.range, granularity, forceRefresh: request.forceRefresh === true },
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

  ipcMain.handle(QUEST_RECOMMENDATIONS_CHANNEL, async (event, request) => {
    if (!isAllowedStrategyRoomSender(event, getKc3ExtensionId())) {
      return errorResult('KC3_UNAVAILABLE', '此功能只能從目前的 KC3 Strategy Room 使用。')
    }
    if (
      typeof request !== 'undefined' &&
      (!request || typeof request !== 'object' || typeof request.forceSync !== 'boolean')
    ) {
      return errorResult('INVALID_REQUEST', '任務同步條件格式不正確。')
    }
    const forceSync = request?.forceSync === true
    const startedAt = Date.now()
    let synchronizedQuestList
    let synchronizedQuestCount = 0
    if (forceSync) {
      const syncStartedAt = Date.now()
      try {
        if (typeof syncQuestList !== 'function') {
          throw Object.assign(new Error('Quest live sync is unavailable.'), {
            code: 'KC3_QUEST_SYNC_UNAVAILABLE',
          })
        }
        const synchronized = await syncQuestList(event)
        synchronizedQuestList = synchronized.quests
        synchronizedQuestCount = synchronized.quests.filter((quest) => quest && quest !== -1).length
        logger('quest-recommendation.live-sync-completed', {
          operation: 'fetch-current-quest-list',
          gameWebContentsId: synchronized.gameWebContentsId,
          synchronizedQuestCount,
          elapsedMs: Number(synchronized.elapsedMs ?? Date.now() - syncStartedAt),
          outcome: 'success',
          reasonCodes: [],
        })
      } catch (error) {
        const reasonCode = error?.code || 'KC3_QUEST_SYNC_REQUEST_FAILED'
        logger('quest-recommendation.live-sync-failed', {
          operation: 'fetch-current-quest-list',
          synchronizedQuestCount: 0,
          elapsedMs: Date.now() - syncStartedAt,
          outcome: 'failed',
          reasonCodes: [reasonCode],
          message: sanitizedErrorMessage(error),
        })
        return errorResult(
          'KC3_QUEST_SYNC_UNAVAILABLE',
          reasonCode === 'KC3_QUEST_SYNC_CONTEXT_UNAVAILABLE'
            ? '尚未取得遊戲連線資訊，請先回到遊戲母港操作一次，再按「同步最新狀態」。'
            : '無法取得最新任務狀態，請確認遊戲分頁仍在線後再試。',
        )
      }
    }
    try {
      const result = await readQuestRecommendations(getSnapshotExecutionTarget(event), logger, {
        synchronizedQuestList,
      })
      const synergyIds = [
        ...new Set(
          (result.groups || [])
            .filter(({ kind, synergy }) => kind === 'combined' && synergy)
            .map(({ synergy }) => synergy.id),
        ),
      ]
      const relationKindCounts = (result.groups || [])
        .flatMap(({ synergy }) => synergy?.relationKinds || [])
        .reduce((counts, kind) => {
          counts[kind] = (counts[kind] || 0) + 1
          return counts
        }, {})
      logger('quest-recommendation.completed', {
        operation: 'rank-quest-value-chains',
        rankingMode: 'feasibility-then-recurrence-and-effective-reward',
        dailyTieBreakMode: 'deferred-within-value-band',
        valueBandOrder: [
          'valuableRepeatable',
          'valuableOneTime',
          'ordinaryRepeatable',
          'ordinaryOneTime',
        ],
        rewardPriorityOrder: ['medalBlueprint', 'actionReport', 'screws', 'other'],
        candidateCount: result.candidateCount,
        dailyCount: result.dailyCount,
        weeklyCount: result.weeklyCount,
        monthlyCount: result.monthlyCount,
        quarterlyCount: result.quarterlyCount,
        yearlyCount: result.yearlyCount,
        oneTimeCount: result.oneTimeCount,
        limitedCount: result.limitedCount,
        periodCounts: result.periodCounts,
        chapterCounts: result.chapterCounts,
        selectedCount: result.recommendations.length,
        groupCount: result.groupCount,
        combinedGroupCount: result.combinedGroupCount,
        alternativeSynergyCount: result.alternativeSynergyCount,
        objectiveDerivedGroupCount: result.objectiveDerivedGroupCount,
        objectiveProfiledQuestCount: result.objectiveProfiledQuestCount,
        arsenalProfiledQuestCount: result.arsenalProfiledQuestCount,
        derivedArsenalProfileCount: result.derivedArsenalProfileCount,
        derivedOnlyArsenalProfileCount: result.derivedOnlyArsenalProfileCount,
        relationKindCounts,
        availableExtraOperationCount: result.availableExtraOperationCount,
        unavailableQuestCount: result.unavailableQuestCount,
        downstreamValueQuestCount: result.downstreamValueQuestCount,
        topResetAt: result.recommendations[0]?.resetAt ?? null,
        topQuestIds: result.recommendations.slice(0, 10).map(({ id }) => id),
        topQuestPeriods: result.recommendations.slice(0, 10).map(({ period }) => period),
        topGuidanceTiers: result.recommendations
          .slice(0, 10)
          .map(({ guidance }) => guidance?.tier ?? null),
        topValueBands: result.recommendations.slice(0, 10).map(({ valueBand }) => valueBand),
        topEffectiveRewardSources: result.recommendations
          .slice(0, 10)
          .map(({ effectiveReward }) => effectiveReward?.source ?? 'current'),
        synergyCount: synergyIds.length,
        synergyIds,
        rewardCategoryCounts: result.rewardCategoryCounts,
        rankingVersion: result.rankingVersion,
        syncMode: forceSync ? 'live' : 'local',
        synchronizedQuestCount,
        elapsedMs: Date.now() - startedAt,
        outcome: 'success',
        reasonCodes: [],
      })
      return { status: 'success', ...result }
    } catch (error) {
      logger('quest-recommendation.failed', {
        operation: 'rank-quest-value-chains',
        candidateCount: 0,
        selectedCount: 0,
        elapsedMs: Date.now() - startedAt,
        outcome: 'failed',
        reasonCodes: [forceSync ? 'KC3_QUEST_SYNC_APPLY_FAILED' : 'KC3_QUEST_DATA_UNAVAILABLE'],
        message: sanitizedErrorMessage(error),
      })
      return errorResult(
        forceSync ? 'KC3_QUEST_SYNC_UNAVAILABLE' : 'KC3_UNAVAILABLE',
        forceSync
          ? '已取得最新任務資料，但 KC3 無法套用；請回到遊戲母港後再試。'
          : 'KC3 任務資料尚未就緒，請先在遊戲任務頁同步後再重新整理。',
      )
    }
  })

  ipcMain.handle(RECOMMEND_CHANNEL, async (event, request) => {
    const parsedRequest = parseRequest(request)
    if (!parsedRequest) return errorResult('INVALID_REQUEST', '推薦條件格式不正確。')

    const requestStartedAt = Date.now()
    let activePhase = 'account-snapshot'
    const slowTimer = setTimeout(() => {
      logger('recommendation.slow', {
        ...recommendationLogContext(parsedRequest),
        thresholdMs: recommendationSlowThresholdMs,
        elapsedMs: Date.now() - requestStartedAt,
        activePhase,
      })
    }, recommendationSlowThresholdMs)
    let accountElapsedMs = 0
    let cacheHit = false
    let rendererResult
    try {
      const snapshot = await readCachedAccount(event)
      accountElapsedMs = Date.now() - requestStartedAt
      if (snapshot.status === 'error') return snapshot
      const cacheKey = recommendationCacheKey(parsedRequest)
      const cache = contextFor(event)
      cacheHit = cache.has(cacheKey)
      activePhase = 'solver-and-combat'
      rendererResult = await cache.calculate(snapshot, cacheKey, () =>
        calculateRecommendation({
          parsedRequest,
          snapshot,
          target: getSnapshotExecutionTarget(event),
        }),
      )
      if (!cache.current(snapshot))
        return errorResult('SNAPSHOT_SUPERSEDED', '帳號資料已重新同步，請重新產生推薦。')
      const totalElapsedMs = Date.now() - requestStartedAt
      if (
        totalElapsedMs > recommendationSlowThresholdMs ||
        accountElapsedMs > recommendationSlowThresholdMs
      ) {
        logger('recommendation.request-slow-completed', {
          ...recommendationLogContext(parsedRequest),
          thresholdMs: recommendationSlowThresholdMs,
          totalElapsedMs,
          accountElapsedMs,
          cacheHit,
        })
      }
      return {
        ...rendererResult,
        account: accountSummary(snapshot),
      }
    } finally {
      clearTimeout(slowTimer)
    }
  })
  return () => {
    for (const context of contexts.values()) context.dispose()
    contexts.clear()
    for (const channel of [
      ACCOUNT_CHANNEL,
      MAP_OPTIONS_CHANNEL,
      RECOMMEND_CHANNEL,
      EXPEDITION_PLAN_CHANNEL,
      EXPEDITION_SUMMARY_CHANNEL,
      RESOURCE_LEDGER_SUMMARY_CHANNEL,
      QUEST_RECOMMENDATIONS_CHANNEL,
    ])
      ipcMain.removeHandler?.(channel)
  }
}
