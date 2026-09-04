import { rankQuestRecommendations } from './quest-recommendation'

const MAX_SYNCHRONIZED_QUEST_COUNT = 2_048

const synchronizedQuestScript = (quests) => {
  if (!Array.isArray(quests) || quests.length > MAX_SYNCHRONIZED_QUEST_COUNT) {
    throw new Error('KC3 synchronized quest list is invalid')
  }
  const serializedQuests = JSON.stringify(quests).replace(/[\u2028\u2029]/g, (character) =>
    character === '\u2028' ? '\\u2028' : '\\u2029',
  )
  return `(() => {
    if (!window.KC3QuestManager || typeof window.KC3QuestManager.definePage !== 'function') {
      throw new Error('KC3 quest managers are not ready')
    }
    const quests = ${serializedQuests}
    window.__kancolleAssistantJapaneseQuestTitles = Object.fromEntries(
      quests
        .filter((quest) => quest && quest !== -1 && Number(quest.api_no) > 0 && quest.api_title)
        .map((quest) => [Number(quest.api_no), String(quest.api_title).slice(0, 240)]),
    )
    window.KC3QuestManager.load()
    window.KC3QuestManager.definePage(quests, undefined, 0)
    const synchronizedQuestCount = quests.filter((quest) => quest && quest !== -1).length
    if (synchronizedQuestCount === 0) {
      ;(window.KC3QuestManager.open || []).slice().forEach((questId) => {
        window.KC3QuestManager.isOpen(questId, false)
        window.KC3QuestManager.get(questId).status = 3
      })
      ;(window.KC3QuestManager.active || []).slice().forEach((questId) => {
        window.KC3QuestManager.isActive(questId, false)
        window.KC3QuestManager.get(questId).status = 3
      })
      window.KC3QuestManager.save()
    }
    return {
      synchronizedQuestCount,
    }
  })()`
}

const KC3_QUEST_SNAPSHOT_SCRIPT = `(() => {
  if (!window.KC3QuestManager || !window.KC3Meta) {
    throw new Error('KC3 quest managers are not ready')
  }

  const startedAt = window.performance.now()
  const now = Date.now()
  window.KC3QuestManager.load()
  const storedQuestCount = Object.keys(window.KC3QuestManager.list || {}).length
  if (storedQuestCount === 0) {
    throw new Error('KC3 quest data has not been synchronized')
  }
  const repeatableTypes = window.KC3QuestManager.repeatableTypes || {}
  const isSupportedResetPeriod = (period) =>
    ['daily', 'weekly', 'monthly', 'quarterly'].includes(period) ||
    /^yearly(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(period)
  const supportedRepeatableEntries = Object.entries(repeatableTypes).filter(([period]) =>
    isSupportedResetPeriod(period),
  )
  ;['daily', 'weekly', 'monthly', 'quarterly'].forEach((period) => {
    if (!repeatableTypes[period]) {
      throw new Error('KC3 quest reset rules are not ready: ' + period)
    }
  })
  if (!supportedRepeatableEntries.some(([period]) => period.startsWith('yearly'))) {
    throw new Error('KC3 quest reset rules are not ready: yearly')
  }
  const resetPeriodByQuestId = {}
  supportedRepeatableEntries.forEach(([resetPeriod, repeatable]) => {
    ;(repeatable.questIds || []).forEach((questId) => {
      resetPeriodByQuestId[questId] = resetPeriod
    })
  })
  const resetAtByPeriod = {}
  supportedRepeatableEntries.forEach(([resetPeriod, repeatable]) => {
    if (!repeatable || typeof repeatable.calculateNextReset !== 'function') {
      throw new Error('KC3 quest reset rules are not ready: ' + resetPeriod)
    }
    resetAtByPeriod[resetPeriod] = Number(repeatable.calculateNextReset(now))
  })

  let japaneseQuests = {}
  let japaneseQuestMetadataStatus = 'unavailable'
  let japaneseQuestMetadataMessage = null
  try {
    if (typeof window.KC3Translation?.getJSONWithOptions === 'function') {
      japaneseQuests = window.KC3Translation.getJSONWithOptions(
        window.KC3Meta.repo,
        'quests',
        false,
        'jp',
        null,
        false,
      ) || {}
      japaneseQuestMetadataStatus = 'available'
    }
  } catch (error) {
    japaneseQuests = {}
    japaneseQuestMetadataStatus = 'failed'
    japaneseQuestMetadataMessage = String(error?.message || error || 'metadata load failed')
      .replace(/\s+/g, ' ')
      .slice(0, 160)
  }
  const questTitleSourceByQuestId = new Map()

  const questSnapshot = (questId, quest = {}, locked = false) => {
    const resetPeriod = resetPeriodByQuestId[questId] || 'other'
    const repeatable = resetPeriod !== 'other'
    const period = repeatable
      ? resetPeriod.startsWith('yearly')
        ? 'yearly'
        : resetPeriod
      : 'oneTime'
    const meta = window.KC3Meta.quest(questId) || {}
    const japaneseMeta = japaneseQuests[questId] || {}
    const raw = typeof quest.raw === 'function' ? quest.raw() || {} : {}
    const gameApiTitle =
      raw.api_title || window.__kancolleAssistantJapaneseQuestTitles?.[questId] || ''
    const name = gameApiTitle || japaneseMeta.name || meta.name || ''
    const titleSource = gameApiTitle
      ? 'gameApi'
      : japaneseMeta.name
        ? 'japaneseMetadata'
        : 'localizedFallback'
    if (!questTitleSourceByQuestId.has(questId)) {
      questTitleSourceByQuestId.set(questId, titleSource)
    }
    const status = locked ? 0 : Number(quest.status || 0)
    return {
      id: questId,
      code: String(meta.code || questId).slice(0, 40),
      name: String(name).slice(0, 240),
      description: String(meta.desc || '').replace(/<br\\s*\\/?>/gi, ' ').slice(0, 1200),
      synergyDescription: String(japaneseMeta.desc || meta.desc || '')
        .replace(/<br\\s*\\/?>/gi, ' ')
        .slice(0, 1200),
      memo: String(meta.memo || '').slice(0, 2400),
      status,
      progress: locked ? 0 : Number(quest.progress || 0),
      locked,
      limited: meta.hash !== undefined && meta.hash !== null,
      repeatable,
      period,
      resetPeriod,
      resetAt: resetAtByPeriod[resetPeriod] || null,
      unlockIds: Array.isArray(meta.unlock)
        ? [...new Set(meta.unlock.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
        : [],
      rewardConsumables: Array.isArray(meta.rewardConsumables)
        ? meta.rewardConsumables.slice(0, 4).map((value) => Number(value || 0))
        : [0, 0, 0, 0],
    }
  }

  const storedQuests = Object.values(window.KC3QuestManager.list || {})
  const storedQuestsById = new Map(storedQuests.map((quest) => [Number(quest.id), quest]))
  const synchronizedOpenQuests = storedQuests
    .filter((quest) => quest && (Number(quest.status) === 1 || Number(quest.status) === 2))
    .map((quest) => questSnapshot(Number(quest.id), quest))
  const limitedOpenQuestCount = synchronizedOpenQuests.filter(({ limited }) => limited).length
  // A limited quest has no dependable final end timestamp in KC3, but its current state,
  // requirements, rewards, and unlocks are still useful. Keep synchronized limited quests in the
  // recommendation input and let the renderer identify their unknown final deadline explicitly.
  const quests = synchronizedOpenQuests

  const openQuestIds = new Set(quests.map(({ id }) => Number(id)))
  const graphQuestIds = new Set(openQuestIds)
  const expandedQuestIds = new Set()
  const successorQueue = quests.map((quest) => ({ quest, depth: 0 }))
  const maximumSuccessorDepth = 12
  const maximumPlanningQuestCount = 1024
  while (successorQueue.length > 0 && graphQuestIds.size < maximumPlanningQuestCount) {
    const current = successorQueue.shift()
    const currentId = Number(current?.quest?.id)
    if (!Number.isFinite(currentId) || expandedQuestIds.has(currentId)) continue
    expandedQuestIds.add(currentId)
    if (current.depth >= maximumSuccessorDepth || current.quest.status === 3) continue

    ;(current.quest.unlockIds || []).forEach((questId) => {
      if (graphQuestIds.size >= maximumPlanningQuestCount) return
      const storedQuest = storedQuestsById.get(questId)
      const successorStatus = Number(storedQuest?.status || 0)
      const successor = questSnapshot(
        questId,
        storedQuest || {},
        successorStatus !== 1 && successorStatus !== 2 && successorStatus !== 3,
      )
      if (successor.limited) return
      if (!graphQuestIds.has(questId)) {
        quests.push(successor)
        graphQuestIds.add(questId)
      }
      if (!expandedQuestIds.has(questId)) {
        successorQueue.push({ quest: successor, depth: current.depth + 1 })
      }
    })
  }
  const successorGraphTruncated =
    successorQueue.length > 0 && graphQuestIds.size >= maximumPlanningQuestCount
  const successorQueueRemainingCount = successorQueue.length
  const questTitleSourceCounts = { gameApi: 0, japaneseMetadata: 0, localizedFallback: 0 }
  quests.forEach(({ id }) => {
    const titleSource = questTitleSourceByQuestId.get(Number(id)) || 'localizedFallback'
    questTitleSourceCounts[titleSource] += 1
  })

  const extraOperationStatus = {}
  ;[[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]].forEach(([world, map]) => {
    const mapData = window.KC3SortieManager?.getCurrentMapData?.(world, map) || {}
    extraOperationStatus[world + '-' + map] = Number(mapData.clear) === 0
      ? 'available'
      : Number(mapData.clear) === 1
        ? 'cleared'
        : 'unknown'
  })

  let account = { status: 'unknown', shipMasterIds: [], steel: null }
  let accountReasonCode = 'PORT_DATA_UNAVAILABLE'
  try {
    if (window.KC3ShipManager && window.PlayerManager?.hq) {
      window.KC3ShipManager.load()
      if (typeof window.PlayerManager.hq.load === 'function') window.PlayerManager.hq.load()
      const shipMasterIds = Object.values(window.KC3ShipManager.list || {})
        .map((ship) => Number(ship?.masterId || 0))
        .filter((id) => id > 0)
      const steel = Number(window.PlayerManager.hq.lastMaterial?.[2])
      if (shipMasterIds.length > 0) {
        account = {
          status: 'available',
          shipMasterIds,
          steel: Number.isFinite(steel) ? steel : null,
        }
        accountReasonCode = null
      }
    }
  } catch (error) {
    account = { status: 'unknown', shipMasterIds: [], steel: null }
    accountReasonCode = String(error?.message || error || 'account snapshot failed')
      .replace(/\\s+/g, ' ')
      .slice(0, 160)
  }

  return {
    generatedAt: new Date(now).toISOString(),
    quests,
    extraOperationStatus,
    account,
    diagnostics: {
      storedQuestCount,
      supportedRepeatableTypeCount: supportedRepeatableEntries.length,
      openQuestCount: openQuestIds.size,
      oneTimeOpenQuestCount: quests.filter(
        ({ limited, period, status }) =>
          !limited && period === 'oneTime' && (status === 1 || status === 2),
      ).length,
      limitedOpenQuestCount,
      graphQuestCount: quests.length,
      lockedPlanningQuestCount: quests.filter(({ locked }) => locked).length,
      successorPlanningQuestCount: quests.filter(({ status }) => status === 0).length,
      maximumPlanningQuestCount,
      successorGraphTruncated,
      successorQueueRemainingCount,
      accountStatus: account.status,
      accountReasonCode,
      shipCount: account.shipMasterIds.length,
      japaneseQuestMetadataStatus,
      japaneseQuestMetadataMessage,
      questTitleSourceCounts,
      elapsedMs: Math.round(window.performance.now() - startedAt),
    },
  }
})()`

const validateSnapshot = (snapshot) => {
  if (!snapshot || !Array.isArray(snapshot.quests)) {
    throw new Error('KC3 quest snapshot is invalid')
  }
  const generatedAt = new Date(snapshot.generatedAt).getTime()
  if (!Number.isFinite(generatedAt)) throw new Error('KC3 quest snapshot time is invalid')
  return generatedAt
}

export const readKC3QuestRecommendations = async (
  webContents,
  logger = () => {},
  { synchronizedQuestList } = {},
) => {
  if (synchronizedQuestList) {
    await webContents.executeJavaScript(synchronizedQuestScript(synchronizedQuestList), true)
  }
  const snapshot = await webContents.executeJavaScript(KC3_QUEST_SNAPSHOT_SCRIPT, true)
  const now = validateSnapshot(snapshot)
  const successorGraphTruncated = snapshot.diagnostics?.successorGraphTruncated === true
  const localizedTitleFallbackCount = Number(
    snapshot.diagnostics?.questTitleSourceCounts?.localizedFallback || 0,
  )
  const reasonCodes = [
    ...(successorGraphTruncated ? ['KC3_QUEST_SUCCESSOR_GRAPH_TRUNCATED'] : []),
    ...(localizedTitleFallbackCount > 0 ? ['KC3_JAPANESE_QUEST_TITLE_UNAVAILABLE'] : []),
  ]
  logger('quest-recommendation.snapshot-completed', {
    operation: 'read-kc3-open-quests',
    storedQuestCount: Number(snapshot.diagnostics?.storedQuestCount || 0),
    supportedRepeatableTypeCount: Number(snapshot.diagnostics?.supportedRepeatableTypeCount || 0),
    openQuestCount: Number(
      snapshot.diagnostics?.openQuestCount ??
        snapshot.quests.filter(({ status }) => status === 1 || status === 2).length,
    ),
    oneTimeOpenQuestCount: Number(snapshot.diagnostics?.oneTimeOpenQuestCount || 0),
    limitedOpenQuestCount: Number(snapshot.diagnostics?.limitedOpenQuestCount || 0),
    graphQuestCount: Number(snapshot.diagnostics?.graphQuestCount || snapshot.quests.length),
    lockedPlanningQuestCount: Number(snapshot.diagnostics?.lockedPlanningQuestCount || 0),
    successorPlanningQuestCount: Number(snapshot.diagnostics?.successorPlanningQuestCount || 0),
    maximumPlanningQuestCount: Number(snapshot.diagnostics?.maximumPlanningQuestCount || 0),
    successorGraphTruncated,
    successorQueueRemainingCount: Number(snapshot.diagnostics?.successorQueueRemainingCount || 0),
    extraOperationStatuses: snapshot.extraOperationStatus,
    accountStatus: snapshot.diagnostics?.accountStatus || 'unknown',
    accountReasonCode: snapshot.diagnostics?.accountReasonCode || null,
    shipCount: Number(snapshot.diagnostics?.shipCount || 0),
    japaneseQuestMetadataStatus: snapshot.diagnostics?.japaneseQuestMetadataStatus || 'unknown',
    japaneseQuestMetadataMessage: snapshot.diagnostics?.japaneseQuestMetadataMessage || null,
    questTitleSourceCounts: snapshot.diagnostics?.questTitleSourceCounts || {},
    elapsedMs: Number(snapshot.diagnostics?.elapsedMs || 0),
    outcome: reasonCodes.length > 0 ? 'degraded' : 'success',
    reasonCodes,
  })
  return rankQuestRecommendations(snapshot.quests, {
    now,
    extraOperationStatus: snapshot.extraOperationStatus,
    account: snapshot.account,
  })
}

export { KC3_QUEST_SNAPSHOT_SCRIPT, synchronizedQuestScript }
