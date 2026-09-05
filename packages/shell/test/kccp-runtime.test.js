import assert from 'node:assert/strict'
import test from 'node:test'
import { createKccpRuntime } from '../browser/kccp-runtime'
test('proxy runtime applies a configuration toggle deferred during startup', async () => {
  let finishInit,
    enabled = true
  const pending = new Promise((resolve) => {
      finishInit = resolve
    }),
    proxies = [],
    logs = []
  class Proxy {
    active = false
    constructor() {
      proxies.push(this)
    }
    init() {
      return pending
    }
    async start() {
      this.active = true
    }
    close() {
      this.active = false
    }
    listening() {
      return this.active
    }
  }
  const runtime = createKccpRuntime({
    app: {},
    BrowserWindow: { getAllWindows: () => [] },
    ipcMain: {},
    dialog: {},
    kccp: {
      Proxy,
      logger: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    },
  })
  const config = { get: (key) => (key === 'proxy.enable' ? enabled : 'kccp-internal') }
  const starting = runtime.startStop(config)
  await new Promise((resolve) => setImmediate(resolve))
  enabled = false
  await runtime.startStop(config)
  finishInit()
  await starting
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(proxies[0].listening(), false)
  assert.ok(logs.some((row) => row[1] === 'proxy.transition-deferred'))
  await runtime.dispose()
})
