const stale = () => ({
  status: 'error',
  error: {
    code: 'SNAPSHOT_SUPERSEDED',
    message: '帳號資料已重新同步，請使用最新資料重新產生推薦。',
  },
})

export const createSnapshotCache = ({ logger = () => {}, notify = () => {}, maxResults = 128 }) => {
  let generation = 0,
    snapshot = null,
    pending = null,
    disposed = false
  const results = new Map(),
    calculations = new Map(),
    versions = new WeakMap()
  const current = (value) => !disposed && value === snapshot && versions.get(value) === generation
  const read = (load, force = false) => {
    if (disposed) return Promise.resolve(stale())
    if (!force && pending) return pending
    if (!force && snapshot) return Promise.resolve(snapshot)
    const version = ++generation
    const startedAt = Date.now()
    snapshot = null
    results.clear()
    calculations.clear()
    const promise = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (disposed || version !== generation) return stale()
          if (value.status !== 'error') {
            snapshot = value
            versions.set(value, version)
          }
          logger('recommendation.snapshot-completed', {
            snapshotVersion: version,
            outcome: snapshot ? 'success' : 'failed',
            reasonCode: value.error?.code ?? null,
            elapsedMs: Date.now() - startedAt,
          })
          pending = null
          notify({ version, phase: snapshot ? 'completed' : 'failed' })
          return value
        },
        (error) => {
          if (version === generation) {
            pending = null
            logger('recommendation.snapshot-failed', {
              snapshotVersion: version,
              outcome: 'failed',
              reasonCode: 'SNAPSHOT_READ_FAILED',
              message: String(error?.message || error).slice(0, 240),
              elapsedMs: Date.now() - startedAt,
            })
            notify({ version, phase: 'failed' })
          }
          throw error
        },
      )
    pending = promise
    logger('recommendation.snapshot-invalidated', {
      snapshotVersion: version,
      reasonCode: force ? 'EXPLICIT_REFRESH' : 'INITIAL_READ',
      outcome: 'invalidated',
    })
    notify({ version, phase: 'invalidated' })
    return promise
  }
  const calculate = (value, key, run) => {
    if (!current(value)) return Promise.resolve(stale())
    if (results.has(key)) return Promise.resolve(results.get(key))
    if (calculations.has(key)) return calculations.get(key)
    const promise = Promise.resolve()
      .then(run)
      .then((result) => {
        if (!current(value)) return stale()
        if (result.status !== 'error') {
          if (results.size >= maxResults) results.delete(results.keys().next().value)
          results.set(key, result)
        }
        return result
      })
      .finally(() => {
        if (calculations.get(key) === promise) calculations.delete(key)
      })
    calculations.set(key, promise)
    return promise
  }
  const dispose = () => {
    disposed = true
    snapshot = null
    pending = null
    results.clear()
    calculations.clear()
  }
  return {
    read,
    calculate,
    current,
    version: (value) => versions.get(value),
    dispose,
    has: (key) => results.has(key),
  }
}
