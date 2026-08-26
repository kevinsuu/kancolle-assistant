export const WEBUI_CHANNEL = 'webui-message'

export const WEBUI_ALLOWED_PATHS = new Set([
  '/new-tab.html',
  '/settings.html',
  '/_generated_background_page.html',
  '/webui.html',
  '/search.html',
])

export const isAllowedWebUiSender = (event, extensionId) => {
  if (!extensionId) return false
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  try {
    const url = new URL(senderUrl)
    return (
      url.protocol === 'chrome-extension:' &&
      url.hostname === extensionId &&
      WEBUI_ALLOWED_PATHS.has(url.pathname)
    )
  } catch {
    return false
  }
}

export const registerWebUiIpc = ({ ipcMain, getWebUiExtensionId, route }) => {
  ipcMain.handle(WEBUI_CHANNEL, async (event, meta, data) => {
    if (!isAllowedWebUiSender(event, getWebUiExtensionId())) {
      throw new Error('webui-message rejected from unsupported sender')
    }
    return route(event, meta, data)
  })
}
