import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { injectIpc } from './preload-ipc.js'
import { contextBridge } from 'electron'

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
