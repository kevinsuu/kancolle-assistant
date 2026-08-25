import { injectBrowserAction } from 'electron-chrome-extensions/browser-action'
import { injectIpc } from './preload-ipc.js'
import { ipcRenderer } from 'electron'
import { injectExpeditionGoalPlanner } from './browser/recommendation/expedition-goal-ui.js'
import { injectFleetRecommender } from './browser/recommendation/strategy-room-ui.js'
import { injectStrategyRoomRecentTabs } from './browser/recommendation/strategy-room-recent-ui.js'
import { injectResourceLedgerSummary } from './browser/recommendation/resource-ledger-ui.js'
import { injectResourceCenter } from './browser/recommendation/resource-center-ui.js'
import { initializeDmmCredentialAutofill } from './browser/security/dmm-credential-autofill.js'

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
      const invoke = (channel, data) => ipcRenderer.invoke(channel, data)
      injectFleetRecommender(invoke)
      injectExpeditionGoalPlanner(invoke)
      injectResourceCenter(invoke)
      injectResourceLedgerSummary(invoke)
      injectStrategyRoomRecentTabs()
    }, 0)
  })
}

if (location.protocol === 'https:' && location.hostname === 'accounts.dmm.com') {
  window.addEventListener('DOMContentLoaded', () => {
    void initializeDmmCredentialAutofill((channel, data) => ipcRenderer.invoke(channel, data))
  })
}
