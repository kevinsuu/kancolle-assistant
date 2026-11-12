import questUnlockCorrections from './data/quest-unlock-corrections.json'

const MAX_SYNCHRONIZED_QUEST_COUNT = 2_048
const QUEST_RESOURCE_REWARDS_STORAGE_KEY = 'kancolle-assistant.quest-resource-rewards.v1'

const escapeScriptLineTerminators = (source) =>
  source.replace(/[\u2028\u2029]/g, (character) => (character === '\u2028' ? '\\u2028' : '\\u2029'))

// Normalizes the bundled KanColle Quest Navigator prerequisite snapshot. KC3's `unlock` metadata
// often lists only one prerequisite for quests that require several, so the snapshot merges both
// sources as a union. Invalid data disables the correction instead of breaking recommendations.
export const normalizeQuestUnlockCorrections = (data) => {
  if (!data || data.schemaVersion !== 1 || !data.unlock || typeof data.unlock !== 'object') {
    return { status: 'invalid', sourceUpdatedAt: null, unlock: {} }
  }
  const unlock = {}
  Object.entries(data.unlock).forEach(([questId, successorIds]) => {
    const id = Number(questId)
    if (!Number.isInteger(id) || id <= 0 || !Array.isArray(successorIds)) return
    const ids = [...new Set(successorIds.map(Number))].filter(
      (successorId) => Number.isInteger(successorId) && successorId > 0 && successorId !== id,
    )
    if (ids.length > 0) unlock[id] = ids
  })
  return {
    status: Object.keys(unlock).length > 0 ? 'available' : 'invalid',
    sourceUpdatedAt:
      typeof data.source?.sourceUpdatedAt === 'string'
        ? data.source.sourceUpdatedAt.slice(0, 40)
        : null,
    unlock,
  }
}

const QUEST_UNLOCK_CORRECTIONS = normalizeQuestUnlockCorrections(questUnlockCorrections)

const synchronizedQuestScript = (quests) => {
  if (!Array.isArray(quests) || quests.length > MAX_SYNCHRONIZED_QUEST_COUNT) {
    throw new Error('KC3 synchronized quest list is invalid')
  }
  const serializedQuests = escapeScriptLineTerminators(JSON.stringify(quests))
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
    const resourceRewards = Object.fromEntries(
      quests
        .filter((quest) => quest && quest !== -1 && Number(quest.api_no) > 0)
        .map((quest) => [
          Number(quest.api_no),
          Array.isArray(quest.api_get_material)
            ? quest.api_get_material.slice(0, 4).map((value) => {
                const number = Number(value)
                return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
              })
            : [0, 0, 0, 0],
        ]),
    )
    window.__kancolleAssistantQuestResourceRewards = resourceRewards
    try {
      window.localStorage?.setItem(
        '${QUEST_RESOURCE_REWARDS_STORAGE_KEY}',
        JSON.stringify(resourceRewards),
      )
    } catch {}
    window.KC3QuestManager.load()
    window.KC3QuestManager.definePage(quests, undefined, 0)
    window.__kancolleAssistantQuestSynchronizedAt = new Date().toISOString()
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

const kc3QuestSnapshotScript = (unlockCorrections) => `(async () => {
  if (!window.KC3QuestManager || !window.KC3Meta) {
    throw new Error('KC3 quest managers are not ready')
  }

  const startedAt = window.performance.now()
  const now = Date.now()
  const unlockCorrections = ${escapeScriptLineTerminators(JSON.stringify(unlockCorrections))}
  const unlockCorrectionAddedEdges = new Map()
  const unlockCorrectionUnknownQuestIds = new Set()
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
  let japaneseQuestMetadataReasonCode = null
  let metadataTimer
  try {
    // KC3Translation.getJSONWithOptions uses synchronous XHR, blocking every KC3 control
    // while the extension resource is loading. Never call it from a recommendation snapshot.
    if (typeof window.fetch === 'function' && typeof window.KC3Meta.repo === 'string') {
      const controller = new AbortController()
      const timeout = new Promise((_, reject) => {
        metadataTimer = window.setTimeout(() => {
          reject(Object.assign(new Error('Japanese quest metadata load timed out'), {
            code: 'KC3_QUEST_METADATA_TIMEOUT',
          }))
          controller.abort()
        }, 3_000)
      })
      const loadMetadata = async () => {
        const response = await window.fetch(window.KC3Meta.repo + 'lang/data/jp/quests.json', {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('Japanese quest metadata request failed')
        const data = await response.json()
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Japanese quest metadata is invalid')
        }
        return data
      }
      japaneseQuests = await Promise.race([loadMetadata(), timeout])
      japaneseQuestMetadataStatus = 'available'
    }
  } catch (error) {
    japaneseQuests = {}
    japaneseQuestMetadataStatus = 'failed'
    japaneseQuestMetadataReasonCode = error?.code === 'KC3_QUEST_METADATA_TIMEOUT'
      ? 'KC3_QUEST_METADATA_TIMEOUT'
      : 'KC3_QUEST_METADATA_LOAD_FAILED'
    japaneseQuestMetadataMessage = japaneseQuestMetadataReasonCode === 'KC3_QUEST_METADATA_TIMEOUT'
      ? 'Japanese quest metadata load timed out'
      : 'Japanese quest metadata load failed'
  } finally {
    if (metadataTimer !== undefined) window.clearTimeout(metadataTimer)
  }
  const questTitleSourceByQuestId = new Map()
  let storedResourceRewards = {}
  try {
    const stored = JSON.parse(
      window.localStorage?.getItem('${QUEST_RESOURCE_REWARDS_STORAGE_KEY}') || '{}',
    )
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      storedResourceRewards = stored
    }
  } catch {}
  const synchronizedResourceRewards = window.__kancolleAssistantQuestResourceRewards || {}

  const mergedUnlockIds = (questId, meta) => {
    const kc3UnlockIds = Array.isArray(meta.unlock)
      ? meta.unlock.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
    const kc3UnlockIdSet = new Set(kc3UnlockIds)
    const unknownIds = []
    const addedIds = (unlockCorrections.unlock[questId] || []).filter((id) => {
      if (kc3UnlockIdSet.has(id)) return false
      // Quests KC3 does not know yet cannot be named, ranked, or reset correctly.
      if (!window.KC3Meta.quest(id)) {
        unknownIds.push(id)
        return false
      }
      return true
    })
    return { ids: [...new Set([...kc3UnlockIds, ...addedIds])], addedIds, unknownIds }
  }

  const unlockIdsFor = (questId, meta) => {
    const { ids, addedIds, unknownIds } = mergedUnlockIds(questId, meta)
    unknownIds.forEach((id) => unlockCorrectionUnknownQuestIds.add(id))
    if (addedIds.length > 0) unlockCorrectionAddedEdges.set(questId, addedIds.length)
    return ids
  }

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
    const resourceValue = (value) => {
      const number = Number(value)
      return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0
    }
    const materialRewards = Array.isArray(raw.api_get_material)
      ? raw.api_get_material
      : Array.isArray(synchronizedResourceRewards[questId])
        ? synchronizedResourceRewards[questId]
        : Array.isArray(storedResourceRewards[questId])
          ? storedResourceRewards[questId]
          : []
    // KC3's Japanese memo lists guaranteed rewards before 選択報酬; a 戦果 inside the choice
    // block is optional and is intentionally not shown as a guaranteed reward.
    const guaranteedRewardText = String(japaneseMeta.memo || '').split('選択報酬')[0]
    const rankingPointMatch = guaranteedRewardText.match(/戦果\\s*[+＋]\\s*(\\d+)/)
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
      unlockIds: unlockIdsFor(questId, meta),
      rewardConsumables: Array.isArray(meta.rewardConsumables)
        ? meta.rewardConsumables.slice(0, 4).map((value) => Number(value || 0))
        : [0, 0, 0, 0],
      rewardResources: {
        fuel: resourceValue(materialRewards[0]),
        ammo: resourceValue(materialRewards[1]),
        steel: resourceValue(materialRewards[2]),
        bauxite: resourceValue(materialRewards[3]),
      },
      rewardRankingPoints: rankingPointMatch ? resourceValue(rankingPointMatch[1]) : 0,
    }
  }

  const storedQuests = Object.values(window.KC3QuestManager.list || {})
  const storedQuestsById = new Map(storedQuests.map((quest) => [Number(quest.id), quest]))
  const synchronizedOpenQuests = storedQuests
    .filter((quest) => quest && (Number(quest.status) === 1 || Number(quest.status) === 2))
    .map((quest) => questSnapshot(Number(quest.id), quest))
  const activeQuestCount = synchronizedOpenQuests.filter(({ status }) => status === 2).length
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

  // The relation graph covers the whole known catalog, including completed prerequisites, so the
  // page can draw any quest's upstream and downstream chain. It is display-only data and never
  // enters ranking. Time-limited quests appear only while they are open or active.
  const maximumRelationGraphQuestCount = 2048
  const relationGraphCandidateIds = new Set([
    ...storedQuestsById.keys(),
    ...Object.keys(unlockCorrections.unlock).map(Number),
    ...Object.values(unlockCorrections.unlock).flat(),
  ])
  const relationGraphNodes = []
  const relationGraphUnlockIds = new Map()
  let relationGraphTruncated = false
  ;[...relationGraphCandidateIds]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right)
    .forEach((id) => {
      const meta = window.KC3Meta.quest(id)
      if (!meta) return
      const status = Number(storedQuestsById.get(id)?.status || 0)
      const limited = meta.hash !== undefined && meta.hash !== null
      if (limited && status !== 1 && status !== 2) return
      if (relationGraphNodes.length >= maximumRelationGraphQuestCount) {
        relationGraphTruncated = true
        return
      }
      const japaneseMeta = japaneseQuests[id] || {}
      relationGraphNodes.push({
        id,
        code: String(meta.code || id).slice(0, 40),
        name: String(
          window.__kancolleAssistantJapaneseQuestTitles?.[id] || japaneseMeta.name || meta.name || '',
        ).slice(0, 120),
        state: status === 3 ? 'completed' : status === 2 ? 'active' : status === 1 ? 'open' : 'locked',
      })
      relationGraphUnlockIds.set(id, mergedUnlockIds(id, meta).ids)
    })
  const relationGraphEdges = []
  relationGraphUnlockIds.forEach((successorIds, id) => {
    successorIds.forEach((successorId) => {
      if (relationGraphUnlockIds.has(successorId)) relationGraphEdges.push([id, successorId])
    })
  })
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
    synchronizedAt:
      typeof window.__kancolleAssistantQuestSynchronizedAt === 'string'
        ? window.__kancolleAssistantQuestSynchronizedAt
        : null,
    quests,
    relationGraph: {
      nodes: relationGraphNodes,
      edges: relationGraphEdges,
      truncated: relationGraphTruncated,
    },
    extraOperationStatus,
    account,
    diagnostics: {
      storedQuestCount,
      supportedRepeatableTypeCount: supportedRepeatableEntries.length,
      openQuestCount: openQuestIds.size,
      activeQuestCount,
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
      resourceRewardQuestCount: quests.filter(({ rewardResources }) =>
        Object.values(rewardResources || {}).some((value) => Number(value) > 0),
      ).length,
      rankingPointRewardQuestCount: quests.filter(
        ({ rewardRankingPoints }) => Number(rewardRankingPoints) > 0,
      ).length,
      accountStatus: account.status,
      accountReasonCode,
      shipCount: account.shipMasterIds.length,
      japaneseQuestMetadataStatus,
      japaneseQuestMetadataMessage,
      japaneseQuestMetadataReasonCode,
      questTitleSourceCounts,
      relationGraphNodeCount: relationGraphNodes.length,
      relationGraphEdgeCount: relationGraphEdges.length,
      relationGraphTruncated,
      unlockCorrectionStatus: unlockCorrections.status,
      unlockCorrectionSourceUpdatedAt: unlockCorrections.sourceUpdatedAt,
      unlockCorrectionAddedEdgeCount: [...unlockCorrectionAddedEdges.values()].reduce(
        (count, value) => count + value,
        0,
      ),
      unlockCorrectionCorrectedQuestCount: unlockCorrectionAddedEdges.size,
      unlockCorrectionUnknownQuestCount: unlockCorrectionUnknownQuestIds.size,
      elapsedMs: Math.round(window.performance.now() - startedAt),
    },
  }
})()`

const KC3_QUEST_SNAPSHOT_SCRIPT = kc3QuestSnapshotScript(QUEST_UNLOCK_CORRECTIONS)

const RELATION_GRAPH_STATES = new Set(['completed', 'active', 'open', 'locked'])
const MAX_RELATION_GRAPH_NODE_COUNT = 2_048
const MAX_RELATION_GRAPH_EDGE_COUNT = 8_192

// Bounds and type-checks the display-only quest relation graph before it crosses IPC.
export const normalizeQuestRelationGraph = (graph) => {
  const nodes = (Array.isArray(graph?.nodes) ? graph.nodes : [])
    .slice(0, MAX_RELATION_GRAPH_NODE_COUNT)
    .filter((node) => Number.isInteger(node?.id) && node.id > 0)
    .map((node) => ({
      id: node.id,
      code: String(node.code ?? node.id).slice(0, 40),
      name: String(node.name ?? '').slice(0, 120),
      state: RELATION_GRAPH_STATES.has(node.state) ? node.state : 'locked',
    }))
  const nodeIds = new Set(nodes.map(({ id }) => id))
  const edges = (Array.isArray(graph?.edges) ? graph.edges : [])
    .slice(0, MAX_RELATION_GRAPH_EDGE_COUNT)
    .filter(
      (edge) =>
        Array.isArray(edge) && nodeIds.has(edge[0]) && nodeIds.has(edge[1]) && edge[0] !== edge[1],
    )
    .map(([from, to]) => [from, to])
  return { nodes, edges, truncated: graph?.truncated === true }
}

const validateSnapshot = (snapshot) => {
  if (!snapshot || !Array.isArray(snapshot.quests)) {
    throw new Error('KC3 quest snapshot is invalid')
  }
  const generatedAt = new Date(snapshot.generatedAt).getTime()
  if (!Number.isFinite(generatedAt)) throw new Error('KC3 quest snapshot time is invalid')
  return generatedAt
}

const validSynchronizedAt = (value) => {
  if (typeof value !== 'string') return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export const readKC3QuestRecommendations = async (
  webContents,
  logger = () => {},
  { synchronizedQuestList, rankQuests } = {},
) => {
  if (synchronizedQuestList) {
    const startedAt = Date.now()
    logger('quest-recommendation.live-apply-started', {
      operation: 'apply-current-quest-list',
      synchronizedQuestCount: synchronizedQuestList.filter((quest) => quest && quest !== -1).length,
      outcome: 'started',
      reasonCodes: [],
    })
    try {
      await webContents.executeJavaScript(synchronizedQuestScript(synchronizedQuestList), true)
      logger('quest-recommendation.live-apply-completed', {
        operation: 'apply-current-quest-list',
        elapsedMs: Date.now() - startedAt,
        outcome: 'success',
        reasonCodes: [],
      })
    } catch (error) {
      logger('quest-recommendation.live-apply-failed', {
        operation: 'apply-current-quest-list',
        elapsedMs: Date.now() - startedAt,
        outcome: 'failed',
        reasonCodes: ['KC3_QUEST_SYNC_APPLY_FAILED'],
        message: String(error?.message || error)
          .replace(/\s+/g, ' ')
          .slice(0, 240),
      })
      throw error
    }
  }
  logger('quest-recommendation.snapshot-started', {
    operation: 'read-kc3-open-quests',
    syncMode: synchronizedQuestList ? 'live' : 'local',
    outcome: 'started',
    reasonCodes: [],
  })
  const snapshot = await webContents.executeJavaScript(KC3_QUEST_SNAPSHOT_SCRIPT, true)
  const now = validateSnapshot(snapshot)
  const synchronizedAt = validSynchronizedAt(snapshot.synchronizedAt)
  const snapshotSource = synchronizedAt ? 'liveSync' : 'localCache'
  const activeQuestCount = Number(
    snapshot.diagnostics?.activeQuestCount ??
      snapshot.quests.filter(({ status }) => status === 2).length,
  )
  const successorGraphTruncated = snapshot.diagnostics?.successorGraphTruncated === true
  const localizedTitleFallbackCount = Number(
    snapshot.diagnostics?.questTitleSourceCounts?.localizedFallback || 0,
  )
  const reasonCodes = [
    ...(snapshot.diagnostics?.japaneseQuestMetadataReasonCode
      ? [snapshot.diagnostics.japaneseQuestMetadataReasonCode]
      : []),
    ...(successorGraphTruncated ? ['KC3_QUEST_SUCCESSOR_GRAPH_TRUNCATED'] : []),
    ...(localizedTitleFallbackCount > 0 ? ['KC3_JAPANESE_QUEST_TITLE_UNAVAILABLE'] : []),
    ...(snapshot.diagnostics?.relationGraphTruncated === true
      ? ['QUEST_RELATION_GRAPH_TRUNCATED']
      : []),
    ...(snapshot.diagnostics?.unlockCorrectionStatus === 'invalid'
      ? ['QUEST_UNLOCK_CORRECTIONS_INVALID']
      : []),
  ]
  logger('quest-recommendation.snapshot-completed', {
    operation: 'read-kc3-open-quests',
    storedQuestCount: Number(snapshot.diagnostics?.storedQuestCount || 0),
    supportedRepeatableTypeCount: Number(snapshot.diagnostics?.supportedRepeatableTypeCount || 0),
    openQuestCount: Number(
      snapshot.diagnostics?.openQuestCount ??
        snapshot.quests.filter(({ status }) => status === 1 || status === 2).length,
    ),
    activeQuestCount,
    questAcceptanceCapacity: 5,
    snapshotSource,
    synchronizedAt,
    oneTimeOpenQuestCount: Number(snapshot.diagnostics?.oneTimeOpenQuestCount || 0),
    limitedOpenQuestCount: Number(snapshot.diagnostics?.limitedOpenQuestCount || 0),
    graphQuestCount: Number(snapshot.diagnostics?.graphQuestCount || snapshot.quests.length),
    lockedPlanningQuestCount: Number(snapshot.diagnostics?.lockedPlanningQuestCount || 0),
    successorPlanningQuestCount: Number(snapshot.diagnostics?.successorPlanningQuestCount || 0),
    maximumPlanningQuestCount: Number(snapshot.diagnostics?.maximumPlanningQuestCount || 0),
    successorGraphTruncated,
    successorQueueRemainingCount: Number(snapshot.diagnostics?.successorQueueRemainingCount || 0),
    resourceRewardQuestCount: Number(snapshot.diagnostics?.resourceRewardQuestCount || 0),
    rankingPointRewardQuestCount: Number(snapshot.diagnostics?.rankingPointRewardQuestCount || 0),
    extraOperationStatuses: snapshot.extraOperationStatus,
    accountStatus: snapshot.diagnostics?.accountStatus || 'unknown',
    accountReasonCode: snapshot.diagnostics?.accountReasonCode || null,
    shipCount: Number(snapshot.diagnostics?.shipCount || 0),
    japaneseQuestMetadataStatus: snapshot.diagnostics?.japaneseQuestMetadataStatus || 'unknown',
    japaneseQuestMetadataMessage: snapshot.diagnostics?.japaneseQuestMetadataMessage || null,
    questTitleSourceCounts: snapshot.diagnostics?.questTitleSourceCounts || {},
    relationGraphNodeCount: Number(snapshot.diagnostics?.relationGraphNodeCount || 0),
    relationGraphEdgeCount: Number(snapshot.diagnostics?.relationGraphEdgeCount || 0),
    relationGraphTruncated: snapshot.diagnostics?.relationGraphTruncated === true,
    unlockCorrectionStatus: snapshot.diagnostics?.unlockCorrectionStatus || 'unknown',
    unlockCorrectionSourceUpdatedAt: snapshot.diagnostics?.unlockCorrectionSourceUpdatedAt || null,
    unlockCorrectionAddedEdgeCount: Number(
      snapshot.diagnostics?.unlockCorrectionAddedEdgeCount || 0,
    ),
    unlockCorrectionCorrectedQuestCount: Number(
      snapshot.diagnostics?.unlockCorrectionCorrectedQuestCount || 0,
    ),
    unlockCorrectionUnknownQuestCount: Number(
      snapshot.diagnostics?.unlockCorrectionUnknownQuestCount || 0,
    ),
    elapsedMs: Number(snapshot.diagnostics?.elapsedMs || 0),
    outcome: reasonCodes.length > 0 ? 'degraded' : 'success',
    reasonCodes,
  })
  const rankingStartedAt = Date.now()
  const rankingFields = { operation: 'rank-quest-value-chains', questCount: snapshot.quests.length }
  logger('quest-recommendation.ranking-started', {
    ...rankingFields,
    executionMode: 'worker',
    outcome: 'started',
    reasonCodes: [],
  })
  let ranked
  try {
    if (typeof rankQuests !== 'function') {
      throw Object.assign(new Error('Quest ranking worker is unavailable'), {
        code: 'KC3_QUEST_WORKER_UNAVAILABLE',
      })
    }
    ranked = await rankQuests({
      quests: snapshot.quests,
      options: {
        now,
        extraOperationStatus: snapshot.extraOperationStatus,
        account: snapshot.account,
      },
    })
    logger('quest-recommendation.ranking-completed', {
      ...rankingFields,
      candidateCount: ranked.candidateCount,
      elapsedMs: Date.now() - rankingStartedAt,
      outcome: 'success',
      reasonCodes: [],
    })
  } catch (error) {
    logger('quest-recommendation.ranking-failed', {
      ...rankingFields,
      elapsedMs: Date.now() - rankingStartedAt,
      outcome: 'failed',
      reasonCodes: [error?.code || 'KC3_QUEST_RANKING_FAILED'],
    })
    throw Object.assign(new Error('Quest ranking failed'), { code: 'KC3_QUEST_RANKING_FAILED' })
  }
  return {
    ...ranked,
    relationGraph: normalizeQuestRelationGraph(snapshot.relationGraph),
    activeQuestCount,
    questAcceptanceCapacity: 5,
    snapshotSource,
    synchronizedAt,
  }
}

export { KC3_QUEST_SNAPSHOT_SCRIPT, kc3QuestSnapshotScript, synchronizedQuestScript }
