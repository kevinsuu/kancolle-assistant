import assert from 'node:assert/strict'
import test from 'node:test'
import { applyProxySettings, readProxyDestination } from '../browser/services/proxy-settings'
test('proxy settings preserve PAC/system branches, connection order and failure diagnostics', async () => {
  const calls = [],
    logs = [],
    config = { enable: true, mode: 'kccp-internal' }
  const configStore = { get: () => config },
    kccpService = {
      getConfig: async () => ({ config: { hostname: '127.0.0.1', port: 8081, httpsPort: 8082 } }),
    }
  const session = {
    setProxy: async (value) => calls.push(value),
    forceReloadProxyConfig: async () => calls.push('reload'),
    closeAllConnections: async () => calls.push('close'),
  }
  const run = () =>
    applyProxySettings({
      configStore,
      kccpService,
      session,
      logger: (event, data) => logs.push({ event, data }),
    })
  await run()
  assert.equal(calls[0].mode, 'pac_script')
  assert.deepEqual(calls.slice(1), ['reload', 'close'])
  assert.deepEqual(await readProxyDestination(configStore, kccpService), {
    host: '127.0.0.1',
    port: 8081,
  })
  config.enable = false
  calls.length = 0
  await run()
  assert.deepEqual(calls[0], { mode: 'system' })
  session.setProxy = async () => {
    throw new Error('fixture')
  }
  await assert.rejects(run(), /fixture/)
  assert.ok(
    logs.some(
      (log) => log.event === 'proxy.settings-completed' && log.data.selectedBranch === 'game-pac',
    ),
  )
  assert.ok(
    logs.some(
      (log) =>
        log.event === 'proxy.settings-failed' && log.data.reasonCode === 'PROXY_SETTINGS_FAILED',
    ),
  )
})
