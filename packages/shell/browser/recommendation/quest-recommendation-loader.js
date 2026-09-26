import { QUEST_RECOMMENDATIONS_CHANNEL } from './channels'

// A failed live request must not hide usable KC3 data. Reading the local snapshot
// is the same operation as reopening the page; never replay the game API request.
export const loadQuestRecommendationResult = async ({
  invoke,
  forceSync = false,
  previousResult = null,
  isCurrent = () => true,
  logger = (event, data) => console.info('[KancolleQuestLoad]', { event, ...data }),
}) => {
  const startedAt = Date.now()
  const read = async (live) => {
    try {
      const result = await invoke(QUEST_RECOMMENDATIONS_CHANNEL, { forceSync: live })
      return result?.status === 'success' || result?.status === 'error'
        ? result
        : { status: 'error', error: { code: 'KC3_QUEST_RESPONSE_INVALID' } }
    } catch {
      // Do not expose transport messages, which may include account data.
      return { status: 'error', error: { code: 'KC3_QUEST_REQUEST_FAILED' } }
    }
  }
  logger('quest-recommendation.load-started', { forceSync, outcome: 'started' })
  const result = await read(forceSync)
  if (!isCurrent()) return null
  if (result.status === 'success') {
    logger('quest-recommendation.load-completed', {
      forceSync,
      outcome: 'success',
      elapsedMs: Date.now() - startedAt,
      candidateCount: Number(result.candidateCount || 0),
      reasonCodes: [],
    })
    return { result, warning: null }
  }
  const failure = result.error || { code: 'KC3_QUEST_DATA_UNAVAILABLE' }
  const reasonCodes = [failure.code || 'KC3_QUEST_DATA_UNAVAILABLE']
  if (forceSync) {
    logger('quest-recommendation.local-recovery-started', {
      outcome: 'started',
      reasonCodes,
      operation: 'read-local-quest-snapshot',
    })
    const local = await read(false)
    if (!isCurrent()) return null
    if (local.status === 'success') {
      logger('quest-recommendation.load-completed', {
        forceSync,
        outcome: 'recovered',
        source: 'localSnapshot',
        reasonCodes,
        candidateCount: Number(local.candidateCount || 0),
        elapsedMs: Date.now() - startedAt,
      })
      return { result: local, warning: failure }
    }
    reasonCodes.push(local.error?.code || 'KC3_QUEST_DATA_UNAVAILABLE')
  }
  const retained = previousResult?.status === 'success'
  logger('quest-recommendation.load-completed', {
    forceSync,
    outcome: retained ? 'retained' : 'failed',
    source: retained ? 'previousResult' : null,
    reasonCodes,
    candidateCount: retained ? Number(previousResult.candidateCount || 0) : 0,
    elapsedMs: Date.now() - startedAt,
  })
  return { result: retained ? previousResult : result, warning: retained ? failure : null }
}
