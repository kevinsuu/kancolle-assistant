export const createProxyLifecycle = ({
  createProxy,
  logger,
  timeoutMs = 10_000,
  retryMs = 5_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) => {
  let proxy = null,
    timer = null,
    disposed = false,
    queue = Promise.resolve(),
    disposePromise
  let check = null,
    checking = false,
    retry = false
  const startCancellations = new Set()
  const bounded = async (operation, run) => {
    let deadline, cancel
    try {
      const operations = [
        Promise.resolve().then(run),
        new Promise((_, reject) => {
          deadline = setTimer(
            () =>
              reject(
                Object.assign(new Error(`Proxy ${operation} timed out`), { code: 'PROXY_TIMEOUT' }),
              ),
            timeoutMs,
          )
        }),
      ]
      if (operation === 'start') {
        operations.push(
          new Promise((_, reject) => {
            cancel = () =>
              reject(Object.assign(new Error('Proxy disposed'), { code: 'PROXY_DISPOSED' }))
            startCancellations.add(cancel)
            if (disposed) cancel()
          }),
        )
      }
      return await Promise.race(operations)
    } finally {
      clearTimer(deadline)
      startCancellations.delete(cancel)
    }
  }
  const close = async (target) => {
    if (!target) return
    await bounded('close', async () => {
      await target.close()
      const deadline = Date.now() + timeoutMs
      while (target.listening() && Date.now() < deadline) await delay(25)
      if (target.listening())
        throw Object.assign(new Error('Proxy close timed out'), { code: 'PROXY_TIMEOUT' })
    })
  }
  const stop = async () => {
    const target = proxy
    proxy = null
    await close(target)
  }
  const startStop = (enabled) => {
    queue = queue.then(async () => {
      if (disposed) return
      const startedAt = Date.now()
      try {
        await stop()
        if (!enabled || disposed) {
          logger('proxy.lifecycle-completed', {
            operation: 'stop',
            outcome: 'success',
            elapsedMs: Date.now() - startedAt,
          })
          return
        }
        const target = createProxy()
        proxy = target
        await bounded('start', async () => {
          await target.init()
          if (disposed || proxy !== target) {
            await close(target)
            return
          }
          await target.start()
          if (disposed || proxy !== target) {
            await close(target)
            return
          }
          while (!target.listening()) {
            if (target.lastStartError) throw target.lastStartError
            if (disposed || proxy !== target) return
            await delay(25)
          }
        })
        retry = false
        logger('proxy.lifecycle-completed', {
          operation: 'start',
          outcome: disposed ? 'cancelled' : 'success',
          elapsedMs: Date.now() - startedAt,
        })
      } catch (error) {
        retry = enabled && !disposed
        logger('proxy.lifecycle-failed', {
          operation: enabled ? 'start' : 'stop',
          outcome: 'failed',
          reasonCode: error.code || 'PROXY_FAILED',
          message: String(error.message || error).slice(0, 240),
          elapsedMs: Date.now() - startedAt,
        })
        try {
          await stop()
        } catch (closeError) {
          logger('proxy.cleanup-failed', {
            outcome: 'failed',
            reasonCode: closeError.code || 'PROXY_CLOSE_FAILED',
            message: String(closeError.message).slice(0, 240),
          })
        }
      }
    })
    return queue
  }
  const schedule = () => {
    if (disposed || timer !== null || checking || !check) return
    timer = setTimer(async () => {
      timer = null
      checking = true
      try {
        await check()
      } catch (error) {
        logger('proxy.check-failed', {
          outcome: 'failed',
          message: String(error.message || error).slice(0, 240),
        })
      } finally {
        checking = false
        schedule()
      }
    }, retryMs)
  }
  const watch = (callback) => {
    if (!disposed) {
      check = callback
      schedule()
    }
  }
  const dispose = () => {
    if (disposePromise) return disposePromise
    disposed = true
    for (const cancel of startCancellations) cancel()
    startCancellations.clear()
    if (timer !== null) clearTimer(timer)
    timer = null
    check = null
    // Close immediately, even if initialization is waiting. Its continuation checks ownership.
    disposePromise = stop().catch((error) =>
      logger('proxy.cleanup-failed', {
        outcome: 'failed',
        reasonCode: error.code || 'PROXY_CLOSE_FAILED',
        message: String(error.message || error).slice(0, 240),
      }),
    )
    return disposePromise
  }
  return {
    startStop,
    watch,
    dispose,
    stop: () => startStop(false),
    getProxy: () => proxy,
    needsRetry: () => retry,
    isDisposed: () => disposed,
  }
}
