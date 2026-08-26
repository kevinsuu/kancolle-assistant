import './kccacheproxy-boundary.test.js'
import './recommendation-characterization.test.js'
import './recommendation-worker-service.test.js'
import './strategy-room-view.test.js'
import './webui-ipc.test.js'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import Tab from '../browser/tab.js'
import Tabs from '../browser/tabs.js'

test('tab creates find-in-page view lazily and destroys each webContents once', async () => {
  let nextId = 1
  let deferSearchLoad = false
  let resolveSearchLoad
  class FakeWebContents extends EventEmitter {
    id = nextId++
    destroyCount = 0
    destroyed = false
    loadedUrls = []

    loadURL(url) {
      this.loadedUrls.push(url)
      if (deferSearchLoad && url === '/search.html') {
        return new Promise((resolve) => {
          resolveSearchLoad = resolve
        })
      }
      return Promise.resolve()
    }
    executeJavaScript() {
      return Promise.resolve('')
    }
    isDevToolsOpened() {
      return false
    }
    isDestroyed() {
      return this.destroyed
    }
    destroy() {
      this.destroyCount += 1
      this.destroyed = true
    }
    focus() {}
    send() {}
    stopFindInPage() {}
  }
  class FakeBrowserView {
    webContents = new FakeWebContents()
    setAutoResize() {}
    setBackgroundColor() {}
    setBounds() {}
  }
  const views = []
  const window = {
    addBrowserView: (view) => views.push(view),
    getContentBounds: () => ({ width: 1200, height: 800 }),
    id: 1,
    removeBrowserView: (view) => views.splice(views.indexOf(view), 1),
  }
  const tab = new Tab(window, {}, '/search.html', { BrowserView: FakeBrowserView })
  const mainWebContents = tab.webContents

  assert.equal(views.length, 1)
  await tab.setFindInPageVisible(true)
  assert.equal(views.length, 2)
  assert.deepEqual(tab.searchView.webContents.loadedUrls, ['/search.html'])

  const searchWebContents = tab.searchView.webContents
  tab.destroy()
  assert.equal(mainWebContents.destroyCount, 1)
  assert.equal(searchWebContents.destroyCount, 1)
  assert.equal(views.length, 0)

  deferSearchLoad = true
  const pendingTab = new Tab(window, {}, '/search.html', { BrowserView: FakeBrowserView })
  const pendingOpen = pendingTab.setFindInPageVisible(true)
  await pendingTab.setFindInPageVisible(false)
  resolveSearchLoad()
  await pendingOpen
  assert.equal(pendingTab.searchVisible, false)
  pendingTab.destroy()
  assert.equal(views.length, 0)
})

test('extension tab removal drops destroyed tabs from the collection', () => {
  const tabs = new Tabs({}, { newTabPageUrl: 'about:blank', searchPageUrl: '/search.html' })
  const remainingTab = {
    id: 1,
    destroy: () => {},
    webContents: { getURL: () => 'https://example.com' },
  }
  let destroyCount = 0
  const extensionTab = {
    id: 2,
    destroy: () => {
      destroyCount += 1
    },
    webContents: { getURL: () => 'chrome-extension://kc3/pages/strategy.html' },
  }
  tabs.tabList = [remainingTab, extensionTab]
  tabs.selected = remainingTab

  tabs.removeExtensionTabs('kc3')

  assert.deepEqual(tabs.tabList, [remainingTab])
  assert.equal(destroyCount, 1)
})
