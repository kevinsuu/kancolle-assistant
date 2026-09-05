import { validateWebUiCommand } from './webui-contract'
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

export const registerWebUiIpc = ({ ipcMain, getWebUiExtensionId, route, logger = () => {} }) => {
  ipcMain.handle(WEBUI_CHANNEL, async (event, meta, data) => {
    if (!isAllowedWebUiSender(event, getWebUiExtensionId())) {
      logger('webui.command-rejected', { outcome: 'rejected', reasonCode: 'UNSUPPORTED_SENDER' })
      throw new Error('webui-message rejected from unsupported sender')
    }
    if (!validateWebUiCommand(meta, data)) {
      logger('webui.command-rejected', { outcome: 'rejected', reasonCode: 'INVALID_COMMAND' })
      throw new Error('webui-message rejected invalid command')
    }
    const startedAt = Date.now()
    try {
      const result = await route(event, meta, data)
      logger('webui.command-completed', {
        operation: meta.type,
        outcome: 'success',
        elapsedMs: Date.now() - startedAt,
      })
      return result
    } catch (error) {
      logger('webui.command-failed', {
        operation: meta.type,
        outcome: 'failed',
        reasonCode: 'COMMAND_FAILED',
        message: String(error.message).slice(0, 240),
        elapsedMs: Date.now() - startedAt,
      })
      throw error
    }
  })
}
