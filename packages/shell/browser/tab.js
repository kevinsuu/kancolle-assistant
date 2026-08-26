const { BrowserView } = require('electron')

let topBarHeight = 64

class Tab {
  constructor(parentWindow, webContentsViewOptions = {}, searchPageUrl) {
    // needed because browserwindow events don't bind this correctly
    this.updateLayout = this.updateLayout.bind(this)

    this.view = new BrowserView()
    this.id = this.view.webContents.id
    this.window = parentWindow
    this.webContents = this.view.webContents
    this.window.addBrowserView(this.view)
    this.visible = false

    this.searchInput = ''
    this.searchVisible = false
    this.searchView = new BrowserView()
    this.window.addBrowserView(this.searchView)
    this.searchView.webContents.loadURL(searchPageUrl)
    //this.searchView.webContents.openDevTools({ mode: 'detach', activate: true })

    this.webContents.on('found-in-page', (event, result) => {
      console.log('found on page', event, result)
      this.sendMessage(this.searchView.webContents, 'found-in-page', result)
    })
  }

  destroy() {
    if (this.destroyed) return

    this.destroyed = true

    this.hide()

    this.window.removeBrowserView(this.searchView)
    this.window.removeBrowserView(this.view)
    this.window = undefined

    if (!this.webContents.isDestroyed()) {
      if (this.webContents.isDevToolsOpened()) {
        this.webContents.closeDevTools()
      }

      // TODO: why is this no longer called?
      this.webContents.emit('destroyed')

      this.webContents.destroy()
    }

    this.webContents = undefined
    this.view.webContents.destroy()
    this.view = undefined
    this.searchView.webContents.destroy()
    this.searchView = undefined
  }

  loadURL(url, options) {
    //console.log('>> tab.loadURL()', url)
    return this.view.webContents.loadURL(url, options)
  }

  show() {
    //console.log('>> tab.show()', this.id)
    this.visible = true
    this.updateLayout()
  }

  hide() {
    //console.log('>> tab.hide()', this.id)
    //this.stopResizeListener()
    this.visible = false
    this.updateLayout()
  }

  reload() {
    //console.log('>> tab.reload()')
    this.view.webContents.reload()
  }

  updateLayout(headerHeight = 0) {
    const { width, height } = this.window.getContentBounds()
    const padding = 0
    if (headerHeight > 0) topBarHeight = headerHeight

    if (this.visible) {
      const searchBaseWidth = 300
      const searchSnapWidth = 500
      const searchHeight = 36

      const finalWidth = width - padding * 2

      const yOffsetSearchMod =
        this.searchVisible && finalWidth <= searchSnapWidth ? searchHeight : 0
      const yOffset = topBarHeight + yOffsetSearchMod
      const searchOffset = topBarHeight

      const finalHeight = height - yOffset - padding

      this.view.setBackgroundColor('white')
      this.view.setBounds({
        x: padding,
        y: yOffset,
        width: finalWidth,
        height: finalHeight,
      })
      this.view.setAutoResize({ width: true, height: true })

      if (this.searchVisible) {
        const searchWidth = finalWidth <= searchSnapWidth ? finalWidth : searchBaseWidth
        const searchX = Math.round((finalWidth - searchWidth) / 2)
        this.searchView.setBounds({
          x: searchX,
          y: searchOffset,
          width: searchWidth,
          height: searchHeight,
        })
      } else {
        this.searchView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
        this.webContents.stopFindInPage('clearSelection')
      }
    } else {
      this.view.setAutoResize({ width: false, height: false })
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 })
      this.searchView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
    }
    //this.searchView.setBorderRadius(8)
  }

  // Replacement for BrowserView.setAutoResize. This could probably be better...
  startResizeListener() {
    this.stopResizeListener()
    //this.window.on('resize', this.updateLayout)
  }
  stopResizeListener() {
    //this.window.off('resize', this.updateLayout)
  }

  async setFindInPageVisible(visible) {
    let changed = false
    if (!this.searchVisible && visible) {
      const selection = await this.view.webContents.executeJavaScript(
        'window.getSelection().toString()',
      )
      if (selection?.length > 0 && selection != this.searchInput) {
        this.searchInput = selection
        changed = true
      }
    }
    this.searchVisible = visible
    this.updateLayout()
    this.focusSearch()
    if (!changed)
      // prevent double trigger
      this.findInPage(this.searchInput)
  }

  focusSearch() {
    if (this.searchVisible) {
      this.searchView.webContents.focus()
      this.sendMessage(this.searchView.webContents, 'prepare-search', {
        searchInput: this.searchInput,
      })
    }
  }

  findInPage(searchInput) {
    this.searchInput = searchInput
    if (this.searchVisible && searchInput?.length > 0) this.webContents.findInPage(searchInput)
    else this.webContents.stopFindInPage('clearSelection')
  }

  sendMessage(webContents, type, data) {
    webContents.send('webui-message', {
      type,
      meta: { windowId: this.window.id, tabId: this.id },
      data,
    })
  }
}

export default Tab
