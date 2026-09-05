import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  ACCOUNT_CHANNEL,
  EXPEDITION_PLAN_CHANNEL,
  QUEST_RECOMMENDATIONS_CHANNEL,
  RECOMMEND_CHANNEL,
} from '../browser/recommendation/channels.js'
import {
  applyCombatEvaluations,
  registerRecommendationIpc,
} from '../browser/recommendation/recommendation-ipc.js'
import {
  readKC3AccountSnapshot,
  readKC3CombatEvaluations,
} from '../browser/recommendation/kc3-bridge.js'
import {
  KC3_QUEST_SNAPSHOT_SCRIPT,
  readKC3QuestRecommendations,
  synchronizedQuestScript,
} from '../browser/recommendation/kc3-quest-recommendation.js'
import { createKC3QuestLiveSync } from '../browser/recommendation/kc3-quest-live-sync.js'
import { createRecommendationWorkerService } from '../browser/recommendation/recommendation-worker-service.js'

class WorkerDouble extends EventEmitter {
  constructor(handler) {
    super()
    this.handler = handler
    this.messages = []
    this.terminated = false
  }

  postMessage(message) {
    this.messages.push(message)
    this.handler?.(this, message)
  }

  terminate() {
    this.terminated = true
    return Promise.resolve(0)
  }
}

test('recommendation worker service shares IDs across isolated operation workers', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new WorkerDouble((target, message) =>
        queueMicrotask(() =>
          target.emit('message', {
            type: 'recommendation:result',
            id: message.id,
            result: { operation: message.operation, input: message.input },
          }),
        ),
      )
      workers.push(worker)
      return worker
    },
    logger: () => {},
  })

  assert.deepEqual(await service.recommendFleet({ value: 1 }), {
    operation: 'fleet',
    input: { value: 1 },
  })
  assert.deepEqual(await service.planExpeditions({ value: 2 }), {
    operation: 'expedition',
    input: { value: 2 },
  })
  assert.deepEqual(await service.summarizeResourceLedger({ value: 3 }), {
    operation: 'resource-ledger',
    input: { value: 3 },
  })
  assert.deepEqual(
    workers.flatMap((worker) => worker.messages).map(({ id, operation }) => ({ id, operation })),
    [
      { id: 1, operation: 'fleet' },
      { id: 2, operation: 'expedition' },
      { id: 3, operation: 'resource-ledger' },
    ],
  )
  assert.equal(workers.length, 3)
  await service.dispose()
  assert.equal(workers[0].terminated, true)
})

test('recommendation worker service rebuilds after a worker error', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new WorkerDouble((target, message) => {
        if (workers.length === 1) {
          queueMicrotask(() => target.emit('error', new Error('fixture failure')))
          return
        }
        queueMicrotask(() =>
          target.emit('message', {
            type: 'recommendation:result',
            id: message.id,
            result: 'recovered',
          }),
        )
      })
      workers.push(worker)
      return worker
    },
    logger: () => {},
  })

  await assert.rejects(service.recommendFleet({}), /fixture failure/)
  assert.equal(await service.planExpeditions({}), 'recovered')
  assert.equal(workers.length, 2)
  assert.equal(workers[0].terminated, true)
  service.dispose()
})

test('recommendation worker service supports per-request timeout overrides', async () => {
  const workers = []
  const service = createRecommendationWorkerService({
    createWorker: () => {
      const worker = new WorkerDouble((target, message) => {
        if (workers.length === 1) return
        queueMicrotask(() =>
          target.emit('message', {
            type: 'recommendation:result',
            id: message.id,
            result: 'recovered',
          }),
        )
      })
      workers.push(worker)
      return worker
    },
    logger: () => {},
    timeoutMs: 50,
  })

  await assert.rejects(service.recommendFleet({}, { timeoutMs: 1 }), /timed out after 1ms/)
  assert.equal(workers[0].terminated, true)
  assert.equal(await service.planExpeditions({}), 'recovered')
  assert.equal(workers.length, 2)
  service.dispose()
})

test('KC3 quest snapshot ranks every fixed reset period with bounded diagnostics', async () => {
  const logs = []
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  let executedScript = ''
  const result = await readKC3QuestRecommendations(
    {
      executeJavaScript: async (script) => {
        executedScript = script
        return {
          generatedAt: new Date(now).toISOString(),
          quests: [
            {
              id: 265,
              code: 'Bm5',
              name: 'Monthly 1-5 fixture',
              status: 2,
              progress: 50,
              period: 'monthly',
              resetAt: now + 2 * 24 * 60 * 60 * 1000,
              memo: 'Rewards an Action Report.',
              rewardConsumables: [0, 0, 0, 0],
            },
            {
              id: 228,
              code: 'Bw5',
              name: 'Weekly submarines fixture',
              status: 1,
              progress: 0,
              period: 'weekly',
              resetAt: now + 24 * 60 * 60 * 1000,
              memo: '',
              rewardConsumables: [0, 0, 0, 1],
            },
            {
              id: 1107,
              code: 'By9',
              name: 'Yearly fixture',
              status: 1,
              progress: 0,
              period: 'yearly',
              resetPeriod: 'yearlySep',
              resetAt: now + 30 * 24 * 60 * 60 * 1000,
              memo: '',
              rewardConsumables: [0, 0, 0, 0],
            },
            {
              id: 500,
              code: 'B100',
              name: 'One-time fixture',
              status: 1,
              progress: 0,
              period: 'oneTime',
              resetPeriod: 'other',
              resetAt: null,
              memo: 'Rewards an Action Report.',
              rewardConsumables: [0, 0, 0, 0],
            },
            {
              id: 1031,
              code: '2605B5',
              name: 'Limited northern patrol fixture',
              status: 2,
              progress: 0,
              period: 'oneTime',
              resetPeriod: 'other',
              resetAt: null,
              limited: true,
              memo: '',
              rewardConsumables: [0, 0, 0, 0],
            },
          ],
          extraOperationStatus: { '1-5': 'available' },
          diagnostics: {
            storedQuestCount: 20,
            supportedRepeatableTypeCount: 16,
            openQuestCount: 5,
            oneTimeOpenQuestCount: 1,
            limitedOpenQuestCount: 1,
            graphQuestCount: 5,
            lockedPlanningQuestCount: 0,
            successorPlanningQuestCount: 0,
            maximumPlanningQuestCount: 1024,
            successorGraphTruncated: false,
            successorQueueRemainingCount: 0,
            elapsedMs: 4,
          },
        }
      },
    },
    (eventName, data) => logs.push({ eventName, data }),
  )

  assert.equal(executedScript, KC3_QUEST_SNAPSHOT_SCRIPT)
  assert.doesNotThrow(() => new Function(KC3_QUEST_SNAPSHOT_SCRIPT))
  assert.match(executedScript, /Object\.values\(window\.KC3QuestManager\.list/)
  assert.match(executedScript, /meta\.unlock/)
  assert.match(executedScript, /maximumSuccessorDepth = 12/)
  assert.match(executedScript, /maximumPlanningQuestCount = 1024/)
  assert.match(executedScript, /meta\.hash !== undefined/)
  assert.match(executedScript, /const quests = synchronizedOpenQuests/)
  assert.match(executedScript, /resetPeriod\.startsWith\('yearly'\)/)
  assert.match(executedScript, /supportedRepeatableEntries/)
  assert.match(
    executedScript,
    /\[1, 5\], \[2, 5\], \[3, 5\], \[4, 5\], \[5, 5\], \[6, 5\], \[7, 5\]/,
  )
  assert.match(executedScript, /window\.KC3ShipManager\.load\(\)/)
  assert.match(executedScript, /lastMaterial\?\.\[2\]/)
  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    [265, 228, 500, 1107, 1031],
  )
  assert.equal(result.oneTimeCount, 1)
  assert.equal(result.limitedCount, 1)
  assert.equal(result.recommendations.find(({ id }) => id === 265).reward.category, 'actionReport')
  assert.equal(
    result.recommendations.find(({ id }) => id === 265).synergies[0].id,
    'one-five-monthly-stack',
  )
  assert.deepEqual(logs, [
    {
      eventName: 'quest-recommendation.snapshot-completed',
      data: {
        operation: 'read-kc3-open-quests',
        storedQuestCount: 20,
        supportedRepeatableTypeCount: 16,
        openQuestCount: 5,
        oneTimeOpenQuestCount: 1,
        limitedOpenQuestCount: 1,
        graphQuestCount: 5,
        lockedPlanningQuestCount: 0,
        successorPlanningQuestCount: 0,
        maximumPlanningQuestCount: 1024,
        successorGraphTruncated: false,
        successorQueueRemainingCount: 0,
        extraOperationStatuses: { '1-5': 'available' },
        accountStatus: 'unknown',
        accountReasonCode: null,
        shipCount: 0,
        japaneseQuestMetadataStatus: 'unknown',
        japaneseQuestMetadataMessage: null,
        questTitleSourceCounts: {},
        elapsedMs: 4,
        outcome: 'success',
        reasonCodes: [],
      },
    },
  ])
})

test('KC3 quest live sync reuses only in-memory game authentication and requests all quests', async () => {
  const requests = []
  const requestSession = {
    fetch: async (url, options) => {
      requests.push({ url, options })
      return {
        ok: true,
        status: 200,
        text: async () =>
          `svdata=${JSON.stringify({
            api_result: 1,
            api_data: {
              api_list: [{ api_no: 191, api_state: 1 }, { api_no: 192, api_state: 2 }, -1],
            },
          })}`,
      }
    },
  }
  const liveSync = createKC3QuestLiveSync({ requestSession, now: () => 10_000 })
  const captured = await liveSync.observeRequest({
    method: 'POST',
    url: 'https://w01y.kancolle-server.com/kcsapi/api_port/port',
    webContentsId: 42,
    uploadData: [
      {
        bytes: Buffer.from(
          'api_token=secret-fixture&api_verno=1&api_starttime=123&unrelated=ignored',
        ),
      },
    ],
  })

  assert.equal(captured, true)
  assert.equal(liveSync.hasContext(42), true)
  const result = await liveSync.synchronize(42)
  assert.deepEqual(result, {
    quests: [{ api_no: 191, api_state: 1 }, { api_no: 192, api_state: 2 }, -1],
    gameWebContentsId: 42,
    elapsedMs: 0,
  })
  assert.equal(requests[0].url, 'https://w01y.kancolle-server.com/kcsapi/api_get_member/questlist')
  const sentBody = new URLSearchParams(requests[0].options.body)
  assert.equal(sentBody.get('api_tab_id'), '0')
  assert.equal(sentBody.get('api_page_no'), '1')
  assert.equal(sentBody.get('api_token'), 'secret-fixture')
  assert.equal(sentBody.has('unrelated'), false)
  assert.doesNotMatch(JSON.stringify(result), /secret-fixture/)
})

test('KC3 quest live sync rejects missing context and invalid server data with stable codes', async () => {
  const requestSession = {
    fetch: async () => ({ ok: true, status: 200, text: async () => 'svdata={"api_result":1}' }),
  }
  const liveSync = createKC3QuestLiveSync({ requestSession, now: () => 20_000 })
  await assert.rejects(liveSync.synchronize(9), {
    code: 'KC3_QUEST_SYNC_CONTEXT_UNAVAILABLE',
  })
  await liveSync.observeRequest({
    method: 'POST',
    url: 'https://w02k.kancolle-server.com/kcsapi/api_port/port',
    webContentsId: 9,
    uploadData: [{ bytes: Buffer.from('api_token=fixture') }],
  })
  await assert.rejects(liveSync.synchronize(9), {
    code: 'KC3_QUEST_SYNC_RESPONSE_INVALID',
  })
})

test('KC3 quest live sync is applied before the recommendation snapshot', async () => {
  const scripts = []
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const snapshot = {
    generatedAt: new Date(now).toISOString(),
    quests: [
      {
        id: 191,
        code: 'B191',
        name: 'Current quest fixture',
        status: 1,
        period: 'oneTime',
        rewardConsumables: [0, 0, 0, 0],
      },
    ],
    extraOperationStatus: {},
    diagnostics: { storedQuestCount: 1, openQuestCount: 1, graphQuestCount: 1 },
  }
  const result = await readKC3QuestRecommendations(
    {
      executeJavaScript: async (script) => {
        scripts.push(script)
        return scripts.length === 1 ? { synchronizedQuestCount: 1 } : snapshot
      },
    },
    () => {},
    {
      synchronizedQuestList: [{ api_no: 191, api_state: 1, api_title: '日本語の任務タイトル' }],
    },
  )

  assert.equal(scripts.length, 2)
  assert.match(scripts[0], /KC3QuestManager\.definePage\(quests, undefined, 0\)/)
  assert.match(scripts[0], /"api_no":191,"api_state":1,"api_title":"日本語の任務タイトル"/)
  assert.match(scripts[0], /__kancolleAssistantJapaneseQuestTitles/)
  assert.equal(scripts[1], KC3_QUEST_SNAPSHOT_SCRIPT)
  assert.equal(result.recommendations[0].id, 191)
})

test('an authoritative empty quest sync closes stale KC3 open and active quests', () => {
  const statuses = new Map([
    [191, { status: 1 }],
    [192, { status: 2 }],
  ])
  const manager = {
    open: [191, 192],
    active: [192],
    load: () => {},
    definePage: () => {},
    get: (questId) => statuses.get(questId),
    isOpen(questId, isOpen) {
      this.open = isOpen
        ? [...new Set([...this.open, questId])]
        : this.open.filter((id) => id !== questId)
    },
    isActive(questId, isActive) {
      this.active = isActive
        ? [...new Set([...this.active, questId])]
        : this.active.filter((id) => id !== questId)
    },
    save: () => {},
  }

  const windowFixture = { KC3QuestManager: manager }
  const result = new Function('window', `return ${synchronizedQuestScript([])}`)(windowFixture)
  assert.deepEqual(result, { synchronizedQuestCount: 0 })
  assert.deepEqual(windowFixture.__kancolleAssistantJapaneseQuestTitles, {})
  assert.deepEqual(manager.open, [])
  assert.deepEqual(manager.active, [])
  assert.equal(statuses.get(191).status, 3)
  assert.equal(statuses.get(192).status, 3)
})

test('KC3 quest snapshot always prefers official Japanese quest titles', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const calculateNextReset = () => now + 24 * 60 * 60 * 1000
  const repeatableTypes = Object.fromEntries(
    ['daily', 'weekly', 'monthly', 'quarterly', 'yearlyJan'].map((type) => [
      type,
      { questIds: [], calculateNextReset },
    ]),
  )
  const japaneseRequests = []
  const snapshot = new Function('window', `return ${KC3_QUEST_SNAPSHOT_SCRIPT}`)({
    performance: { now: () => 0 },
    KC3QuestManager: {
      list: {
        q680: { id: 680, status: 1, progress: 0 },
        q681: {
          id: 681,
          status: 1,
          progress: 0,
          raw: () => ({ api_title: 'ゲームAPIの日本語題名' }),
        },
      },
      load: () => {},
      repeatableTypes,
    },
    KC3Meta: {
      repo: '/data/',
      quest: (id) => ({
        code: `F${id}`,
        name: `Localized title ${id}`,
        desc: `Localized requirement ${id}`,
        memo: '',
        hash: id === 681 ? 'limited-fixture' : undefined,
        rewardConsumables: [0, 0, 0, 0],
      }),
    },
    KC3Translation: {
      getJSONWithOptions: (...args) => {
        japaneseRequests.push(args)
        return {
          680: {
            name: '対空兵装の整備拡充',
            desc: '「機銃」系装備x4を廃棄せよ！',
          },
        }
      },
    },
    KC3SortieManager: { getCurrentMapData: () => ({ clear: 1 }) },
  })

  assert.equal(snapshot.quests.find(({ id }) => id === 680).name, '対空兵装の整備拡充')
  assert.equal(
    snapshot.quests.find(({ id }) => id === 680).synergyDescription,
    '「機銃」系装備x4を廃棄せよ！',
  )
  assert.equal(
    snapshot.quests.find(({ id }) => id === 681).synergyDescription,
    'Localized requirement 681',
  )
  assert.equal(snapshot.quests.find(({ id }) => id === 681).name, 'ゲームAPIの日本語題名')
  assert.equal(snapshot.quests.find(({ id }) => id === 681).limited, true)
  assert.equal(snapshot.diagnostics.oneTimeOpenQuestCount, 1)
  assert.equal(snapshot.diagnostics.limitedOpenQuestCount, 1)
  assert.deepEqual(japaneseRequests[0].slice(0, 4), ['/data/', 'quests', false, 'jp'])
  assert.equal(snapshot.diagnostics.japaneseQuestMetadataStatus, 'available')
  assert.deepEqual(snapshot.diagnostics.questTitleSourceCounts, {
    gameApi: 1,
    japaneseMetadata: 1,
    localizedFallback: 0,
  })
})

test('KC3 quest snapshot reports a bounded Japanese-title fallback', () => {
  const now = Date.UTC(2026, 8, 1, 0, 0, 0)
  const repeatableTypes = Object.fromEntries(
    ['daily', 'weekly', 'monthly', 'quarterly', 'yearlyJan'].map((type) => [
      type,
      { questIds: [], calculateNextReset: () => now + 24 * 60 * 60 * 1000 },
    ]),
  )
  const snapshot = new Function('window', `return ${KC3_QUEST_SNAPSHOT_SCRIPT}`)({
    performance: { now: () => 0 },
    KC3QuestManager: {
      list: { q680: { id: 680, status: 1, progress: 0 } },
      load: () => {},
      repeatableTypes,
    },
    KC3Meta: {
      repo: '/data/',
      quest: () => ({ code: 'Fq6', name: 'Localized fallback', desc: '', memo: '' }),
    },
    KC3Translation: {
      getJSONWithOptions: () => {
        throw new Error('fixture metadata failure with a deliberately bounded message')
      },
    },
    KC3SortieManager: { getCurrentMapData: () => ({ clear: 1 }) },
  })

  assert.equal(snapshot.quests[0].name, 'Localized fallback')
  assert.equal(snapshot.quests[0].synergyDescription, '')
  assert.equal(snapshot.diagnostics.japaneseQuestMetadataStatus, 'failed')
  assert.equal(snapshot.diagnostics.questTitleSourceCounts.localizedFallback, 1)
  assert.match(snapshot.diagnostics.japaneseQuestMetadataMessage, /fixture metadata failure/)
})

test('KC3 quest snapshot degrades instead of failing when the successor graph is truncated', async () => {
  const rootQuestIds = Array.from({ length: 260 }, (_, index) => 2_000 + index)
  const list = Object.fromEntries(
    rootQuestIds.map((id) => [`q${id}`, { id, status: 1, progress: 0 }]),
  )
  const calculateNextReset = (now) => now + 24 * 60 * 60 * 1000
  const repeatableTypes = Object.fromEntries(
    ['daily', 'weekly', 'monthly', 'quarterly', 'yearlyJan'].map((type) => [
      type,
      { questIds: [], calculateNextReset },
    ]),
  )
  const windowFixture = {
    performance: { now: () => 0 },
    KC3QuestManager: { list, load: () => {}, repeatableTypes },
    KC3Meta: {
      quest: (id) => {
        const rootIndex = Number(id) - 2_000
        return {
          code: `Q${id}`,
          name: `Quest ${id}`,
          desc: '',
          memo: '',
          unlock:
            rootIndex >= 0 && rootIndex < rootQuestIds.length
              ? Array.from({ length: 4 }, (_, offset) => 10_000 + rootIndex * 4 + offset)
              : [],
          rewardConsumables: [0, 0, 0, 0],
        }
      },
    },
    KC3Translation: {
      getJSONWithOptions: () =>
        new Proxy({}, { get: (_target, id) => ({ name: `Japanese quest ${id}` }) }),
    },
    KC3SortieManager: { getCurrentMapData: () => ({ clear: 1 }) },
  }
  const snapshot = new Function('window', `return ${KC3_QUEST_SNAPSHOT_SCRIPT}`)(windowFixture)
  const logs = []
  const result = await readKC3QuestRecommendations(
    { executeJavaScript: async () => snapshot },
    (eventName, data) => logs.push({ eventName, data }),
  )

  assert.equal(snapshot.diagnostics.graphQuestCount, 1_024)
  assert.equal(snapshot.diagnostics.successorGraphTruncated, true)
  assert.equal(snapshot.diagnostics.successorQueueRemainingCount > 0, true)
  assert.equal(result.candidateCount, rootQuestIds.length)
  assert.equal(result.recommendations.length, rootQuestIds.length)
  assert.equal(logs[0].eventName, 'quest-recommendation.snapshot-completed')
  assert.equal(logs[0].data.outcome, 'degraded')
  assert.deepEqual(logs[0].data.reasonCodes, ['KC3_QUEST_SUCCESSOR_GRAPH_TRUNCATED'])
})

test('quest recommendation IPC validates senders and logs success and failure outcomes', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  let shouldFail = false
  let syncShouldFail = false
  const questReadOptions = []

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readQuestRecommendations: async (_target, _logger, options) => {
      questReadOptions.push(options)
      if (shouldFail) throw new Error('quest fixture unavailable')
      return {
        generatedAt: '2026-09-01T00:00:00.000Z',
        rankingVersion: 7,
        candidateCount: 5,
        periodCounts: {
          daily: 1,
          weekly: 1,
          monthly: 1,
          quarterly: 1,
          yearly: 1,
          oneTime: 0,
        },
        dailyCount: 1,
        weeklyCount: 1,
        monthlyCount: 1,
        quarterlyCount: 1,
        yearlyCount: 1,
        oneTimeCount: 0,
        limitedCount: 0,
        chapterCounts: { world1: 1 },
        downstreamValueQuestCount: 0,
        rewardCategoryCounts: { medalBlueprint: 1, screws: 1 },
        groupCount: 1,
        combinedGroupCount: 1,
        alternativeSynergyCount: 2,
        objectiveDerivedGroupCount: 1,
        objectiveProfiledQuestCount: 4,
        arsenalProfiledQuestCount: 6,
        derivedArsenalProfileCount: 3,
        derivedOnlyArsenalProfileCount: 1,
        groups: [
          {
            id: 'synergy:fixture-synergy',
            kind: 'combined',
            synergy: { id: 'fixture-synergy' },
          },
        ],
        recommendations: [
          {
            id: 249,
            period: 'monthly',
            resetAt: Date.UTC(2026, 9, 1),
            guidance: { tier: 'highest' },
            valueBand: 4,
            effectiveReward: { source: 'current' },
            synergies: [{ id: 'fixture-synergy' }],
          },
        ],
        elapsedMs: 1,
      }
    },
    syncQuestList: async () => {
      if (syncShouldFail) {
        throw Object.assign(new Error('No recent game context.'), {
          code: 'KC3_QUEST_SYNC_CONTEXT_UNAVAILABLE',
        })
      }
      return {
        quests: [{ api_no: 249, api_state: 1 }, -1],
        gameWebContentsId: 42,
        elapsedMs: 6,
      }
    },
    recommend: async () => {},
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  const success = await handlers.get(QUEST_RECOMMENDATIONS_CHANNEL)(event)
  assert.equal(success.status, 'success')
  assert.equal(success.recommendations[0].id, 249)
  assert.equal(questReadOptions[0].synchronizedQuestList, undefined)
  assert.equal(logs.at(-1).eventName, 'quest-recommendation.completed')
  assert.equal(logs.at(-1).data.operation, 'rank-quest-value-chains')
  assert.equal(logs.at(-1).data.rankingMode, 'feasibility-then-recurrence-and-effective-reward')
  assert.equal(logs.at(-1).data.dailyTieBreakMode, 'deferred-within-value-band')
  assert.deepEqual(logs.at(-1).data.valueBandOrder, [
    'valuableRepeatable',
    'valuableOneTime',
    'ordinaryRepeatable',
    'ordinaryOneTime',
  ])
  assert.deepEqual(logs.at(-1).data.periodCounts, {
    daily: 1,
    weekly: 1,
    monthly: 1,
    quarterly: 1,
    yearly: 1,
    oneTime: 0,
  })
  assert.equal(logs.at(-1).data.limitedCount, 0)
  assert.deepEqual(logs.at(-1).data.chapterCounts, { world1: 1 })
  assert.equal(logs.at(-1).data.syncMode, 'local')
  assert.equal(logs.at(-1).data.synchronizedQuestCount, 0)
  assert.equal(logs.at(-1).data.groupCount, 1)
  assert.equal(logs.at(-1).data.combinedGroupCount, 1)
  assert.equal(logs.at(-1).data.alternativeSynergyCount, 2)
  assert.equal(logs.at(-1).data.objectiveDerivedGroupCount, 1)
  assert.equal(logs.at(-1).data.objectiveProfiledQuestCount, 4)
  assert.equal(logs.at(-1).data.arsenalProfiledQuestCount, 6)
  assert.equal(logs.at(-1).data.derivedArsenalProfileCount, 3)
  assert.equal(logs.at(-1).data.derivedOnlyArsenalProfileCount, 1)
  assert.deepEqual(logs.at(-1).data.relationKindCounts, {})
  assert.deepEqual(logs.at(-1).data.rewardPriorityOrder, [
    'medalBlueprint',
    'actionReport',
    'screws',
    'other',
  ])
  assert.deepEqual(logs.at(-1).data.topQuestIds, [249])
  assert.deepEqual(logs.at(-1).data.topQuestPeriods, ['monthly'])
  assert.deepEqual(logs.at(-1).data.topGuidanceTiers, ['highest'])
  assert.deepEqual(logs.at(-1).data.topValueBands, [4])
  assert.deepEqual(logs.at(-1).data.topEffectiveRewardSources, ['current'])
  assert.deepEqual(logs.at(-1).data.synergyIds, ['fixture-synergy'])

  const synchronized = await handlers.get(QUEST_RECOMMENDATIONS_CHANNEL)(event, {
    forceSync: true,
  })
  assert.equal(synchronized.status, 'success')
  assert.deepEqual(questReadOptions.at(-1).synchronizedQuestList, [
    { api_no: 249, api_state: 1 },
    -1,
  ])
  assert.equal(logs.at(-2).eventName, 'quest-recommendation.live-sync-completed')
  assert.equal(logs.at(-2).data.gameWebContentsId, 42)
  assert.equal(logs.at(-2).data.synchronizedQuestCount, 1)
  assert.equal(logs.at(-2).data.elapsedMs, 6)
  assert.equal(logs.at(-1).data.syncMode, 'live')
  assert.equal(logs.at(-1).data.synchronizedQuestCount, 1)

  const invalidRequest = await handlers.get(QUEST_RECOMMENDATIONS_CHANNEL)(event, {
    forceSync: 'yes',
  })
  assert.equal(invalidRequest.error.code, 'INVALID_REQUEST')

  syncShouldFail = true
  const syncFailed = await handlers.get(QUEST_RECOMMENDATIONS_CHANNEL)(event, {
    forceSync: true,
  })
  assert.equal(syncFailed.error.code, 'KC3_QUEST_SYNC_UNAVAILABLE')
  assert.equal(logs.at(-1).eventName, 'quest-recommendation.live-sync-failed')
  assert.deepEqual(logs.at(-1).data.reasonCodes, ['KC3_QUEST_SYNC_CONTEXT_UNAVAILABLE'])
  syncShouldFail = false

  const rejected = await handlers.get(QUEST_RECOMMENDATIONS_CHANNEL)({
    sender: { getURL: () => 'https://example.com' },
    senderFrame: { url: 'https://example.com' },
  })
  assert.equal(rejected.status, 'error')

  shouldFail = true
  const failed = await handlers.get(QUEST_RECOMMENDATIONS_CHANNEL)(event)
  assert.equal(failed.status, 'error')
  assert.equal(failed.error.code, 'KC3_UNAVAILABLE')
  assert.equal(logs.at(-1).eventName, 'quest-recommendation.failed')
  assert.equal(logs.at(-1).data.operation, 'rank-quest-value-chains')
  assert.deepEqual(logs.at(-1).data.reasonCodes, ['KC3_QUEST_DATA_UNAVAILABLE'])
})

test('fleet recommendations reuse the KC3 account snapshot until an explicit refresh', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const recommendationInputs = []
  let snapshotCount = 0

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => {
      snapshotCount += 1
      return {
        generatedAt: `2026-08-26T00:00:0${snapshotCount}.000Z`,
        ships: Array.from({ length: snapshotCount }, (_, index) => ({ id: index + 1 })),
        equipment: [],
        metadata: { capabilities: {} },
      }
    },
    recommend: async (input) => {
      recommendationInputs.push(input)
      return {
        status: 'no-solution',
        analysis: { reasons: [] },
        elapsedMs: 0,
        solverVersion: 'fixture',
      }
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const accountResult = await handlers.get(ACCOUNT_CHANNEL)(event)
  const firstResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'balanced',
  })
  const secondResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
  })
  const cachedResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
  })
  const selectedRouteResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'boss-clear',
  })
  const refreshedAccountResult = await handlers.get(ACCOUNT_CHANNEL)(event, {
    forceRefresh: true,
  })
  const refreshedResult = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'boss-clear',
  })

  assert.equal(accountResult.account.shipCount, 1)
  assert.deepEqual(
    recommendationInputs
      .filter((input) => !input.routeId && input.candidateLimit !== 1)
      .map((input) => input.account.ships.length),
    [1, 1, 2],
  )
  assert.equal(firstResult.account.shipCount, 1)
  assert.equal(secondResult.account.shipCount, 1)
  assert.equal(cachedResult.account.shipCount, 1)
  assert.equal(selectedRouteResult.account.shipCount, 1)
  assert.equal(refreshedAccountResult.account.shipCount, 2)
  assert.equal(refreshedResult.account.shipCount, 2)
  assert.equal(snapshotCount, 2)
  assert.deepEqual(
    recommendationInputs
      .filter((input) => !input.routeId && input.candidateLimit !== 1)
      .map((input) => input.candidateLimit),
    [18, 18, 18],
  )
})

test('foreground selected-route recommendations log slow work but wait for the result', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const strategySender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const strategyEvent = {
    sender: strategySender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const recommendationInputs = []
  let resolveRecommendation

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    recommendationSlowThresholdMs: 1,
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async (input) => {
      recommendationInputs.push(input)
      return new Promise((resolve) => {
        resolveRecommendation = resolve
      })
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  let settled = false
  const resultPromise = handlers
    .get(RECOMMEND_CHANNEL)(strategyEvent, {
      mapId: '1-1',
      routeId: '1-1-guide-dd4',
      objective: 'balanced',
    })
    .finally(() => {
      settled = true
    })

  await new Promise((resolve) => setTimeout(resolve, 5))

  assert.equal(settled, false)
  assert.equal(recommendationInputs.length, 1)
  assert.equal(recommendationInputs[0].routeId, '1-1-guide-dd4')
  assert.equal(recommendationInputs[0].candidateLimit, 18)
  assert.equal(
    logs.some((log) => log.eventName === 'recommendation.slow'),
    true,
  )

  resolveRecommendation({
    status: 'no-solution',
    analysis: {
      reasons: [
        {
          code: 'AIR_POWER_INSUFFICIENT',
          values: { best: 412, minimum: 430 },
        },
      ],
    },
    diagnostics: {
      routeCandidateCount: 1,
      availableRouteCount: 1,
      evaluatedFleetCandidateCount: 6,
      gearSolutionCount: 18,
      currentFleetShipCount: 6,
      currentLoadoutCandidateCount: 2,
      currentLoadoutAcceptedCount: 0,
      currentLoadoutBestAirPower: 412,
      currentLoadoutBestLos: 65,
      currentFleetComparisonRouteCount: 1,
      currentFleetAlternativeCandidateCount: 5,
      currentFleetAlternativeAcceptedCount: 0,
      recommendationCandidateCount: 0,
      loadoutSearch: {
        planCount: 24,
        failedPlanCount: 6,
        flexibleCarrierFleetCount: 6,
        aswAllocationPlanCount: 0,
        specialAssignmentPlanCount: 12,
        emptyRegularSlotSolutionCount: 0,
        airPowerEvaluationCount: 100,
        airPowerCacheHitCount: 200,
        expandedStateCount: 1000,
        materializedStateCount: 120,
      },
      bestAirPower: 412,
      airPowerMinimum: 430,
      bestLos: 80,
      losMinimum: 66,
      reasonCodes: ['AIR_POWER_INSUFFICIENT'],
    },
    elapsedMs: 5,
    solverVersion: 'fixture',
  })

  const result = await resultPromise

  assert.equal(result.status, 'no-solution')
  assert.equal(result.account.shipCount, 1)
  assert.equal(
    logs.some((log) => log.eventName === 'recommendation.request-slow-completed'),
    true,
  )
  const completed = logs.find((log) => log.eventName === 'recommendation.completed')
  assert.equal(completed.data.routeId, '1-1-guide-dd4')
  assert.equal(completed.data.evaluatedFleetCandidateCount, 6)
  assert.equal(completed.data.gearSolutionCount, 18)
  assert.equal(completed.data.currentFleetShipCount, 6)
  assert.equal(completed.data.currentLoadoutCandidateCount, 2)
  assert.equal(completed.data.currentLoadoutAcceptedCount, 0)
  assert.equal(completed.data.currentLoadoutBestAirPower, 412)
  assert.equal(completed.data.currentLoadoutBestLos, 65)
  assert.equal(completed.data.currentFleetComparisonRouteCount, 1)
  assert.equal(completed.data.currentFleetAlternativeCandidateCount, 5)
  assert.equal(completed.data.currentFleetAlternativeAcceptedCount, 0)
  assert.equal(completed.data.loadoutSearch.planCount, 24)
  assert.equal(completed.data.loadoutSearch.failedPlanCount, 6)
  assert.equal(completed.data.loadoutSearch.airPowerEvaluationCount, 100)
  assert.equal(completed.data.loadoutSearch.airPowerCacheHitCount, 200)
  assert.equal(completed.data.loadoutSearch.expandedStateCount, 1000)
  assert.equal(completed.data.loadoutSearch.materializedStateCount, 120)
  assert.equal(completed.data.bestAirPower, 412)
  assert.equal(completed.data.airPowerMinimum, 430)
  assert.equal(completed.data.bestLos, 80)
  assert.equal(completed.data.losMinimum, 66)
  assert.deepEqual(completed.data.reasonCodes, ['AIR_POWER_INSUFFICIENT'])
})

test('successful recommendation logs bounded solver diagnostics', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const event = {
    sender: { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' },
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    readCombatEvaluations: async () => [],
    recommend: async () => ({
      status: 'success',
      recommendations: [],
      diagnostics: {
        routeCandidateCount: 1,
        availableRouteCount: 1,
        fleetSearchEligibleShipCount: 120,
        fleetSearchCandidatePoolCount: 80,
        fleetSearchRequiredCandidateCount: 24,
        fleetSearchInfeasiblePartialStateCount: 36,
        fleetSearchMaxDepth: 6,
        fleetSearchCompleteStateCount: 400,
        fleetSearchConstraintValidStateCount: 12,
        fleetSearchSpecialAttackRejectedCount: 0,
        fleetSearchZeroCandidateRouteCount: 0,
        evaluatedFleetCandidateCount: 4,
        gearSolutionCount: 12,
        currentFleetShipCount: 6,
        currentLoadoutCandidateCount: 1,
        currentLoadoutAcceptedCount: 1,
        currentLoadoutBestAirPower: 448,
        currentLoadoutBestLos: 72,
        currentFleetComparisonRouteCount: 1,
        currentFleetAlternativeCandidateCount: 3,
        currentFleetAlternativeAcceptedCount: 2,
        recommendationCandidateCount: 3,
        loadoutSearch: {
          planCount: 12,
          failedPlanCount: 2,
          flexibleCarrierFleetCount: 4,
          aswAllocationPlanCount: 6,
          specialAssignmentPlanCount: 0,
          emptyRegularSlotSolutionCount: 1,
          airPowerEvaluationCount: 50,
          airPowerCacheHitCount: 80,
          expandedStateCount: 600,
          materializedStateCount: 60,
        },
        bestAirPower: 448,
        airPowerMinimum: 430,
        bestLos: 76,
        losMinimum: 66,
        zuiunCutInCandidateCount: 2,
        zuiunCutInFallbackCandidateCount: 1,
        reasonCodes: [],
      },
      elapsedMs: 8,
      solverVersion: 'fixture',
    }),
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  const result = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'balanced',
  })

  assert.equal(result.status, 'success')
  const completed = logs.find((log) => log.eventName === 'recommendation.completed')
  assert.equal(completed.data.fleetSearchEligibleShipCount, 120)
  assert.equal(completed.data.fleetSearchCandidatePoolCount, 80)
  assert.equal(completed.data.fleetSearchRequiredCandidateCount, 24)
  assert.equal(completed.data.fleetSearchInfeasiblePartialStateCount, 36)
  assert.equal(completed.data.fleetSearchMaxDepth, 6)
  assert.equal(completed.data.fleetSearchCompleteStateCount, 400)
  assert.equal(completed.data.fleetSearchConstraintValidStateCount, 12)
  assert.equal(completed.data.fleetSearchSpecialAttackRejectedCount, 0)
  assert.equal(completed.data.fleetSearchZeroCandidateRouteCount, 0)
  assert.equal(completed.data.evaluatedFleetCandidateCount, 4)
  assert.equal(completed.data.gearSolutionCount, 12)
  assert.equal(completed.data.currentFleetShipCount, 6)
  assert.equal(completed.data.currentLoadoutCandidateCount, 1)
  assert.equal(completed.data.currentLoadoutAcceptedCount, 1)
  assert.equal(completed.data.currentLoadoutBestAirPower, 448)
  assert.equal(completed.data.currentLoadoutBestLos, 72)
  assert.equal(completed.data.currentFleetComparisonRouteCount, 1)
  assert.equal(completed.data.currentFleetAlternativeCandidateCount, 3)
  assert.equal(completed.data.currentFleetAlternativeAcceptedCount, 2)
  assert.equal(completed.data.recommendationCandidateCount, 3)
  assert.equal(completed.data.loadoutSearch.planCount, 12)
  assert.equal(completed.data.loadoutSearch.emptyRegularSlotSolutionCount, 1)
  assert.equal(completed.data.loadoutSearch.airPowerEvaluationCount, 50)
  assert.equal(completed.data.loadoutSearch.airPowerCacheHitCount, 80)
  assert.equal(completed.data.loadoutSearch.expandedStateCount, 600)
  assert.equal(completed.data.loadoutSearch.materializedStateCount, 60)
  assert.equal(completed.data.bestAirPower, 448)
  assert.equal(completed.data.airPowerMinimum, 430)
  assert.equal(completed.data.bestLos, 76)
  assert.equal(completed.data.losMinimum, 66)
  assert.equal(completed.data.zuiunCutInCandidateCount, 2)
  assert.equal(completed.data.zuiunCutInFallbackCandidateCount, 1)
  assert.deepEqual(completed.data.reasonCodes, [])
})

test('selected opening-ASW routes retain the full KC3 validation candidate pool', async () => {
  const handlers = new Map()
  const inputs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const event = {
    sender: { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' },
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async (input) => {
      inputs.push(input)
      return { status: 'no-solution', analysis: { reasons: [] } }
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-5',
    routeId: '1-5-boss-light',
    objective: 'balanced',
  })

  assert.equal(inputs[0].candidateLimit, 18)
})

test('fleet recommendation IPC preserves the worker defensive timeout', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const strategySender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const strategyEvent = {
    sender: strategySender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    recommendationSlowThresholdMs: 1,
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async () => {
      throw new Error('Recommendation worker timed out after 30000ms')
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const result = await handlers.get(RECOMMEND_CHANNEL)(strategyEvent, {
    mapId: '1-1',
    routeId: '1-1-guide-dd4',
    objective: 'balanced',
  })

  assert.equal(result.status, 'error')
  assert.equal(result.error.code, 'RECOMMENDATION_TIMEOUT')
  assert.doesNotMatch(result.error.message, /3 秒/)
})

test('expedition planner IPC logs flattened summary and copyable JSON details', async () => {
  const handlers = new Map()
  const logs = []
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = {
    getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html',
    executeJavaScript: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
      maxResource: 350000,
      modifierFactor: 1,
      accountShips: [],
      fleetNumbers: [2],
      candidates: [
        {
          id: 1,
          displayNo: '01',
          name: 'Practice voyage',
          durationMinutes: 20,
          baseIncome: { fuel: 30, ammo: 30, steel: 0, bauxite: 0 },
          bucketMaxPerTrip: 0,
          bucketReward: null,
          fuelPercent: 0.1,
          ammoPercent: 0.1,
          requirements: {
            flagShipLevel: 1,
            flagShipTypeOf: null,
            shipCount: 2,
            levelCount: null,
            totalAsw: null,
            totalLos: null,
            totalAa: null,
            totalFp: null,
            totalTorp: null,
            drumCount: null,
            drumCarrierCount: null,
            fleetSType: [],
            sampleFleet: [],
          },
          greatSuccessCondition: { type: 'unknown' },
          monthly: false,
          fleetChecks: [],
        },
      ],
    }),
  }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const scoreDetails = {
    expectedNetYield: { fuel: 10, ammo: 20, steel: 0, bauxite: 0, bucket: 0 },
    benchmark: { fuel: 10, ammo: 20, steel: 0, bauxite: 0, bucket: 0 },
    satisfaction: { fuel: 1, ammo: 1, steel: 0, bauxite: 0, bucket: 0 },
    utility: { fuel: 1, ammo: 1, steel: 0, bauxite: 0, bucket: 0 },
    normalizedWeight: { fuel: 0.5, ammo: 0.5, steel: 0, bauxite: 0, bucket: 0 },
    weightedContribution: { fuel: 0.5, ammo: 0.5, steel: 0, bauxite: 0, bucket: 0 },
    totalScore: 1,
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({ status: 'error' }),
    recommend: async () => ({ status: 'no-solution', analysis: { reasons: [] } }),
    planExpeditions: async ({ request }) => {
      assert.equal(request.debug, true)
      return {
        status: 'success',
        generatedAt: '2026-08-29T00:00:00.000Z',
        current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
        resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
        maxResource: 350000,
        candidateCount: 1,
        combinationCount: 1,
        prunedCombinationCount: 1,
        settings: {
          afkMinutes: 0,
          fleetCount: 1,
          comparisonWindowMinutes: 60,
          resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
          bucketWeight: 0,
          mode: 'online',
          incomeModifier: { greatSuccess: false, daihatsuCount: 0, factor: 1 },
          usesExpeditionTableCostConfig: false,
          resupplyCostModel: 'kancepts-account',
        },
        plans: [
          {
            pairings: [
              {
                expedition: { displayNo: '01', name: 'Practice voyage' },
                fleet: { fleetNumber: 2 },
              },
            ],
            scoreDetails,
          },
        ],
        optimizationDebug: {
          context: {
            totalCombinationCount: 1,
            paretoRemovedCount: 0,
            remainingCombinationCount: 1,
          },
          topCombinations: [{ expeditionIds: ['01'], totalScore: 1 }],
        },
      }
    },
    summarizeResourceLedger: async () => {},
    logger: (eventName, data) => logs.push({ eventName, data }),
  })

  const result = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    resourceWeights: { fuel: 5, ammo: 5, steel: 0, bauxite: 0 },
    afkMinutes: 0,
    fleetCount: 1,
    candidateIds: [1],
    bucketWeight: 0,
    debug: true,
    incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  })

  assert.equal(result.status, 'success')
  const completed = logs.find((log) => log.eventName === 'expedition-planner.completed')
  assert.ok(completed)
  assert.equal(completed.data.scoring[0].expeditions, '01')
  assert.equal(Object.hasOwn(completed.data.scoring[0], 'scoreDetails'), false)
  const scoringJsonLog = logs.find(
    (log) => log.eventName === 'expedition-planner.completed.scoring-json',
  )
  assert.ok(scoringJsonLog)
  assert.doesNotMatch(scoringJsonLog.data, /\[Array\]|\[Object\]/)
  const scoringJson = JSON.parse(scoringJsonLog.data.trim())
  assert.equal(scoringJson.plans[0].resources.fuel.expectedNetYield, 10)
  const optimizationJsonLog = logs.find(
    (log) => log.eventName === 'expedition-planner.completed.optimization-debug-json',
  )
  assert.ok(optimizationJsonLog)
  assert.doesNotMatch(optimizationJsonLog.data, /\[Array\]|\[Object\]/)
  assert.equal(JSON.parse(optimizationJsonLog.data.trim()).context.totalCombinationCount, 1)
})

test('expedition planner IPC accepts only five-step weights from -5 to 20', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = {
    getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html',
    executeJavaScript: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
      maxResource: 350000,
      modifierFactor: 1,
      accountShips: [],
      fleetNumbers: [],
      candidates: [],
    }),
  }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const calls = []
  const baseRequest = {
    resourceWeights: { fuel: 0, ammo: 0, steel: 0, bauxite: 0 },
    afkMinutes: 0,
    fleetCount: 1,
    candidateIds: [1],
    bucketWeight: 0,
    debug: false,
    incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({ status: 'error' }),
    recommend: async () => ({ status: 'no-solution', analysis: { reasons: [] } }),
    planExpeditions: async ({ request }) => {
      calls.push(request)
      return {
        status: 'no-solution',
        reason: 'fixture',
        reasonCode: 'INSUFFICIENT_EXPEDITIONS',
        reasonValues: {},
        generatedAt: '2026-08-29T00:00:00.000Z',
        current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
        maxResource: 350000,
      }
    },
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const invalid = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    resourceWeights: { ...baseRequest.resourceWeights, fuel: 3 },
  })
  assert.equal(invalid.status, 'error')
  assert.equal(invalid.error.code, 'INVALID_REQUEST')
  assert.equal(calls.length, 0)

  const valid = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    resourceWeights: { ...baseRequest.resourceWeights, fuel: -5 },
    bucketWeight: -5,
  })
  assert.equal(valid.status, 'no-solution')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].resourceWeights.fuel, -5)
  assert.equal(calls[0].bucketWeight, -5)
})

test('expedition planner IPC converts priority preferences before planning', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = {
    getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html',
    executeJavaScript: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
      maxResource: 350000,
      modifierFactor: 1,
      accountShips: [],
      fleetNumbers: [],
      candidates: [],
    }),
  }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }
  const calls = []
  const baseRequest = {
    preference: {
      mode: 'priority',
      priorities: { bucket: 1, fuel: 2, bauxite: 3, ammo: 4, steel: 5 },
    },
    afkMinutes: 0,
    fleetCount: 1,
    candidateIds: [1],
    debug: false,
    incomeModifier: { greatSuccess: false, daihatsuCount: 0 },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({ status: 'error' }),
    recommend: async () => ({ status: 'no-solution', analysis: { reasons: [] } }),
    planExpeditions: async ({ request }) => {
      calls.push(request)
      return {
        status: 'no-solution',
        reason: 'fixture',
        reasonCode: 'INSUFFICIENT_EXPEDITIONS',
        reasonValues: {},
        generatedAt: '2026-08-29T00:00:00.000Z',
        current: { fuel: 1000, ammo: 2000, steel: 3000, bauxite: 4000 },
        maxResource: 350000,
      }
    },
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const valid = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, baseRequest)
  assert.equal(valid.status, 'no-solution')
  assert.deepEqual(calls[0].resourceWeights, { fuel: 70, ammo: 25, steel: 10, bauxite: 45 })
  assert.equal(calls[0].bucketWeight, 100)
  assert.deepEqual(calls[0].preference, {
    mode: 'priority',
    preferences: {
      bucket: { mode: 'optimize', rank: 1 },
      fuel: { mode: 'optimize', rank: 2 },
      bauxite: { mode: 'optimize', rank: 3 },
      ammo: { mode: 'optimize', rank: 4 },
      steel: { mode: 'optimize', rank: 5 },
    },
  })

  const constrained = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    preference: {
      mode: 'priority',
      preferences: {
        fuel: { mode: 'optimize', rank: 1 },
        bauxite: { mode: 'optimize', rank: 2 },
        ammo: { mode: 'constraint', minimumNetYieldPerHour: 0 },
        steel: { mode: 'ignore' },
        bucket: { mode: 'ignore' },
      },
    },
  })
  assert.equal(constrained.status, 'no-solution')
  assert.deepEqual(calls[1].resourceWeights, { fuel: 100, ammo: 0, steel: 0, bauxite: 70 })
  assert.equal(calls[1].bucketWeight, 0)
  assert.deepEqual(calls[1].preference.preferences.ammo, {
    mode: 'constraint',
    minimumNetYieldPerHour: 0,
  })

  const duplicate = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    preference: {
      mode: 'priority',
      priorities: { bucket: 1, fuel: 1, bauxite: 2, ammo: null, steel: null },
    },
  })
  assert.equal(duplicate.status, 'error')
  assert.equal(duplicate.error.code, 'INVALID_REQUEST')

  const skipped = await handlers.get(EXPEDITION_PLAN_CHANNEL)(event, {
    ...baseRequest,
    preference: {
      mode: 'priority',
      priorities: { bucket: 1, fuel: 3, bauxite: null, ammo: null, steel: null },
    },
  })
  assert.equal(skipped.status, 'error')
  assert.equal(skipped.error.code, 'INVALID_REQUEST')
})

test('fleet recommendation renderer payload omits internal scores', async () => {
  const handlers = new Map()
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const sender = { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' }
  const event = {
    sender,
    senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
  }

  registerRecommendationIpc({
    ipcMain,
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot: async () => ({
      generatedAt: '2026-08-29T00:00:00.000Z',
      ships: [{ id: 1 }],
      equipment: [{ id: 101 }],
      metadata: { capabilities: {} },
    }),
    recommend: async () => ({
      status: 'success',
      recommendations: [
        {
          id: 'fixture-recommendation',
          title: 'Fixture',
          mapId: '1-1',
          route: {
            id: 'fixture-route',
            name: 'Fixture route',
            nodes: ['A', 'B'],
            description: 'Use the source route notes.',
            metadata: {
              confidence: 'verified',
              source: ['https://example.com/wiki', 'https://example.com/guide'],
              guideSources: ['https://example.com/guide'],
              lastVerified: '2026-08-29',
            },
          },
          ships: [
            {
              role: 'escort-destroyer',
              ship: {
                id: 1,
                name: 'Fubuki',
                level: 12,
                speed: 'fast',
                speedValue: 10,
                slotSizes: [0, 0],
                fastPlusPatterns: [],
              },
              equipment: [],
              expansionSlot: null,
            },
          ],
          metrics: {
            airPower: 0,
            airPowerRequired: false,
            airPowerMinimum: 0,
            los33: 0,
            losRequired: false,
            losMinimum: 0,
            openingAswCount: 0,
            openingAswRequired: false,
            openingAswMinimum: 0,
            estimatedFuelCost: 1,
            estimatedAmmoCost: 1,
            estimatedResourceGain: null,
            estimatedNetResourceGain: null,
            resourceTarget: null,
            landingCraftCount: 0,
            drumCount: 0,
            finalSpeedClass: 'fast',
          },
          score: { total: 99.9 },
          reasons: [
            { code: 'EQUIPMENT_INSTANCES_UNIQUE', message: 'internal' },
            { code: 'ROUTE_FIXED_COMPOSITION', message: 'visible' },
          ],
          warnings: [
            { code: 'HEURISTIC_COMBAT_SCORE', message: 'internal' },
            { code: 'LOW_LOS_MARGIN', message: 'visible' },
          ],
        },
      ],
      elapsedMs: 0,
      solverVersion: 'fixture',
    }),
    readCombatEvaluations: async () => {
      throw new Error('skip exact combat in fixture')
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: () => {},
  })

  const result = await handlers.get(RECOMMEND_CHANNEL)(event, {
    mapId: '1-1',
    objective: 'balanced',
  })

  assert.equal(result.status, 'success')
  assert.equal(Object.hasOwn(result.recommendations[0], 'score'), false)
  assert.equal(result.recommendations[0].route.description, 'Use the source route notes.')
  assert.deepEqual(result.recommendations[0].route.sources, ['https://example.com/guide'])
  assert.deepEqual(
    result.recommendations[0].reasons.map((reason) => reason.code),
    ['ROUTE_FIXED_COMPOSITION'],
  )
  assert.deepEqual(
    result.recommendations[0].warnings.map((warning) => warning.code),
    ['LOW_LOS_MARGIN'],
  )
})

const exactOaswFixture = () => {
  const stats = {
    hp: 30,
    firepower: 20,
    torpedo: 20,
    antiAir: 20,
    armor: 20,
    evasion: 40,
    asw: 80,
    los: 20,
    luck: 10,
  }
  const route = {
    id: '1-5-oasw-fixture',
    tags: ['oasw'],
    calculatedConstraints: [{ kind: 'opening-asw', minimum: 1 }],
  }
  const recommendation = (index) => ({
    id: `oasw-fixture-${index}`,
    mapId: '1-5',
    route,
    ships: [
      {
        role: 'anti-submarine',
        ship: { id: index, stats, fuelCost: 5, ammoCost: 5 },
        equipment: [],
        expansionSlot: null,
      },
    ],
    metrics: {
      airPower: 0,
      airPowerRequired: false,
      airPowerMinimum: 0,
      airPowerRecommended: 0,
      los33: 0,
      losRequired: false,
      losMinimum: 0,
      openingAswCount: 1,
      openingAswRequired: true,
      openingAswMinimum: 1,
      estimatedFuelCost: 5,
      estimatedAmmoCost: 5,
      estimatedResourceGain: null,
      estimatedNetResourceGain: null,
      resourceTarget: null,
      landingCraftCount: 0,
      drumCount: 0,
      nightCutInCandidates: 0,
      finalSpeedClass: 'fast',
    },
    reasons: [],
    warnings: [],
  })
  return {
    status: 'success',
    recommendations: [recommendation(1), recommendation(2)],
    diagnostics: {
      routeCandidateCount: 1,
      availableRouteCount: 1,
      evaluatedFleetCandidateCount: 2,
      gearSolutionCount: 2,
      recommendationCandidateCount: 2,
      bestAirPower: 0,
      airPowerMinimum: null,
      reasonCodes: [],
    },
    elapsedMs: 4,
    solverVersion: 'fixture',
  }
}

const exactCombatShip = (openingAswCapable) => ({
  effectiveStats: {
    firepower: 20,
    torpedo: 20,
    antiAir: 20,
    armor: 20,
    asw: 100,
    los: 20,
    bombing: 0,
    accuracy: 0,
    evasion: 40,
  },
  equipmentBonus: {
    firepower: 0,
    torpedo: 0,
    antiAir: 0,
    armor: 0,
    asw: 0,
    los: 0,
    bombing: 0,
    accuracy: 0,
    evasion: 0,
  },
  daySurfacePower: 0,
  nightSurfacePower: 0,
  antiInstallationDayPower: 0,
  antiInstallationNightPower: 0,
  antiSubmarineAttackCapable: true,
  openingAswCapable,
  antiSubmarinePower: 100,
  shellingAccuracy: 100,
})

test('exact KC3 loadout validation keeps only opening-ASW-capable candidates and logs the branch', () => {
  const logs = []
  const result = applyCombatEvaluations(
    exactOaswFixture(),
    [
      { id: 'oasw-fixture-1', ships: [exactCombatShip(false)] },
      { id: 'oasw-fixture-2', ships: [exactCombatShip(true)] },
    ],
    'balanced',
    {
      logger: (eventName, data) => logs.push({ eventName, data }),
      logContext: { mapId: '1-5', routeId: '1-5-oasw-fixture', objective: 'balanced' },
      elapsedMs: 7,
    },
  )

  assert.equal(result.status, 'success')
  assert.deepEqual(
    result.recommendations.map(({ id }) => id),
    ['oasw-fixture-2'],
  )
  assert.equal(result.recommendations[0].metrics.openingAswCount, 1)
  const completed = logs.find(
    ({ eventName }) => eventName === 'recommendation.oasw-loadout-validation-completed',
  )
  assert.equal(completed.data.candidateCount, 2)
  assert.equal(completed.data.rejectedCandidateCount, 1)
  assert.equal(completed.data.bestObservedOpeningAsw, 1)
  assert.equal(completed.data.requiredMinimum, 1)
  assert.equal(completed.data.outcome, 'passed')
  assert.equal(completed.data.elapsedMs, 7)
})

test('exact KC3 loadout validation returns diagnostic OASW failure when every candidate fails', () => {
  const logs = []
  const result = applyCombatEvaluations(
    exactOaswFixture(),
    [
      { id: 'oasw-fixture-1', ships: [exactCombatShip(false)] },
      { id: 'oasw-fixture-2', ships: [exactCombatShip(false)] },
    ],
    'balanced',
    { logger: (eventName, data) => logs.push({ eventName, data }) },
  )

  assert.equal(result.status, 'no-solution')
  assert.equal(result.analysis.reasons[0].code, 'OASW_INSUFFICIENT')
  assert.deepEqual(result.analysis.reasons[0].values, { best: 0, minimum: 1 })
  assert.equal(result.diagnostics.bestOpeningAsw, 0)
  assert.equal(result.diagnostics.openingAswMinimum, 1)
  const completed = logs.find(
    ({ eventName }) => eventName === 'recommendation.oasw-loadout-validation-completed',
  )
  assert.equal(completed.data.outcome, 'rejected-all')
  assert.deepEqual(completed.data.reasonCodes, ['OASW_INSUFFICIENT'])
})

test('KC3 account snapshot yields between expensive renderer batches', async () => {
  let script = ''
  const webContents = {
    executeJavaScript: async (source) => {
      script = source
      throw new Error('fixture stop')
    },
  }

  await assert.rejects(readKC3AccountSnapshot(webContents), /fixture stop/)
  assert.match(script, /^\(async \(\) => \{/)
  assert.match(script, /await mapResponsively\(shipList/)
  assert.match(script, /await mapResponsively\(gearList/)
  assert.match(script, /window\.setTimeout\(resolve, 0\)/)
  assert.match(script, /currentFleetShipIdGroups/)
  assert.match(script, /canonicalName: String\(master\.api_name \|\| ''\)/)
  assert.match(script, /ship\.equipmentTotalStats\('saku', true, true, true\)/)
  assert.doesNotThrow(() => new Function(script))
})

test('KC3 account snapshot logs bounded opening-ASW probe fallback diagnostics', async () => {
  const logs = []
  const rawSnapshot = {
    generatedAt: '2026-08-29T00:00:00.000Z',
    hqLevel: 120,
    ships: [
      {
        id: 1,
        masterId: 141,
        name: 'Fixture ship',
        canonicalName: 'Fixture canonical ship',
        level: 99,
        shipTypeId: 3,
        shipType: 'CL',
        speedValue: 10,
        stats: {
          hp: 30,
          firepower: 20,
          torpedo: 20,
          antiAir: 20,
          armor: 20,
          evasion: 40,
          asw: 80,
          los: 20,
          luck: 10,
        },
        nakedLos: 20,
        slotSizes: [0, 0, 0],
        equippedItemIds: [0, 0, 0],
        expansionSlotItemId: 0,
        expansionSlotUnlocked: false,
        expansionEquipableEquipmentIds: [],
        regularEquipableMasterIds: [1],
        openingAswRules: [],
        fastPlusPatterns: [],
        nightCarrierPatterns: [],
        locked: true,
        morale: 49,
        eventTag: 0,
        fuelCost: 15,
        ammoCost: 20,
      },
    ],
    equipment: [
      {
        id: 101,
        masterId: 1,
        name: 'Fixture gear',
        typeId: 14,
        iconTypeId: 14,
        type: '14',
        improvement: 0,
        proficiency: -1,
        locked: true,
        currentlyEquippedBy: 0,
        antiInstallationAircraft: false,
        stats: {
          firepower: 0,
          torpedo: 0,
          antiAir: 0,
          armor: 0,
          asw: 10,
          los: 0,
          bombing: 0,
          accuracy: 1,
          evasion: 0,
        },
        losImprovement: 0,
        airPowerBySlotSize: { 0: 0 },
      },
    ],
    currentFleetShipIds: [],
    capabilities: {
      accountShips: true,
      accountEquipment: true,
      masterData: true,
      currentFleet: true,
    },
    diagnostics: {
      openingAswProbe: {
        attemptedShipCount: 1,
        failedShipCount: 1,
        noEquipmentRuleCount: 0,
        sonarRuleCount: 0,
        failureMessages: ['fixture calculator error'],
        elapsedMs: 12,
      },
    },
  }
  const account = await readKC3AccountSnapshot(
    { executeJavaScript: async () => rawSnapshot },
    (eventName, data) => logs.push({ eventName, data }),
  )

  assert.equal(account.ships.length, 1)
  assert.equal(account.ships[0].name, 'Fixture ship')
  assert.equal(account.ships[0].canonicalName, 'Fixture canonical ship')
  const shipNamesCompleted = logs.find(
    ({ eventName }) => eventName === 'recommendation.ship-name-snapshot-completed',
  )
  assert.equal(shipNamesCompleted.data.shipCount, 1)
  assert.equal(shipNamesCompleted.data.localizedNameCount, 1)
  assert.equal(shipNamesCompleted.data.canonicalNameMissingCount, 0)
  assert.equal(shipNamesCompleted.data.fallbackResult, 'not-needed')
  assert.deepEqual(shipNamesCompleted.data.reasonCodes, [])
  assert.ok(shipNamesCompleted.data.elapsedMs >= 0)
  const completed = logs.find(
    ({ eventName }) => eventName === 'recommendation.oasw-snapshot-probe-completed',
  )
  assert.equal(completed.data.attemptedShipCount, 1)
  assert.equal(completed.data.failedShipCount, 1)
  assert.equal(completed.data.fallbackResult, 'generic-core-threshold')
  assert.deepEqual(completed.data.reasonCodes, ['KC3_OASW_PROBE_FAILED'])
  assert.deepEqual(completed.data.messages, ['fixture calculator error'])
  assert.equal(completed.data.elapsedMs, 12)

  delete rawSnapshot.ships[0].canonicalName
  const fallbackLogs = []
  const fallbackAccount = await readKC3AccountSnapshot(
    { executeJavaScript: async () => rawSnapshot },
    (eventName, data) => fallbackLogs.push({ eventName, data }),
  )
  assert.equal(fallbackAccount.ships[0].canonicalName, 'Fixture ship')
  const fallback = fallbackLogs.find(
    ({ eventName }) => eventName === 'recommendation.ship-name-snapshot-completed',
  )
  assert.equal(fallback.data.canonicalNameMissingCount, 1)
  assert.equal(fallback.data.fallbackResult, 'localized-name')
  assert.deepEqual(fallback.data.reasonCodes, ['KC3_CANONICAL_SHIP_NAME_MISSING'])
})

test('KC3 combat evaluation probes complete loadouts with current KC3 formulas', async () => {
  let script = ''
  const webContents = {
    executeJavaScript: async (source) => {
      script = source
      return []
    },
  }
  const result = await readKC3CombatEvaluations(webContents, [
    {
      id: 'fixture',
      mapId: '4-5',
      route: { tags: ['anti-installation'] },
      ships: [
        {
          ship: {
            id: 7,
            level: 99,
            stats: { hp: 50, firepower: 60, torpedo: 40, armor: 70, evasion: 80, asw: 20 },
            slotSizes: [18, 12],
          },
          equipment: [
            { id: 101, masterId: 1001, improvement: 7, proficiency: 0 },
            { id: 102, masterId: 1002, improvement: 0, proficiency: 7 },
          ],
          expansionSlot: { id: 103, masterId: 1003, improvement: 0, proficiency: -1 },
        },
      ],
    },
    {
      id: 'equivalent-instance-fixture',
      mapId: '4-5',
      route: { tags: ['anti-installation'] },
      ships: [
        {
          ship: {
            id: 7,
            level: 99,
            stats: { hp: 50, firepower: 60, torpedo: 40, armor: 70, evasion: 80, asw: 20 },
            slotSizes: [18, 12],
          },
          equipment: [
            { id: 201, masterId: 1001, improvement: 7, proficiency: 0 },
            { id: 202, masterId: 1002, improvement: 0, proficiency: 7 },
          ],
          expansionSlot: { id: 203, masterId: 1003, improvement: 0, proficiency: -1 },
        },
      ],
    },
  ])

  assert.deepEqual(result, [])
  assert.match(script, /equipmentTotalStats/)
  assert.match(script, /['"]both['"]/)
  assert.match(script, /shellingAccuracy/)
  assert.match(script, /antiLandWarfarePowerMods|applyPrecapModifiers/)
  assert.match(script, /canDoOASW/)
  assert.match(script, /canDoASW\(\)/)
  assert.match(script, /openingAswCapable/)
  assert.match(script, /antiSubmarineAttackCapable/)
  assert.match(script, /antiSubWarfarePower/)
  assert.match(script, /"equipmentIds":\[101,102\]/)
  assert.match(script, /__dameconCombatEvaluationCache/)
  assert.equal(script.match(/"shipId":7/g)?.length, 1)
  assert.doesNotThrow(() => new Function(script))
})

test('KC3 mixed routes execute both surface and ASW formulas for each complete loadout', async () => {
  const { runInNewContext } = await import('node:vm')
  const calls = []
  class ProbeShip {
    constructor() {
      this.slotnum = 3
    }
    equipmentTotalStats() {
      return [0, 0]
    }
    canDoDayShellingAttack() {
      return true
    }
    canDoNightAttack() {
      return true
    }
    isCarrier() {
      return false
    }
    shellingFirePower() {
      calls.push('surface')
      return 150
    }
    nightBattlePower() {
      calls.push('night')
      return 120
    }
    canDoOASW() {
      calls.push('oasw')
      return true
    }
    canDoASW() {
      return true
    }
    antiSubWarfarePower() {
      calls.push('asw')
      return 100
    }
    shellingAccuracy() {
      return { accuracy: 95 }
    }
    applyPowerCap(power) {
      return { power }
    }
  }
  const runtime = {
    KC3Ship: ProbeShip,
    KC3ShipManager: { get: () => ({ masterId: 1, hp: [30, 30], estimateNakedStats: () => 20 }) },
    KC3GearManager: {},
  }
  const result = exactOaswFixture()
  result.recommendations = result.recommendations.slice(0, 1)
  result.recommendations[0].ships[0].ship = {
    ...result.recommendations[0].ships[0].ship,
    level: 99,
    slotSizes: [0, 0, 0],
  }
  const evaluations = await readKC3CombatEvaluations(
    {
      executeJavaScript: async (source) => runInNewContext(source, { window: runtime }),
    },
    result.recommendations,
  )
  assert.deepEqual(calls, ['surface', 'night', 'oasw', 'asw'])
  assert.equal(evaluations[0].ships[0].daySurfacePower, 150)
  assert.equal(evaluations[0].ships[0].nightSurfacePower, 120)
  assert.equal(evaluations[0].ships[0].antiSubmarinePower, 100)
  assert.equal(evaluations[0].ships[0].openingAswCapable, true)
  ProbeShip.prototype.shellingAccuracy = () => {
    throw new Error('fixture accuracy failure')
  }
  await assert.rejects(
    readKC3CombatEvaluations(
      {
        executeJavaScript: async (source) =>
          runInNewContext(source, {
            window: { ...runtime, __dameconCombatEvaluationCache: undefined },
          }),
      },
      result.recommendations,
    ),
    /fixture accuracy failure/,
  )
})

test('exact reranking compares the same fleet variants before collapsing the result', () => {
  const result = exactOaswFixture()
  result.recommendations[1].ships[0].ship.id = result.recommendations[0].ships[0].ship.id
  const logs = []
  const output = applyCombatEvaluations(
    result,
    result.recommendations.map((item, index) => ({
      id: item.id,
      ships: [
        {
          ...exactCombatShip(true),
          daySurfacePower: index ? 600 : 50,
          nightSurfacePower: index ? 200 : 20,
        },
      ],
    })),
    'balanced',
    { logger: (event, data) => logs.push({ event, data }) },
  )
  assert.equal(output.recommendations.length, 1)
  assert.equal(output.recommendations[0].id, result.recommendations[1].id)
  const summary = logs.find((item) => item.event === 'recommendation.loadout-rerank-completed').data
  assert.equal(summary.sameFleetVariantCount, 1)
  assert.equal(summary.surfaceAndAswCandidateCount, 2)
  assert.equal(summary.outcome, 'passed')
  const failures = []
  applyCombatEvaluations(
    result,
    result.recommendations.map((item) => ({ id: item.id, ships: [exactCombatShip(false)] })),
    'balanced',
    {
      logger: (event, data) => failures.push({ event, data }),
    },
  )
  const rejected = failures.find(
    (item) => item.event === 'recommendation.loadout-rerank-completed',
  ).data
  assert.equal(rejected.outcome, 'no-eligible-candidate')
  assert.equal(rejected.eligibleCandidateCount, 0)
  assert.deepEqual(rejected.reasonCodes, ['OASW_INSUFFICIENT'])
})
const snapshotTestEvent = (id = 1) => ({
  sender: { id, getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' },
  senderFrame: { url: 'chrome-extension://fixture/pages/strategy/strategy.html' },
})
const snapshotTestAccount = (id) => ({
  generatedAt: String(id),
  ships: [{ id }],
  equipment: [],
  metadata: { capabilities: {} },
})
const snapshotTestIpc = (readAccountSnapshot) => {
  const handlers = new Map(),
    logs = [],
    inputs = []
  registerRecommendationIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getKc3ExtensionId: () => 'fixture',
    readAccountSnapshot,
    recommend: async (input) => {
      inputs.push(input)
      return {
        status: 'no-solution',
        analysis: { reasons: [] },
        elapsedMs: 0,
        solverVersion: 'fixture',
      }
    },
    planExpeditions: async () => {},
    summarizeResourceLedger: async () => {},
    logger: (name, data) => logs.push({ name, data }),
  })
  return { handlers, logs, inputs }
}

test('initial sync and different-map recommendations share one in-flight account capture', async () => {
  let release,
    calls = 0
  const { handlers, logs, inputs } = snapshotTestIpc(() => {
    calls += 1
    return new Promise((resolve) => {
      release = resolve
    })
  })
  const event = snapshotTestEvent()
  const sync = handlers.get(ACCOUNT_CHANNEL)(event)
  const map43 = handlers.get(RECOMMEND_CHANNEL)(event, { mapId: '4-3', objective: 'balanced' })
  const map44 = handlers.get(RECOMMEND_CHANNEL)(snapshotTestEvent(2), {
    mapId: '4-4',
    objective: 'balanced',
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 1)
  release(snapshotTestAccount(1))
  await Promise.all([sync, map43, map44])
  assert.equal(inputs.length, 2)
  assert.equal(inputs[0].account, inputs[1].account)
  const completed = logs.find(
    ({ name }) => name === 'recommendation.account-snapshot-request-completed',
  )
  assert.equal(completed.data.consumerCount, 3)
  assert.equal(completed.data.outcome, 'success')
  assert.equal(completed.data.shipCount, 1)
  assert.ok(completed.data.elapsedMs >= 0)
})

test('explicit refresh supersedes pending capture and invalidates other Strategy Room tabs', async () => {
  const releases = []
  const { handlers, logs } = snapshotTestIpc(() => new Promise((resolve) => releases.push(resolve)))
  const firstTab = snapshotTestEvent(),
    secondTab = snapshotTestEvent(2)
  const oldRead = handlers.get(ACCOUNT_CHANNEL)(firstTab)
  const refreshed = handlers.get(ACCOUNT_CHANNEL)(secondTab, { forceRefresh: true })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(releases.length, 2)
  releases[1](snapshotTestAccount(2))
  await refreshed
  releases[0](snapshotTestAccount(1))
  const oldResult = await oldRead
  assert.equal(oldResult.error.code, 'SNAPSHOT_SUPERSEDED')
  assert.equal((await handlers.get(ACCOUNT_CHANNEL)(firstTab)).account.generatedAt, '2')
  const next = handlers.get(ACCOUNT_CHANNEL)(secondTab, { forceRefresh: true })
  await new Promise((resolve) => setImmediate(resolve))
  releases[2](snapshotTestAccount(3))
  await next
  assert.equal((await handlers.get(ACCOUNT_CHANNEL)(firstTab)).account.generatedAt, '3')
  assert.equal(releases.length, 3)
  assert.ok(
    logs.some(
      ({ name, data }) =>
        name === 'recommendation.account-snapshot-request-completed' &&
        data.outcome === 'superseded',
    ),
  )
})

test('failed shared capture is diagnosed and a subsequent sync can retry', async () => {
  let calls = 0
  const { handlers, logs } = snapshotTestIpc(async () => {
    calls += 1
    if (calls === 1) throw new Error('KC3 account managers are not ready')
    return snapshotTestAccount(2)
  })
  const event = snapshotTestEvent()
  const results = await Promise.all([
    handlers.get(ACCOUNT_CHANNEL)(event),
    handlers.get(ACCOUNT_CHANNEL)(event),
  ])
  assert.equal(calls, 1)
  assert.ok(results.every((result) => result.status === 'error'))
  assert.equal((await handlers.get(ACCOUNT_CHANNEL)(event)).status, 'success')
  assert.equal(calls, 2)
  const failed = logs.find(
    ({ name, data }) =>
      name === 'recommendation.account-snapshot-request-completed' && data.outcome === 'failed',
  )
  assert.equal(failed.data.consumerCount, 2)
  assert.deepEqual(failed.data.reasonCodes, ['KC3_UNAVAILABLE'])
})

const createSnapshotSchedulingFixture = () => {
  let ticks = 0
  const calls = { tasks: 0, speed: 0, broadStats: 0, asw: 0 }
  class Gear {
    constructor(data = {}) {
      Object.assign(this, { itemId: 0, masterId: 0 }, data)
    }
  }
  class Ship {
    constructor(data) {
      Object.assign(this, data)
    }
    equipmentTotalStats(name) {
      if (name !== 'soku') return 0
      calls.speed += 1
      return this.items.some((id) => this.GearManager.get(id).masterId === 33) ? 5 : 0
    }
    statsBonusOnShip() {
      calls.broadStats += 1
      throw new Error('should only calculate speed')
    }
    canDoOASW() {
      calls.asw += 1
      if ('oasw' in this.statsCache) return this.statsCache.oasw
      const sonar = this.items.some((id) => this.GearManager.get(id).masterId === 1)
      return (this.statsCache.oasw = sonar && this.as[0] >= 100)
    }
  }
  const ship = new Ship({
    rosterId: 1,
    masterId: 141,
    level: 99,
    slotnum: 3,
    slots: [0, 0, 0],
    items: [1, -1, -1],
    ex_item: 0,
    as: [90, 120],
    hp: [30, 30],
    lock: 1,
  })
  const gear = new Gear({ itemId: 1, masterId: 1, stars: 0, ace: -1, lock: 1 })
  return {
    calls,
    window: {
      performance: { now: () => (ticks += 10) },
      scheduler: {
        postTask: async () => {
          calls.tasks += 1
        },
      },
      setTimeout: () => {
        throw new Error('background timers must not be needed')
      },
      KC3Ship: Ship,
      KC3Gear: Gear,
      KC3ShipManager: { load: () => {}, list: { 1: ship } },
      KC3GearManager: { load: () => {}, list: { 1: gear } },
      KC3Master: {
        available: true,
        ship: () => ({
          api_id: 141,
          api_name: 'Fixture',
          api_stype: 2,
          api_soku: 10,
          api_maxeq: [0, 0, 0],
        }),
        slotitem: (id) => ({
          api_id: id,
          api_name: 'Fixture gear',
          api_type: [0, 0, id === 1 ? 14 : 0, 0],
        }),
        equip_on_ship: () => 1,
      },
      PlayerManager: { hq: { level: 120, load: () => {} }, fleets: [], loadFleets: () => {} },
    },
  }
}

test('snapshot uses renderer tasks and narrow speed calculations without changing OASW thresholds', async () => {
  const fixture = createSnapshotSchedulingFixture(),
    logs = []
  const phaseMessages = []
  fixture.window.console = { info: (message) => phaseMessages.push(message) }
  const originalShip = JSON.stringify(fixture.window.KC3ShipManager.list[1])
  const account = await readKC3AccountSnapshot(
    {
      executeJavaScript: (source) => new Function('window', `return ${source}`)(fixture.window),
    },
    (name, data) => logs.push({ name, data }),
  )
  assert.deepEqual(account.ships[0].openingAswRules, [{ kind: 'sonar', minimumAsw: 100 }])
  assert.equal(JSON.stringify(fixture.window.KC3ShipManager.list[1]), originalShip)
  assert.ok(fixture.calls.tasks >= 3)
  assert.ok(fixture.calls.speed > 0)
  assert.equal(fixture.calls.broadStats, 0)
  const completed = logs.find(({ name }) => name === 'recommendation.account-snapshot-completed')
  assert.equal(completed.data.yieldStrategy, 'scheduler')
  assert.equal(completed.data.openingAswCloneCount, 2)
  assert.ok(completed.data.openingAswEvaluationCount > completed.data.openingAswCloneCount)
  assert.equal(completed.data.speedStatDirectCount, fixture.calls.speed)
  assert.equal(completed.data.speedStatFallbackCount, 0)
  assert.ok(completed.data.shipCaptureMs > 0)
  assert.deepEqual(
    phaseMessages.map((message) => JSON.parse(message.slice(message.indexOf(' ') + 1)).phase),
    ['managers-loaded', 'ships-completed', 'equipment-completed'],
  )
})

test('snapshot task fallback closes message ports and diagnoses capture failure', async () => {
  const fixture = createSnapshotSchedulingFixture(),
    logs = []
  let closed = 0
  delete fixture.window.scheduler
  fixture.window.MessageChannel = class {
    constructor() {
      this.port1 = {
        close: () => {
          closed += 1
        },
      }
      this.port2 = {
        close: () => {
          closed += 1
        },
        postMessage: () => queueMicrotask(() => this.port1.onmessage()),
      }
    }
  }
  await readKC3AccountSnapshot(
    {
      executeJavaScript: (source) => new Function('window', `return ${source}`)(fixture.window),
    },
    (name, data) => logs.push({ name, data }),
  )
  const completed = logs.find(({ name }) => name === 'recommendation.account-snapshot-completed')
  assert.equal(completed.data.yieldStrategy, 'message-channel')
  assert.equal(closed, completed.data.yieldCount * 2)
  await assert.rejects(
    readKC3AccountSnapshot(
      {
        executeJavaScript: async () => {
          throw new Error('fixture capture failed')
        },
      },
      (name, data) => logs.push({ name, data }),
    ),
    /fixture capture failed/,
  )
  const failed = logs.find(({ name }) => name === 'recommendation.account-snapshot-failed')
  assert.deepEqual(failed.data.reasonCodes, ['KC3_ACCOUNT_CAPTURE_FAILED'])
  assert.ok(failed.data.elapsedMs >= 0)
})

test('snapshot speed fallback preserves patterns and reports its compatibility branch', async () => {
  const direct = createSnapshotSchedulingFixture(),
    fallback = createSnapshotSchedulingFixture()
  const run = (fixture, logs) =>
    readKC3AccountSnapshot(
      {
        executeJavaScript: (source) => new Function('window', `return ${source}`)(fixture.window),
      },
      (name, data) => logs.push({ name, data }),
    )
  const expected = await run(direct, [])
  const proto = fallback.window.KC3Ship.prototype
  const speed = proto.equipmentTotalStats
  proto.statsBonusOnShip = function (name) {
    assert.equal(name, 'sp')
    return speed.call(this, 'soku')
  }
  delete proto.equipmentTotalStats
  const logs = [],
    account = await run(fallback, logs)
  assert.deepEqual(account.ships[0].fastPlusPatterns, expected.ships[0].fastPlusPatterns)
  const completed = logs.find(({ name }) => name === 'recommendation.account-snapshot-completed')
  assert.equal(completed.data.speedStatDirectCount, 0)
  assert.ok(completed.data.speedStatFallbackCount > 0)
})
