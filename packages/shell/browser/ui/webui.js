ko.bindingHandlers.rendered = {
  init: function (element, valueAccessor) {
    //console.log("rendered: ", valueAccessor())
    valueAccessor()()
  },
}

ko.bindingHandlers['style'] = {
  update: function (element, valueAccessor) {
    var value = ko.utils.unwrapObservable(valueAccessor() || {})
    ko.utils.objectForEach(value, function (styleName, styleValue) {
      styleValue = ko.utils.unwrapObservable(styleValue)

      if (styleValue === null || styleValue === undefined || styleValue === false) {
        // Empty string removes the value, whereas null/undefined have no effect
        styleValue = ''
      }

      if (styleName.substring(0, 2) === '--') {
        element.style.setProperty(styleName, styleValue)
      } else {
        element.style[styleName] = styleValue
      }
    })
  },
}

class WebUITab {
  inputUrl = ko.observable()
}

class WebUI {
  windowId = ko.observable(-1)

  config = ko.observable()

  tabs = ko.observableArray([])
  activeTab = ko.pureComputed(() =>
    this.activeTabId() > 0 ? this.tabs().find((t) => t.id === this.activeTabId()) : null,
  )

  downloads = ko.observableArray([])
  downloadPct = ko.observable(0)
  bytesReceived = ko.observable(0)
  bytesTotal = ko.observable()

  activeTabId = ko.observable(-1)
  heldTabId = -1
  closingTabId = -1
  hoveringTabId = -1
  topbarHeight = 0

  windowState = ko.observable()

  platform = navigator.userAgentData.platform.toLowerCase()
  settingsUrl = 'chrome-extension://' + chrome.runtime.id + '/settings.html'

  constructor() {
    ipc.on('webui-message', async (ev, msg) => {
      console.log('Received message from main.', msg.type, msg.data)
      if (msg?.type) await this.receiveFromMain(msg)
      else alert('webui.js received invalid webui-message from main:\n' + JSON.stringify(msg))
    })
    ipc.on('update', (e, message) => {
      chrome.runtime.sendMessage({
        type: 'kccp-log-update',
        meta: { windowId: this.windowId(), allTabs: true },
        data: message,
      })
    })
    ipc.on('recent', (e, message) => {
      chrome.runtime.sendMessage({
        type: 'kccp-log-recent',
        meta: { windowId: this.windowId(), allTabs: true },
        data: message,
      })
    })
    // received a message from a tab
    // webui.js is no longer handling message passing
    //chrome.runtime.onMessage.addListener(this.handleMessage.bind(this))
  }

  async init(windowId) {
    if (this.windowId() >= 0) return
    this.windowId(windowId)
    console.log('init: window ID: ', windowId)

    //console.log('>> init()', windowId)
    await this.getConfig()
    // wait for initial tab to load
    await sleep(100)
    await this.initTabs()

    console.log('init: tabs initialized: ', JSON.stringify(this.tabs().map((t) => t.id)))

    var downloads = await chrome.downloads.search({})
    if (downloads.some((d) => d.state == 'in_progress')) {
      downloads = downloads.filter((d) => ['in_progress', 'complete'].includes(d.state))
      this.downloads(downloads)
    }
    this.updateDownloadStats()

    return this.sendToMain('webui-init-complete')
  }

  async getConfig() {
    const config = await this.sendToMain('get-config')
    this.config(config)
  }

  async initTabs() {
    //console.log('>> initTabs()')
    await this.renderTabs()
    for (const tab of this.tabs()) await this.updateTabShouldHideAddressBar(tab)
    this.setupBrowserListeners()
  }

  async renderTabs() {
    //console.log('>> rendering tabs')
    const tabs = [...(await this.getCurrentTabs())]
    for (const tab of tabs)
      this.prepareTab(
        tab,
        this.tabs().find((t) => t.id == tab.id),
      )
    this.updateTabSeparators(tabs)
    this.tabs(tabs)

    if (!tabs.length) {
      this.activeTabId(-1)
      return
    }

    // set a new active tab if previous one is invalid
    const activeTab = tabs.find((tab) => tab.active())
    const newId = activeTab?.id || tabs[0].id
    if ((this.activeTabId() == -1 || this.activeTabId() !== newId) && tabs.length > 0) {
      //console.log('reinitializing active tab', newId)
      this.activeTabId(newId)
    }
  }

  prepareTab(tab, oldTab) {
    if (!tab.separator) tab.separator = ko.observable(oldTab?.separator() ?? 'none')
    if (!tab.showAddressBar) tab.showAddressBar = ko.observable(oldTab?.showAddressBar() ?? false)
    if (!tab.urlInput)
      tab.urlInput = ko.observable(oldTab?.url != tab.url ? tab.url : oldTab.urlInput())
    if (typeof tab.active !== 'function') tab.active = ko.observable(tab.active)
  }

  async updateTabSeparators(tabs) {
    if (!tabs) return
    let foundActive = false
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]
      foundActive = foundActive || tab.active()
      if (
        !tab.active() &&
        tab.id != this.hoveringTabId &&
        (i === tabs.length - 1 || (!tabs[i + 1].active() && tabs[i + 1].id != this.hoveringTabId))
      )
        tab.separator('right')
      else tab.separator('none')
    }
  }

  async updateTabShouldHideAddressBar(tab) {
    const shouldHideAddressBar = await this.sendToMain('get-should-hide-addressbar', {
      url: tab.url,
    })
    tab.showAddressBar(!shouldHideAddressBar)
    await this.sendTopbarSize()
  }

  async setTopbarObserver() {
    const resizeObserver = new ResizeObserver(async (entries) => {
      for (const entry of entries) {
        const height = entry.devicePixelContentBoxSize[0].blockSize
        const factor = window.devicePixelRatio
        if (height != this.topbarHeight) {
          this.topbarHeight = height
          await this.sendTopbarSize()
          await this.sendToMain('webui-zoom-changed', { height, factor })
        }
      }
    })
    resizeObserver.observe(document.getElementById('topbar-container'))
  }

  updateDownloadStats() {
    this.bytesReceived(this.downloads().reduce((sum, dl) => sum + dl.bytesReceived, 0))
    this.bytesTotal(
      this.downloads().length > 0
        ? this.downloads().reduce((sum, dl) => sum + dl.totalBytes, 0)
        : undefined,
    )
    this.downloadPct((this.bytesReceived() / this.bytesTotal()) * 100)
  }

  async setupBrowserListeners() {
    chrome.tabs.onCreated.addListener(async (tab) => {
      if (tab.windowId !== this.windowId()) return
      this.renderTabs()
      for (const t of this.tabs()) await this.updateTabShouldHideAddressBar(t)
    })
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, details) => {
      const tab = this.tabs().find((t) => t.id == tabId)
      if (!tab) return

      //console.log('>> updating tab', details.id)
      this.prepareTab(details, tab)

      const idx = this.tabs().findIndex((t) => t.id == tabId)
      if (idx > -1) this.tabs.splice(idx, 1, details)
      else console.error(`couldn't find tab with id ${tabId}`)

      if (this.activeTabId() > 0 && details.active() && this.activeTabId() != details.id) {
        //console.log('>> also updating old selected tab', this.activeTabId())
        const currentActive = this.tabs().find((t) => t.id === this.activeTabId())
        currentActive.active(false)
        //console.log('setting new active tab', details.id)
        this.activeTabId(details.id)
      }
      this.updateTabSeparators(this.tabs())
      if (details.url != tab.url) await this.updateTabShouldHideAddressBar(details)
    })
    chrome.tabs.onRemoved.addListener(async (tabId) => {
      if (!this.tabs().some((t) => t.id == tabId)) return
      await this.renderTabs()
    })
    chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
      if (!this.tabs().some((t) => t.id == tabId)) return
      await this.renderTabs()
      await this.sendTopbarSize()
    })

    chrome.downloads.onCreated.addListener((dl) => {
      if (!this.downloads().some((d) => d.state == 'in_progress')) {
        this.downloads([])
      }
      if (dl.totalBytes) {
        const existing = this.downloads().find((d) => d.id == dl.id)
        if (existing) this.downloads.replace(existing, dl)
        else this.downloads.push(dl)
      }
      this.updateDownloadStats()
    })
    chrome.downloads.onChanged.addListener(async (downloadId, delta) => {
      const results = await chrome.downloads.search({ id: downloadId })
      if (!results.length) {
        console.error(
          'received update for download but downloads api returned no results for its ID.',
          delta,
        )
        return
      }
      const dl = results[0]
      const existing = this.downloads().find((d) => d.id == downloadId)
      if (['in_progress', 'complete'].includes(dl.state)) {
        if (existing) this.downloads.replace(existing, dl)
        else this.downloads.push(dl)
      } else if (existing) this.downloads.remove(existing)
      this.updateDownloadStats()
    })
    chrome.downloads.onErased.addListener((downloadId) => {
      const existing = this.downloads().find((d) => d.id == downloadId)
      if (existing) this.downloads.remove(existing)
      this.updateDownloadStats()
    })
  }

  async sendTopbarSize() {
    const height = document.getElementById('topbar-container').clientHeight
    //console.trace('>> sending new topbar height', height)
    await this.sendToMain('webui-display-mode-changed', { height })
  }

  async receiveFromMain(msg) {
    if (msg.type.startsWith('webui-log')) return
    switch (msg.type) {
      case 'status-kc3-is-updating':
      case 'error-do-update':
      case 'update-process-started':
      case 'update-process-progress':
      case 'update-process-completed':
      case 'kccp-status':
      case 'kccp-config-saved':
        // (worker ->) main -> webui -> settings
        chrome.runtime.sendMessage(msg)
        break
      case 'config-saved':
        this.config(msg.data)
        chrome.runtime.sendMessage(msg)
        break
      case 'webui-init':
        this.init(msg.data.windowId)
        break
      case 'webui-display-mode':
        await this.sendTopbarSize()
        break
      case 'webui-toggle-addressbar':
        //console.log(msg)
        if (!this.activeTab() || this.activeTab().url == this.settingsUrl) return
        this.activeTab().showAddressBar(!this.activeTab().showAddressBar())
        break
      case 'webui-focus-addressbar':
        const activeTab = this.tabs().find((t) => t.active())
        if (!activeTab || activeTab.url === this.settingsUrl) return

        // TODO: MVVM-ify this somehow?
        document.getElementById('addressurl').select()
        break
      default:
        alert('webui.js received unknown webui-message type from main:\n' + JSON.stringify(msg))
        break
    }
  }

  async sendToMain(type, data) {
    return await ipc.send('webui-message', { windowId: this.windowId(), type }, data)
  }

  getTabContext(data, ev) {
    let tab = data
    if (data.favicon === undefined) {
      // triggered on bar
      tab = ko.contextFor(ev.target).$data
    }
    return tab
  }

  dragTargetActual = null
  dragTarget = null
  dragButton = null
  clickingCloseButton = false
  tabMoveOldIndex = -1
  tabMoveNewIndex = -1
  dragXDiff = 0
  startDragElPos = 0
  startDragMousePos = 0
  tabListEls = null

  isCloseButton(el) {
    return el.classList.contains('tab-close')
  }

  buildTabEls(ev) {
    this.tabListEls = Array.from(ev.currentTarget.parentElement.children).map((c) => ({
      el: c,
      tab: ko.contextFor(c).$data,
    }))
  }

  tabPointerDown(data, ev) {
    // middle click to close
    if (ev.button == 1 && data.url !== this.settingsUrl) {
      chrome.tabs.remove(data.id)
      return
    }
    if (ev.button != 0) return
    // if we're interacting with the close button, don't initiate a drag
    if (this.isCloseButton(ev.target)) return

    if (data.url === this.settingsUrl) {
      chrome.tabs.update(data.id, { active: true })
      return
    }

    // prepare for dragging
    this.dragTargetActual = ev.target
    this.dragTarget = ev.currentTarget
    this.dragButton = ev.button

    this.tabs().forEach((t) => t.active(false))
    data.active(true)

    // capture the pointer to ensure we catch all mouse events until we let go
    ev.currentTarget.setPointerCapture(ev.originalEvent.pointerId)

    console.log('Holding tab', data.id, ev.currentTarget)
    this.tabMoveOldIndex = -1
    this.tabMoveNewIndex = -1
    this.heldTabId = data.id
    this.startDragElPos = this.dragTarget.offsetLeft
    this.startDragMousePos = ev.pageX
    this.dragXDiff = ev.pageX - this.startDragElPos
    this.buildTabEls(ev)
  }
  tabPointerMove(data, ev) {
    if (!this.dragTarget) return

    const elPos = ev.pageX - this.dragXDiff
    this.tabMoveOldIndex = this.tabListEls.findIndex((t) => t.el == ev.currentTarget)
    const newIndex = this.tabListEls.findIndex(
      (t, i) =>
        t.el != ev.currentTarget &&
        Math.abs(elPos - t.el.offsetLeft) < this.dragTarget.offsetWidth / 3,
    )
    if (newIndex > 0) {
      this.tabMoveNewIndex = newIndex
      this.startDragElPos = this.tabListEls[this.tabMoveNewIndex].el.offsetLeft
      this.startDragMousePos = ev.pageX

      const swapTab = this.tabs.splice(this.tabMoveNewIndex, 1)[0]
      this.tabs.splice(this.tabMoveOldIndex, 0, swapTab)

      this.buildTabEls(ev)
    }
    const offsetX = ev.pageX - this.dragXDiff - this.startDragElPos

    this.dragTarget.style.left = `${offsetX}px`
    this.dragTarget.style.zIndex = '99'
  }
  tabPointerUp(data, ev) {
    if (this.dragTarget) {
      if (this.isCloseButton(this.dragTargetActual) && ev.target == this.dragTargetActual) {
        // ignore it and the close button click event will handle it
      } else {
        this.dragTarget.releasePointerCapture(ev.originalEvent.pointerId)
        if (this.tabMoveNewIndex > 0) chrome.tabs.move(data.id, { index: this.tabMoveNewIndex })
        // select the tab if it's not open
        chrome.tabs.update(data.id, { active: true })
        this.dragTarget.style.left = '0'
        delete this.dragTarget.style.zIndex
        console.log('dragged tab to new position', this.tabMoveNewIndex)
      }
      this.dragTarget = null
      this.dragTargetActual = null
    }
  }

  /*
  tabDragStart(data, ev) {
    this.dragId = data.id
    this.dragEl = ev.currentTarget
    this.startDragXPos = ev.pageX

    this.tabListEls = Array.from(ev.currentTarget.parentElement.children).map(c => ({el: c, tab: ko.contextFor(c).$data}))
    

    chrome.tabs.update(this.dragId, { active: true })

    var img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='
    ev.originalEvent.dataTransfer.setDragImage(img, 0, 0)
    console.log('dragstart', data.id, this.startDragXPos)



    return true
  }
  async tabDragEnter(data, ev) {
    console.log('dragenter')
    if (this.dragId == data.id) return

    ev.originalEvent.dataTransfer.effectAllowed = 'copyMove'
    ev.originalEvent.dataTransfer.dropEffect = 'move'

    // target index
    const index = this.tabs().indexOf(data)

    // remove original
    const original = this.tabs().find(t => t.id == this.dragId)
    const originalIdx = this.tabs().indexOf(original)
    this.tabs.splice(originalIdx, 1)

    // place it in the new position
    //const newIndex = this.tabs().indexOf(data)
    this.tabs.splice(index, 0, original)

    await chrome.tabs.move(this.dragId, { index })

    console.log('dragenter', data.id, ev)
  }
  tabDragOver(data, ev) {
    console.log('dragover')
    const xOffset = ev.pageX - this.startDragXPos
    this.dragEl.style.left = `${xOffset}px`
    ev.preventDefault()
  }
  async tabDrop(data, ev) {
    this.dragId = -1
    
    delete this.dragEl.style.pointerEvents
    delete this.dragEl.style.left

    console.log('drop', data.id, ev)
  }

  tabPointerDown(data, ev) {
    const tab = this.getTabContext(data, ev)
    if (ev.button === 1 && tab.url != this.settingsUrl) this.closingTabId = tab.id
    else this.closingTabId = -1

    if (ev.button === 0) {
      console.log("Holding tab", tab.id)
      this.heldTabId = tab.id
      this.dragTarget = ev.currentTarget
      this.dragTarget.setPointerCapture(ev.originalEvent.pointerId)
    }
  }
  async tabPointerMove(data, ev) {
    const tab = this.getTabContext(data, ev)
    // update hover state
    if (this.hoveringTabId != tab.id) {
      this.hoveringTabId = tab.id
      this.updateTabSeparators(this.tabs())
    }
    if (this.heldTabId == -1) return
    

    // set up for click/drag
    const heldTab = this.tabs().find((t) => t.id === this.heldTabId)
    if (heldTab.url == this.settingsUrl || tab.url == this.settingsUrl || tab.id == this.heldTabId)
      return

    // tab dragging
    const heldIndex = this.tabs().indexOf(heldTab)
    const thisIndex = this.tabs().indexOf(tab)

    if (!heldTab.active())
      await chrome.tabs.update(heldTab.id, { active: true })
    
    if (heldIndex == thisIndex) return

    console.log("Moving tab", tab.id)
    await chrome.tabs.move(this.heldTabId, { index: thisIndex })
    await this.renderTabs()
  }
  tabPointerOut(data, ev) {
    const tab = this.getTabContext(data, ev)
    this.hoveringTabId = -1
    this.updateTabSeparators(this.tabs())
  }
  tabPointerUp(data, ev) {
    const tab = this.getTabContext(data, ev)
    if (ev.button === 1 && this.closingTabId == tab.id)
      chrome.tabs.remove(tab.id)
    else if (ev.button === 0) {
      if (this.heldTabId == tab.id) {
        // select tab
        chrome.tabs.update(tab.id, { active: true })
        // clear the downloads progress bar from the settings tab if downloads are finished
        if (
          !this.downloads().some((d) => d.state == 'in_progress') &&
          [tab.url, this.activeTab().url].includes(this.settingsUrl)
        )
        this.downloads([])
      }
      console.log("Releasing tab", tab.id)
      this.heldTabId = -1
      if (this.dragTarget)
        this.dragTarget.releasePointerCapture(ev.originalEvent.pointerId)
    }
    return true
  }
    */

  browserActionNewTab() {
    chrome.tabs.create()
  }
  browserActionGoBack() {
    chrome.tabs.goBack()
  }
  browserActionGoForward() {
    chrome.tabs.goForward()
  }
  browserActionReload() {
    chrome.tabs.reload()
  }
  browserActionCloseTab(tab, ev) {
    chrome.tabs.remove(tab.id)
    return true
  }
  browserActionAddressKeyDown(data, event) {
    event = event.originalEvent
    if (!['Enter', 'NumpadEnter'].includes(event.code)) return true
    let url = this.activeTab().urlInput()
    if (url.toLowerCase() == this.settingsUrl.toLowerCase()) return
    if (event.ctrlKey) {
      const shouldComplete = /^\w[\w\d-]+$/.test(url)
      //console.log('trying to complete url', url, shouldComplete)
      if (shouldComplete) {
        //console.log('completing url.')
        url = `https://${url}.com/`
      }
    }
    chrome.tabs.update({ url })
    return false
  }
  browserActionAddressBlur(event) {
    // TODO: MVVM-ify this somehow?
    document.getElementById('addressurl').deselect()
  }

  async windowActionMinimize() {
    const win = await this.getCurrentWindow()
    const state = win.state === 'minimized' ? 'normal' : 'minimized'
    chrome.windows.update(win.id, { state })
    this.windowState(state)
  }
  async windowActionMaximize() {
    const win = await this.getCurrentWindow()
    // when restoring from minimized state, the state value isn't updated immediately
    const state = ['maximized', 'minimized'].includes(win.state) ? 'normal' : 'maximized'
    chrome.windows.update(win.id, { state })
    this.windowState(state)
  }
  windowActionClose() {
    chrome.windows.remove(this.windowId())
  }

  async getCurrentWindow() {
    return this.getWindow(this.windowId())
  }
  async getWindow(windowId) {
    return new Promise((resolve) => chrome.windows.get(windowId, resolve))
  }
  async getCurrentTabs() {
    return this.getTabs(this.windowId())
  }
  async getTabs(windowId) {
    return new Promise((resolve) => chrome.tabs.query({ windowId }, resolve))
  }
}
window.vm = new WebUI()
$(document).ready(() => ko.applyBindings(window.vm))
