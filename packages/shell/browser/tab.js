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
    this.searchView.webContents.openDevTools({ mode: 'detach', activate: true })

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
    this.view = undefined
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
    const yOffset = topBarHeight

    if (this.visible) {
      const finalWidth = width - padding * 2
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
        const searchWidth = Math.min(finalWidth, 300)
        const searchHeight = 36
        const searchX = Math.round((finalWidth - searchWidth) / 2)
        this.searchView.setBounds({
          x: searchX,
          y: yOffset,
          width: searchWidth,
          height: searchHeight,
        })
      } else {
        this.searchView.setBounds({ x: 0, y: 0, width: 0, height: 0 })
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

  toggleFindInPage() {
    this.searchVisible = !this.searchVisible
    this.updateLayout()
    this.focusSearch()
  }
  openFindInPage() {
    this.searchVisible = true
    this.updateLayout()
    this.focusSearch()
  }

  focusSearch() {
    if (this.searchVisible) {
      this.searchView.webContents.focus()
      this.sendMessage(this.searchView.webContents, 'prepare-search')
    }
  }

  findInPage(searchInput) {
    this.searchInput = searchInput
    this.webContents.findInPage(searchInput)
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
