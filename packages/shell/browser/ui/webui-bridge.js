import { WEBUI_COMMAND_CHANNEL, WEBUI_EVENT_CHANNELS, validateWebUiCommand } from './webui-contract'
export const createWebUiBridge = (ipcRenderer, platform) => {
  const subscriptions = new Set()
  const api = {
    platform,
    sendWebUiCommand: (meta, data = meta?.data) => {
      if (!validateWebUiCommand(meta, data))
        return Promise.reject(new Error('Invalid WebUI command'))
      return ipcRenderer.invoke(WEBUI_COMMAND_CHANNEL, meta, data)
    },
  }
  for (const [method, channel] of Object.entries(WEBUI_EVENT_CHANNELS)) {
    api[method] = (callback) => {
      if (typeof callback !== 'function') throw new TypeError('Event callback must be a function')
      const listener = (_event, data) => callback(data)
      const unsubscribe = () => {
        ipcRenderer.removeListener(channel, listener)
        subscriptions.delete(unsubscribe)
      }
      subscriptions.add(unsubscribe)
      ipcRenderer.on(channel, listener)
      return unsubscribe
    }
  }
  return {
    api: Object.freeze(api),
    dispose: () => {
      for (const unsubscribe of subscriptions) unsubscribe()
    },
  }
}
