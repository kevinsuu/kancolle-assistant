import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { registerAppShutdown } from '../browser/services/app-shutdown'
test('cancelled window closure leaves services running and accepted shutdown waits once', async () => {
  const app = new EventEmitter()
  let disposed = 0,
    quit = 0,
    finish
  app.quit = () => {
    quit++
  }
  const pending = new Promise((resolve) => {
    finish = resolve
  })
  const unsubscribe = registerAppShutdown({
    app,
    dispose: () => {
      disposed++
      return pending
    },
    logger: () => {},
  })
  app.emit('before-quit', { preventDefault: () => {} })
  assert.equal(disposed, 0)
  let prevented = 0
  app.emit('will-quit', {
    preventDefault: () => {
      prevented++
    },
  })
  app.emit('will-quit', {
    preventDefault: () => {
      prevented++
    },
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(disposed, 1)
  assert.equal(quit, 0)
  assert.equal(prevented, 2)
  finish()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(quit, 1)
  app.emit('will-quit', { preventDefault: () => assert.fail('completed shutdown must proceed') })
  unsubscribe()
})
test('shutdown cleanup failure is diagnosed before exit continues', async () => {
  const app = new EventEmitter(),
    logs = []
  let quit = 0
  app.quit = () => {
    quit++
  }
  registerAppShutdown({
    app,
    dispose: async () => {
      throw new Error('fixture')
    },
    logger: (event, data) => logs.push({ event, data }),
  })
  app.emit('will-quit', { preventDefault: () => {} })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(quit, 1)
  assert.equal(logs[0].data.reasonCode, 'RUNTIME_DISPOSE_FAILED')
})
