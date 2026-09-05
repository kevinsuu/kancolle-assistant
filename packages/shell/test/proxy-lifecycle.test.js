import assert from 'node:assert/strict'
import test from 'node:test'
import { createProxyLifecycle } from '../browser/services/proxy-lifecycle'
const createFixture = () => {
  const timers = new Map(),
    logs = [],
    proxies = []
  let next = 0
  const lifecycle = createProxyLifecycle({
    createProxy: () => {
      const proxy = {
        active: false,
        init: async () => {},
        start: async () => {
          proxy.active = true
        },
        close: () => {
          proxy.active = false
        },
        listening: () => proxy.active,
      }
      proxies.push(proxy)
      return proxy
    },
    logger: (event, data) => logs.push({ event, data }),
    setTimer: (fn) => {
      timers.set(++next, fn)
      return next
    },
    clearTimer: (id) => timers.delete(id),
  })
  return { lifecycle, timers, proxies, logs }
}
test('proxy watcher is unique and dispose cannot rearm an in-flight check', async () => {
  const { lifecycle, timers, logs } = createFixture()
  let finish
  const pending = new Promise((resolve) => {
    finish = resolve
  })
  lifecycle.watch(() => pending)
  lifecycle.watch(() => pending)
  assert.equal(timers.size, 1)
  const callback = [...timers.values()][0]
  timers.clear()
  const check = callback()
  await lifecycle.dispose()
  finish()
  await check
  assert.equal(timers.size, 0)
  await lifecycle.startStop(true)
  assert.equal(lifecycle.getProxy(), null)
})
test('proxy instances are independent and queued toggles settle at the final state', async () => {
  const a = createFixture(),
    b = createFixture()
  await Promise.all([a.lifecycle.startStop(true), b.lifecycle.startStop(true)])
  assert.notEqual(a.lifecycle.getProxy(), b.lifecycle.getProxy())
  await Promise.all([
    a.lifecycle.startStop(false),
    a.lifecycle.startStop(true),
    a.lifecycle.startStop(false),
  ])
  assert.equal(a.lifecycle.getProxy(), null)
  assert.equal(b.lifecycle.getProxy().listening(), true)
  assert.ok(
    a.logs.some(
      (log) => log.event === 'proxy.lifecycle-completed' && log.data.operation === 'start',
    ),
  )
  await Promise.all([a.lifecycle.dispose(), b.lifecycle.dispose()])
})
test('failed proxy startup is diagnosed and can recover', async () => {
  const logs = []
  let attempts = 0
  const lifecycle = createProxyLifecycle({
    logger: (event, data) => logs.push({ event, data }),
    createProxy: () => {
      const p = {
        active: false,
        listening: () => p.active,
        close: () => {
          p.active = false
        },
        init: async () => {
          if (++attempts === 1) throw new Error('fixture start')
        },
        start: async () => {
          p.active = true
        },
      }
      return p
    },
  })
  await lifecycle.startStop(true)
  assert.equal(lifecycle.needsRetry(), true)
  await lifecycle.startStop(true)
  assert.equal(lifecycle.getProxy().listening(), true)
  assert.ok(
    logs.some(
      (log) => log.event === 'proxy.lifecycle-failed' && log.data.reasonCode === 'PROXY_FAILED',
    ),
  )
  await lifecycle.dispose()
})

test('dispose during initialization cancels the start and bounds a stuck close', async () => {
  const logs = []
  let finishInit,
    starts = 0
  const initialized = new Promise((resolve) => {
    finishInit = resolve
  })
  const lifecycle = createProxyLifecycle({
    timeoutMs: 10,
    logger: (event, data) => logs.push({ event, data }),
    createProxy: () => ({
      init: () => initialized,
      start: async () => {
        starts++
      },
      close: async () => {},
      listening: () => false,
    }),
  })
  const starting = lifecycle.startStop(true)
  await new Promise((resolve) => setImmediate(resolve))
  await lifecycle.dispose()
  finishInit()
  await starting
  assert.equal(starts, 0)
  const stuck = createProxyLifecycle({
    timeoutMs: 10,
    logger: (event, data) => logs.push({ event, data }),
    createProxy: () => ({
      init: async () => {},
      start: async () => {},
      listening: () => true,
      close: () => new Promise(() => {}),
    }),
  })
  await stuck.startStop(true)
  await stuck.dispose()
  assert.ok(
    logs.some(
      (log) => log.event === 'proxy.cleanup-failed' && log.data.reasonCode === 'PROXY_TIMEOUT',
    ),
  )
})
