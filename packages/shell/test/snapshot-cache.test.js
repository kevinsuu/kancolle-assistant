import assert from 'node:assert/strict'
import test from 'node:test'
import { createSnapshotCache } from '../browser/recommendation/snapshot-cache'
import { registerRecommendationIpc } from '../browser/recommendation/recommendation-ipc'
import { ACCOUNT_CHANNEL } from '../browser/recommendation/channels'
const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

test('all Strategy Room windows read the replacement snapshot after one window refreshes', async () => {
  const handlers = new Map(),
    logs = []
  let revision = 0
  const dispose = registerRecommendationIpc({
    ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
    getKc3ExtensionId: () => 'fixture',
    logger: (event, data) => logs.push({ event, data }),
    readAccountSnapshot: async () => ({
      ships: [],
      equipment: [],
      generatedAt: String(++revision),
      metadata: { capabilities: {} },
    }),
  })
  const event = () => ({
    sender: { getURL: () => 'chrome-extension://fixture/pages/strategy/strategy.html' },
  })
  const a = event(),
    b = event(),
    read = handlers.get(ACCOUNT_CHANNEL)
  assert.equal((await read(a)).account.generatedAt, '1')
  assert.equal((await read(b)).account.generatedAt, '1')
  await read(a, { forceRefresh: true })
  assert.equal((await read(b)).account.generatedAt, '2')
  assert.ok(
    logs.some(
      (log) =>
        log.event === 'recommendation.snapshot-notified' && log.data.affectedWindowCount === 2,
    ),
  )
  dispose()
})

test('reverse refresh completion and stale calculations cannot publish old data', async () => {
  const logs = [],
    cache = createSnapshotCache({ logger: (event, data) => logs.push({ event, data }) })
  const old = {},
    current = {},
    late = deferred()
  await cache.read(() => old)
  const calculation = cache.calculate(old, 'route', () => late.promise)
  const first = deferred(),
    second = deferred()
  const firstRead = cache.read(() => first.promise, true),
    secondRead = cache.read(() => second.promise, true)
  second.resolve(current)
  await secondRead
  first.resolve({})
  assert.equal((await firstRead).error.code, 'SNAPSHOT_SUPERSEDED')
  late.resolve({ status: 'success' })
  assert.equal((await calculation).error.code, 'SNAPSHOT_SUPERSEDED')
  assert.equal(
    await cache.read(() => {
      throw new Error('must reuse')
    }),
    current,
  )
  assert.ok(!cache.has('route'))
  assert.ok(
    logs.some(
      (log) => log.event === 'recommendation.snapshot-completed' && log.data.outcome === 'success',
    ),
  )
})

test('snapshot failures are explicit and equal calculations are deduplicated', async () => {
  const logs = [],
    cache = createSnapshotCache({ logger: (event, data) => logs.push({ event, data }) })
  await assert.rejects(
    cache.read(() => {
      throw new Error('fixture')
    }),
    /fixture/,
  )
  assert.ok(logs.some((log) => log.data.reasonCode === 'SNAPSHOT_READ_FAILED'))
  const value = await cache.read(() => ({})),
    pending = deferred()
  let count = 0
  const run = () => {
    count++
    return pending.promise
  }
  const a = cache.calculate(value, 'route', run),
    b = cache.calculate(value, 'route', run)
  pending.resolve({ status: 'success' })
  assert.deepEqual(await a, await b)
  assert.equal(count, 1)
  cache.dispose()
  assert.equal((await cache.read(() => ({}))).error.code, 'SNAPSHOT_SUPERSEDED')
})

test('extension unload and sender destruction release cache observers', async () => {
  const { EventEmitter } = await import('node:events')
  const session = new EventEmitter(),
    sender = new EventEmitter(),
    handlers = new Map()
  sender.session = session
  sender.getURL = () => 'chrome-extension://fixture/pages/strategy/strategy.html'
  let revision = 0
  const dispose = registerRecommendationIpc({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    getKc3ExtensionId: () => 'fixture',
    logger: () => {},
    readAccountSnapshot: async () => ({
      ships: [],
      equipment: [],
      metadata: { capabilities: {} },
      generatedAt: String(++revision),
    }),
  })
  const read = () => handlers.get(ACCOUNT_CHANNEL)({ sender })
  await read()
  assert.equal(sender.listenerCount('destroyed'), 1)
  session.emit('extension-unloaded', {}, { id: 'fixture' })
  assert.equal(sender.listenerCount('destroyed'), 0)
  assert.equal((await read()).account.generatedAt, '2')
  sender.emit('destroyed')
  assert.equal(sender.listenerCount('did-start-navigation'), 0)
  dispose()
  assert.equal(session.listenerCount('extension-unloaded'), 0)
})
