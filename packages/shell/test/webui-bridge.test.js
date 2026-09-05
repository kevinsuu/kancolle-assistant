import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { createWebUiBridge } from '../browser/ui/webui-bridge'
test('WebUI bridge restricts commands, strips Electron events and owns subscriptions', async () => {
  const ipc = new EventEmitter(),
    calls = []
  ipc.invoke = (...args) => {
    calls.push(args)
    return Promise.resolve('ok')
  }
  const { api, dispose } = createWebUiBridge(ipc, 'linux')
  assert.equal(api.send, undefined)
  await assert.rejects(api.sendWebUiCommand({ type: 'unknown' }), /Invalid/)
  await assert.rejects(
    api.sendWebUiCommand({ type: 'set-config-item' }, { key: '__proto__.a', value: true }),
    /Invalid/,
  )
  assert.equal(calls.length, 0)
  assert.equal(await api.sendWebUiCommand({ type: 'get-config' }), 'ok')
  const received = [],
    unsubscribe = api.onWebUiMessage((...args) => received.push(args))
  ipc.emit('webui-message', { secret: 'electron' }, { type: 'ready' })
  assert.deepEqual(received, [[{ type: 'ready' }]])
  unsubscribe()
  unsubscribe()
  api.onLogUpdate(() => {})
  dispose()
  dispose()
  assert.equal(ipc.listenerCount('webui-message'), 0)
  assert.equal(ipc.listenerCount('update'), 0)
})
