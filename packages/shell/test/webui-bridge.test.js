import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { installExtensionWindowResolver } from '../browser/services/extension-window-routing'
import {
  isKc3StrategyRoomUrl,
  openManagedKc3StrategyRoom,
} from '../browser/services/strategy-room-routing'
import { createWebUiBridge } from '../browser/ui/webui-bridge'

const strategyRoomUrl = 'chrome-extension://kc3/pages/strategy/strategy.html'

const createManagedWindow = (id, urls = []) => {
  const selected = []
  const created = []
  let focused = 0
  const tabList = urls.map((url, index) => ({
    id: id * 100 + index,
    loadURL: () => Promise.resolve(),
    webContents: { getURL: () => url },
  }))
  const window = {
    id,
    tabs: {
      tabList,
      create: ({ initialUrl }) => {
        const tab = {
          id: id * 100 + tabList.length,
          webContents: { getURL: () => initialUrl },
        }
        tabList.push(tab)
        created.push(initialUrl)
        return tab
      },
      select: (tabId) => selected.push(tabId),
    },
    window: { focus: () => (focused += 1) },
  }
  return { window, selected, created, focused: () => focused }
}

test('extension window routing resolves tracked BrowserView tabs before the upstream fallback', () => {
  const fallbackWindow = { id: 2 }
  const browserWindow = { id: 1, isDestroyed: () => false }
  const browserViewContents = { id: 10 }
  const extensionStore = {
    getWindowFromWebContents: () => fallbackWindow,
    tabToWindow: new WeakMap([[browserViewContents, browserWindow]]),
    windows: new Set([browserWindow]),
  }
  const diagnostics = []

  const dispose = installExtensionWindowResolver({
    extensionStore,
    logger: (event, data) => diagnostics.push({ event, data }),
  })

  assert.equal(extensionStore.getWindowFromWebContents(browserViewContents), browserWindow)
  assert.equal(extensionStore.getWindowFromWebContents(browserViewContents), browserWindow)
  assert.equal(extensionStore.getWindowFromWebContents({ id: 11 }), fallbackWindow)
  assert.deepEqual(diagnostics, [
    {
      event: 'extension.browser-view-window-resolved',
      data: { webContentsId: 10, windowId: 1 },
    },
  ])

  dispose()
  assert.equal(extensionStore.getWindowFromWebContents(browserViewContents), fallbackWindow)
})

test('Strategy Room routing reuses the managed tab for KC3 popup and startup entry points', () => {
  const first = createManagedWindow(1)
  const second = createManagedWindow(2, [`${strategyRoomUrl}#ships`])
  const diagnostics = []

  assert.equal(isKc3StrategyRoomUrl(strategyRoomUrl, 'kc3'), true)
  assert.equal(isKc3StrategyRoomUrl(strategyRoomUrl, 'another-extension'), false)
  const result = openManagedKc3StrategyRoom({
    url: strategyRoomUrl,
    extensionId: 'kc3',
    windows: [first.window, second.window],
    preferredWindow: first.window,
    source: 'kc3-window-open',
    disposition: 'other',
    logger: (event, data) => diagnostics.push({ event, data }),
  })

  assert.equal(result.outcome, 'reused')
  assert.equal(result.window, second.window)
  assert.deepEqual(first.created, [])
  assert.deepEqual(second.created, [])
  assert.deepEqual(second.selected, [200])
  assert.equal(second.focused(), 1)
  assert.deepEqual(diagnostics, [
    {
      event: 'strategy-room.open-routed',
      data: {
        handled: true,
        outcome: 'reused',
        reasonCode: 'EXISTING_TAB_REUSED',
        source: 'kc3-window-open',
        disposition: 'other',
        strategyTabCount: 1,
        tabId: 200,
        windowId: 2,
      },
    },
  ])
})

test('Strategy Room routing creates a managed tab and reports missing-window failures', () => {
  const managed = createManagedWindow(7)
  const diagnostics = []
  const created = openManagedKc3StrategyRoom({
    url: strategyRoomUrl,
    extensionId: 'kc3',
    windows: [managed.window],
    preferredWindow: managed.window,
    source: 'startup',
    disposition: 'startup',
    focusWindow: false,
    logger: (event, data) => diagnostics.push({ event, data }),
  })
  const failed = openManagedKc3StrategyRoom({
    url: strategyRoomUrl,
    extensionId: 'kc3',
    windows: [],
    source: 'kc3-window-open',
    disposition: 'other',
    logger: (event, data) => diagnostics.push({ event, data }),
  })

  assert.equal(created.outcome, 'created')
  assert.deepEqual(managed.created, [strategyRoomUrl])
  assert.deepEqual(managed.selected, [700])
  assert.equal(managed.focused(), 0)
  assert.deepEqual(
    {
      handled: failed.handled,
      outcome: failed.outcome,
      reasonCode: failed.reasonCode,
      source: failed.source,
      disposition: failed.disposition,
      strategyTabCount: failed.strategyTabCount,
    },
    {
      handled: true,
      outcome: 'failed',
      reasonCode: 'NO_MANAGED_WINDOW',
      source: 'kc3-window-open',
      disposition: 'other',
      strategyTabCount: 0,
    },
  )
  assert.deepEqual(
    diagnostics.map(({ event, data }) => ({
      event,
      outcome: data.outcome,
      reasonCode: data.reasonCode,
    })),
    [
      {
        event: 'strategy-room.open-routed',
        outcome: 'created',
        reasonCode: 'MANAGED_TAB_CREATED',
      },
      {
        event: 'strategy-room.open-routing-failed',
        outcome: 'failed',
        reasonCode: 'NO_MANAGED_WINDOW',
      },
    ],
  )
})

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
