import assert from 'node:assert/strict'
import test from 'node:test'
import { createModUpdateChecker } from '../browser/services/mod-update-checker'
test('mod checks share one request, throttle repeated reads and report failures', async () => {
  let config = { mods: [{ path: 'fixture' }] },
    reads = 0,
    now = 10_000
  const logs = []
  const checker = createModUpdateChecker({
    getConfig: () => config,
    setConfig: async (value) => {
      config = value
    },
    readMod: async () => {
      reads++
      return { updateUrl: 'fixture' }
    },
    fetchUpdate: async () => ({ version: '2' }),
    logger: (event, data) => logs.push({ event, data }),
    now: () => now,
    intervalMs: 100,
  })
  await Promise.all([checker.check(), checker.check()])
  await checker.check()
  assert.equal(reads, 1)
  assert.equal(config.mods[0].latestVersion, '2')
  assert.ok(logs.some((log) => log.data.outcome === 'success' && log.data.changedCount === 1))
  await checker.dispose()
  const failed = createModUpdateChecker({
    getConfig: () => config,
    setConfig: async () => {},
    readMod: async () => {
      throw new Error('fixture')
    },
    fetchUpdate: async () => {},
    logger: (event, data) => logs.push({ event, data }),
  })
  await failed.check()
  await failed.dispose()
  assert.ok(logs.some((log) => log.data.outcome === 'degraded' && log.data.failedCount === 1))
})
test('disposing a mod check aborts its fetch and prevents settings writes', async () => {
  let writes = 0,
    began
  const started = new Promise((resolve) => {
    began = resolve
  })
  const checker = createModUpdateChecker({
    getConfig: () => ({ mods: [{ path: 'fixture' }] }),
    setConfig: async () => {
      writes++
    },
    readMod: async () => ({ updateUrl: 'fixture' }),
    fetchUpdate: (_url, signal) =>
      new Promise((_, reject) => {
        began()
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }),
    logger: () => {},
  })
  const pending = checker.check()
  await started
  await checker.dispose()
  await pending
  assert.equal(writes, 0)
})
