import assert from 'node:assert/strict'
import test from 'node:test'
import { loadQuestRecommendationResult } from '../browser/recommendation/quest-recommendation-loader'
import { questLoadErrorKey } from '../browser/recommendation/quest-recommendation-ui'

const success = { status: 'success', candidateCount: 1, recommendations: [{ id: 191 }] }
const failure = (code) => ({ status: 'error', error: { code } })
const fixture = (responses, options = {}) => {
  const calls = []
  const logs = []
  return {
    calls,
    logs,
    load: () =>
      loadQuestRecommendationResult({
        invoke: async (_channel, request) => {
          calls.push(request)
          const response = responses.shift()
          if (response instanceof Error) throw response
          return response
        },
        logger: (event, data) => logs.push({ event, ...data }),
        ...options,
      }),
  }
}

test('failed manual sync reads local quests without navigation or another game request', async () => {
  const f = fixture([failure('KC3_QUEST_SYNC_UNAVAILABLE'), success], { forceSync: true })
  const result = await f.load()
  assert.equal(result.result, success)
  assert.equal(result.warning.code, 'KC3_QUEST_SYNC_UNAVAILABLE')
  assert.deepEqual(f.calls, [{ forceSync: true }, { forceSync: false }])
  assert.equal(f.logs.at(-1).outcome, 'recovered')
  assert.equal(f.logs.at(-1).source, 'localSnapshot')
  assert.equal(f.logs.at(-1).candidateCount, 1)
  assert.deepEqual(f.logs.at(-1).reasonCodes, ['KC3_QUEST_SYNC_UNAVAILABLE'])
  assert.ok(f.logs.at(-1).elapsedMs >= 0)
})

test('successful manual sync needs no recovery and clears any warning', async () => {
  const f = fixture([success], { forceSync: true })
  assert.deepEqual(await f.load(), { result: success, warning: null })
  assert.equal(f.calls.length, 1)
  assert.equal(f.logs.at(-1).outcome, 'success')
})

test('recovery is bounded and retains a previously displayed list with a warning', async () => {
  const f = fixture([failure('KC3_QUEST_SYNC_UNAVAILABLE'), failure('KC3_UNAVAILABLE')], {
    forceSync: true,
    previousResult: success,
  })
  const loaded = await f.load()
  assert.equal(loaded.result, success)
  assert.equal(loaded.warning.code, 'KC3_QUEST_SYNC_UNAVAILABLE')
  assert.equal(f.calls.length, 2)
  assert.equal(f.logs.at(-1).outcome, 'retained')
  assert.deepEqual(f.logs.at(-1).reasonCodes, ['KC3_QUEST_SYNC_UNAVAILABLE', 'KC3_UNAVAILABLE'])
})

test('unavailable data without prior results returns an error and permits the next attempt', async () => {
  const f = fixture([failure('KC3_QUEST_RANKING_FAILED'), failure('KC3_UNAVAILABLE'), success], {
    forceSync: true,
  })
  const loaded = await f.load()
  assert.equal(loaded.result.error.code, 'KC3_QUEST_RANKING_FAILED')
  assert.equal(loaded.warning, null)
  assert.equal(f.logs.at(-1).outcome, 'failed')
  assert.equal((await f.load()).result, success)
})

test('transport rejection can recover locally without logging exception payloads', async () => {
  const f = fixture([new Error('private fixture payload'), success], { forceSync: true })
  assert.equal((await f.load()).result, success)
  assert.deepEqual(f.logs.at(-1).reasonCodes, ['KC3_QUEST_REQUEST_FAILED'])
  assert.ok(!JSON.stringify(f.logs).includes('private fixture payload'))
})

test('initial local loads never trigger game sync or automatic retry loops', async () => {
  const f = fixture([failure('KC3_UNAVAILABLE')])
  assert.equal((await f.load()).result.status, 'error')
  assert.deepEqual(f.calls, [{ forceSync: false }])
})

test('navigating away discards a late live response and skips recovery', async () => {
  const f = fixture([failure('KC3_UNAVAILABLE')], { forceSync: true, isCurrent: () => false })
  assert.equal(await f.load(), null)
  assert.equal(f.calls.length, 1)
})

test('navigating away during recovery discards its result', async () => {
  let currentChecks = 0
  const f = fixture([failure('KC3_UNAVAILABLE'), success], {
    forceSync: true,
    isCurrent: () => ++currentChecks === 1,
  })
  assert.equal(await f.load(), null)
  assert.equal(f.calls.length, 2)
})

test('quest load failure messages distinguish sync, ranking and local data failures', () => {
  assert.equal(questLoadErrorKey('KC3_QUEST_SYNC_UNAVAILABLE'), 'quest.syncFailedDetail')
  assert.equal(questLoadErrorKey('KC3_QUEST_RANKING_FAILED'), 'quest.rankingFailedDetail')
  assert.equal(questLoadErrorKey('KC3_UNAVAILABLE'), 'quest.loadFailedDetail')
})
