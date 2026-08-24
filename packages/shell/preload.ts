import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { injectIpc } from './preload-ipc.js'
import { ipcRenderer } from 'electron'
import { injectFleetRecommender } from './browser/recommendation/strategy-room-ui.js'

console.log('Trying to inject into', location.pathname)
// Inject <browser-action-list> element into WebUI
const localPages = [
  '/new-tab.html',
  '/settings.html',
  '/_generated_background_page.html',
  '/webui.html',
  '/search.html',
]
if (location.protocol === 'chrome-extension:' && localPages.includes(location.pathname)) {
  console.log('Successfully injected into', location.pathname)
  injectBrowserAction()
  injectIpc()
}

if (
  location.protocol === 'chrome-extension:' &&
  location.pathname === '/pages/strategy/strategy.html'
) {
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      injectFleetRecommender((channel, data) => ipcRenderer.invoke(channel, data))
    }, 0)
  })
}
