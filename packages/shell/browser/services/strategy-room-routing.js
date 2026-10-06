export const KC3_STRATEGY_ROOM_PATH = '/pages/strategy/strategy.html'

const parseUrl = (value) => {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export const isKc3StrategyRoomUrl = (value, extensionId) => {
  const url = parseUrl(value)
  return Boolean(
    extensionId &&
      url &&
      url.protocol === 'chrome-extension:' &&
      url.hostname === extensionId &&
      url.pathname === KC3_STRATEGY_ROOM_PATH,
  )
}

const strategyRoomTabsFor = (windows, extensionId) =>
  windows.flatMap((window) =>
    (window.tabs?.tabList || [])
      .filter((tab) => isKc3StrategyRoomUrl(tab.webContents?.getURL(), extensionId))
      .map((tab) => ({ tab, window })),
  )

const orderedWindowsFor = (windows, preferredWindow) =>
  [preferredWindow, ...windows].filter(
    (window, index, candidates) => window && candidates.indexOf(window) === index,
  )

const errorMessage = (error) => (error instanceof Error ? error.message : String(error))

export const openManagedKc3StrategyRoom = ({
  url,
  extensionId,
  windows = [],
  preferredWindow = null,
  source = 'unknown',
  disposition = 'unknown',
  focusWindow = true,
  logger = () => {},
}) => {
  if (!isKc3StrategyRoomUrl(url, extensionId)) {
    return { handled: false, outcome: 'ignored', reasonCode: 'NOT_KC3_STRATEGY_ROOM' }
  }

  const orderedWindows = orderedWindowsFor(windows, preferredWindow)
  const existingTabs = strategyRoomTabsFor(orderedWindows, extensionId)
  const existing = existingTabs[0]
  const targetWindow = existing?.window || orderedWindows[0]
  if (!targetWindow?.tabs) {
    const result = {
      handled: true,
      outcome: 'failed',
      reasonCode: 'NO_MANAGED_WINDOW',
      source,
      disposition,
      strategyTabCount: existingTabs.length,
    }
    logger('strategy-room.open-routing-failed', result)
    return result
  }

  try {
    const tab = existing?.tab || targetWindow.tabs.create({ initialUrl: url })
    const outcome = existing ? 'reused' : 'created'
    const reasonCode = existing ? 'EXISTING_TAB_REUSED' : 'MANAGED_TAB_CREATED'

    if (existing) {
      const requestedUrl = parseUrl(url)
      const currentUrl = parseUrl(tab.webContents?.getURL())
      const requestedLocation = `${requestedUrl?.search || ''}${requestedUrl?.hash || ''}`
      const currentLocation = `${currentUrl?.search || ''}${currentUrl?.hash || ''}`
      if (requestedLocation && requestedLocation !== currentLocation) {
        Promise.resolve(tab.loadURL(url)).catch((error) => {
          logger('strategy-room.open-routing-failed', {
            handled: true,
            outcome: 'failed',
            reasonCode: 'EXISTING_TAB_NAVIGATION_FAILED',
            source,
            disposition,
            strategyTabCount: existingTabs.length,
            tabId: tab.id,
            windowId: targetWindow.id,
            error: errorMessage(error),
          })
        })
      }
    }

    targetWindow.tabs.select(tab.id)
    if (focusWindow) targetWindow.window?.focus()

    const result = {
      handled: true,
      outcome,
      reasonCode,
      source,
      disposition,
      strategyTabCount: existingTabs.length,
      tabId: tab.id,
      windowId: targetWindow.id,
      tab,
      window: targetWindow,
    }
    logger('strategy-room.open-routed', {
      handled: result.handled,
      outcome: result.outcome,
      reasonCode: result.reasonCode,
      source: result.source,
      disposition: result.disposition,
      strategyTabCount: result.strategyTabCount,
      tabId: result.tabId,
      windowId: result.windowId,
    })
    return result
  } catch (error) {
    const result = {
      handled: true,
      outcome: 'failed',
      reasonCode: 'ROUTE_OPERATION_FAILED',
      source,
      disposition,
      strategyTabCount: existingTabs.length,
      windowId: targetWindow.id,
      error: errorMessage(error),
    }
    logger('strategy-room.open-routing-failed', result)
    return result
  }
}
