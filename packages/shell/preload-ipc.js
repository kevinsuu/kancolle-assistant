import { ipcRenderer, contextBridge } from 'electron'
import { createWebUiBridge } from './browser/ui/webui-bridge'
export const injectIpc = () => {
  const bridge = createWebUiBridge(ipcRenderer, process.platform)
  contextBridge.exposeInMainWorld('ipc', bridge.api)
  window.addEventListener('pagehide', bridge.dispose, { once: true })
}
