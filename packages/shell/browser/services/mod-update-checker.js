export const createModUpdateChecker = ({
  getConfig,
  setConfig,
  readMod,
  fetchUpdate,
  logger,
  now = Date.now,
  intervalMs = 3 * 60 * 60 * 1000,
  timeoutMs = 10_000,
}) => {
  let pending = null,
    nextCheckAt = 0,
    disposed = false,
    controller
  const check = () => {
    if (disposed) return Promise.resolve()
    if (pending) return pending
    if (now() < nextCheckAt) return Promise.resolve()
    nextCheckAt = now() + intervalMs
    controller = new AbortController()
    const signal = controller.signal
    const timer = setTimeout(() => controller?.abort(), timeoutMs)
    pending = (async () => {
      const startedAt = now()
      let checkedCount = 0,
        changedCount = 0,
        failedCount = 0
      const messages = []
      try {
        const original = getConfig()
        const mods = original.mods.map((mod) => ({ ...mod }))
        for (const mod of mods) {
          if (signal.aborted || disposed) break
          try {
            const data = await readMod(mod.path, signal)
            if (!data.updateUrl || now() - (mod.lastCheck || 0) < intervalMs) continue
            checkedCount++
            const update = await fetchUpdate(data.updateUrl, signal)
            mod.lastCheck = now()
            mod.latestVersion = update.version
            mod.url = update.downloadUrl || update.url || update.updateUrl
            changedCount++
          } catch (error) {
            failedCount++
            if (messages.length < 3) messages.push(String(error.message || error).slice(0, 240))
          }
        }
        const superseded = disposed || signal.aborted || original !== getConfig()
        if (changedCount && !superseded) await setConfig({ ...original, mods })
        logger('proxy.mod-check-completed', {
          checkedCount,
          changedCount: superseded ? 0 : changedCount,
          failedCount,
          outcome: superseded ? 'cancelled' : failedCount ? 'degraded' : 'success',
          reasonCodes: superseded
            ? ['MOD_CHECK_SUPERSEDED']
            : failedCount
              ? ['MOD_CHECK_FAILED']
              : [],
          messages,
          elapsedMs: now() - startedAt,
        })
      } catch (error) {
        logger('proxy.mod-check-failed', {
          checkedCount,
          failedCount,
          outcome: 'failed',
          reasonCode: 'MOD_CHECK_FAILED',
          message: String(error.message).slice(0, 240),
          elapsedMs: now() - startedAt,
        })
      }
    })().finally(() => {
      clearTimeout(timer)
      controller = null
      pending = null
    })
    return pending
  }
  return {
    check,
    dispose: () => {
      disposed = true
      controller?.abort()
      return pending || Promise.resolve()
    },
  }
}
