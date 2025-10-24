class Search {
  theme = ko.observable('andra')
  brightness = ko.observable('system')
  appInfo = ko.observable({})
  config = ko.observable()
  searchInput = ko.observable('')
  searchResult = ko.observable()

  addBrowserListeners() {
    chrome.runtime.onMessage.addListener(this.onMessage.bind(this))
  }

  onMessage(msg, sender, sendResponse) {
    ;(async () => {
      const myWindowId = (await chrome.windows.getCurrent()).id
      const tabId = (await chrome.tabs.getCurrent()).id
      if (!msg.meta.allWindows && msg.meta.windowId !== myWindowId) {
        console.log('Ignoring message for other window', msg.meta.windowId)
        return
      }
      if (!msg.meta.allWindows && !msg.meta.allTabs && msg.meta.tabId !== tabId) {
        console.log('Ignoring message for other tab', msg.meta.tabId)
        return
      }

      try {
        await this.receiveFromMain(msg)
      } catch (error) {
        console.log('error receiving message', error)
      }
    })()
  }

  async receiveFromMain(msg) {
    switch (msg.type) {
      case 'config-saved':
        await this.config(msg.data)
        break
      case 'found-in-page':
        await this.handleFound(msg.data)
        break
      case 'prepare-search':
        if (msg.data?.searchInput?.length > 0) this.searchInput(msg.data.searchInput)
        document.getElementById('search-input').focus()
        break
    }
  }

  setConfig(config) {
    this.config(config)
  }

  rootKeyDown(data, ev) {
    //if (ev.originalEvent.code == 'Escape') this.closeSearch()
    return true
  }
  async closeSearch() {
    const tabId = (await chrome.tabs.getCurrent()).id
    await sendToMain('close-find-in-page', { tabId })
  }

  onKeyDown(data, ev) {
    if (['Enter', 'F3'].includes(ev.originalEvent.code)) this.startSearch()
    return true
  }
  async startSearch() {
    const tabId = (await chrome.tabs.getCurrent()).id
    await sendToMain('start-find-in-page', { searchInput: this.searchInput(), tabId })
  }

  async handleFound(result) {
    console.log('found in page', result)
    this.searchResult(result)
  }

  constructor() {
    this.init()
    ipc.on('webui-message', async (ev, msg) => {
      console.log('Received message from main.', msg.type, msg.data)
      if (msg?.type) await this.receiveFromMain(msg)
      else alert('webui.js received invalid webui-message from main:\n' + JSON.stringify(msg))
    })
  }
  async init() {
    setMessageSource('search')
    const appInfo = await tryInvoke(
      async () => await sendToMain('get-damecon-info', {}),
      'get-damecon-info',
    )
    this.appInfo(appInfo)

    const config = await configStore.all()
    this.config(config)
    this.addBrowserListeners()

    this.searchInput.subscribe(async (ev) => {
      await this.startSearch()
    })
  }
}
window.vm = new Search()
$(document).ready(() => ko.applyBindings(window.vm))
