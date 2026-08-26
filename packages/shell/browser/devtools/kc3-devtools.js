import fsSync from 'fs'
import path from 'path'

const DEVTOOLS_PREFERENCES_KEY = 'electron'
const KC3_PANEL_TITLE = 'KanColle'
const KC3_INITIAL_SIDEBAR_RATIO = 0.32
const KC3_PANEL_MEASURE_ATTEMPTS = 100
const KC3_PANEL_MEASURE_INTERVAL_MS = 100

const MEASURE_KC3_PANEL_SCRIPT = `(() => {
  const root = document.documentElement
  const body = document.body
  const wrapper = document.querySelector('.wrapper')
  const wrapperRect = wrapper?.getBoundingClientRect()
  const viewportWidth = root.clientWidth || window.innerWidth || 0
  const contentWidth = wrapper
    ? Math.ceil(Math.max(
        wrapper.scrollWidth,
        wrapperRect?.width || 0,
        (wrapperRect?.right || 0) - Math.min(wrapperRect?.left || 0, 0),
      ))
    : Math.ceil(Math.max(root.scrollWidth, body?.scrollWidth || 0))

  return {
    contentWidth,
    viewportWidth,
    hasWrapper: Boolean(wrapper),
    url: location.href,
  }
})()`

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const isLiveFrame = (frame) =>
  frame &&
  typeof frame.executeJavaScript === 'function' &&
  !(typeof frame.isDestroyed === 'function' && frame.isDestroyed())

const measureKc3Panel = async (devToolsWebContents, extensionId) => {
  const panelUrlPrefix = `chrome-extension://${extensionId}/pages/devtools/`
  let fallbackMeasurement = null

  for (let attempt = 0; attempt < KC3_PANEL_MEASURE_ATTEMPTS; attempt += 1) {
    if (devToolsWebContents.isDestroyed()) return null

    const frames = (devToolsWebContents.mainFrame.framesInSubtree || []).filter(
      (frame) =>
        isLiveFrame(frame) && typeof frame.url === 'string' && frame.url.startsWith(panelUrlPrefix),
    )
    const measurements = await Promise.all(
      frames.map(async (frame) => {
        try {
          return await frame.executeJavaScript(MEASURE_KC3_PANEL_SCRIPT, true)
        } catch {
          return null
        }
      }),
    )
    const validMeasurements = measurements.filter(
      (measurement) => measurement?.contentWidth > 0 && measurement?.viewportWidth > 0,
    )
    const wrapperMeasurement = validMeasurements
      .filter((measurement) => measurement.hasWrapper)
      .sort((left, right) => right.contentWidth - left.contentWidth)[0]
    if (wrapperMeasurement) return wrapperMeasurement
    fallbackMeasurement = validMeasurements.sort(
      (left, right) => right.contentWidth - left.contentWidth,
    )[0]

    await delay(KC3_PANEL_MEASURE_INTERVAL_MS)
  }

  return fallbackMeasurement
}

export const estimateKc3SidebarWidth = (availableWidth) => {
  const width = Number(availableWidth)
  return Number.isFinite(width) && width > 0
    ? Math.max(1, Math.round(width * KC3_INITIAL_SIDEBAR_RATIO))
    : 1
}

export const DEVTOOLS_LOCALE_INFOBAR_DEFAULTS_VERSION = 1

const getOrCreateObject = (parent, key) => {
  const value = parent[key]
  if (value && typeof value === 'object' && !Array.isArray(value)) return value

  parent[key] = {}
  return parent[key]
}

export const initializeDevToolsPreferences = ({ hideLocaleInfobar, preferencesPath }) => {
  if (!hideLocaleInfobar) return { changed: false }

  const preferencesExist = fsSync.existsSync(preferencesPath)
  const parsedPreferences = preferencesExist
    ? JSON.parse(fsSync.readFileSync(preferencesPath, 'utf8'))
    : {}
  const preferences =
    parsedPreferences && typeof parsedPreferences === 'object' && !Array.isArray(parsedPreferences)
      ? parsedPreferences
      : {}
  const electronPreferences = getOrCreateObject(preferences, DEVTOOLS_PREFERENCES_KEY)
  const devtoolsPreferences = getOrCreateObject(electronPreferences, 'devtools')
  const storedPreferences = getOrCreateObject(devtoolsPreferences, 'preferences')

  if (storedPreferences.disableLocaleInfoBar === 'true') return { changed: false }

  storedPreferences.disableLocaleInfoBar = 'true'

  fsSync.mkdirSync(path.dirname(preferencesPath), { recursive: true })
  const temporaryPath = `${preferencesPath}.damecon.tmp`
  const preferencesMode = preferencesExist ? fsSync.statSync(preferencesPath).mode & 0o777 : 0o600
  fsSync.writeFileSync(temporaryPath, JSON.stringify(preferences), { mode: preferencesMode })
  fsSync.chmodSync(temporaryPath, preferencesMode)
  fsSync.renameSync(temporaryPath, preferencesPath)

  return { changed: true }
}

export const showKc3DevToolsPanel = async ({ devToolsWebContents, extensionId }) => {
  if (!devToolsWebContents || devToolsWebContents.isDestroyed() || !extensionId) {
    return { found: false, reason: 'unavailable' }
  }

  const panelId = `chrome-extension://${extensionId}${KC3_PANEL_TITLE}`
  const selectedPanel = await devToolsWebContents.executeJavaScript(
    `(async () => {
      const panelId = ${JSON.stringify(panelId)}
      const initialSidebarRatio = ${KC3_INITIAL_SIDEBAR_RATIO}
      const Common = await import('./core/common/common.js')
      const UI = await import('./ui/legacy/legacy.js')
      const tabOrderSetting = Common.Settings.Settings.instance().createSetting(
        'panel-tabOrder',
        {},
      )
      const tabOrder = tabOrderSetting.get()
      const existingOrders = Object.values(tabOrder).filter((value) => Number.isFinite(value))
      tabOrder[panelId] = existingOrders.length > 0 ? Math.min(...existingOrders) - 10 : 0
      tabOrderSetting.set(tabOrder)

      const inspectorView = UI.InspectorView.InspectorView.instance()
      const tabbedPane = inspectorView.tabbedPane
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (tabbedPane.hasTab(panelId)) {
          const panelTab = tabbedPane.tabsById.get(panelId)
          if (!panelTab) return { found: false, reason: 'missing-tab-instance' }
          if (tabbedPane.tabIndex(panelId) !== 0) tabbedPane.insertBefore(panelTab, 0)
          await inspectorView.showPanel(panelId)

          const ownerSplit = inspectorView.ownerSplit()
          if (!ownerSplit || !ownerSplit.isVertical()) {
            return {
              found: true,
              selectedTabId: tabbedPane.selectedTabId,
              layout: { applied: false, reason: 'right-docked-layout-unavailable' },
            }
          }
          if (!ownerSplit.element) {
            await new Promise((resolve) => setTimeout(resolve, 100))
            continue
          }

          const totalWidth = ownerSplit.element.clientWidth
          const totalHeight = ownerSplit.element.clientHeight
          if (totalWidth <= 1) {
            return {
              found: true,
              selectedTabId: tabbedPane.selectedTabId,
              layout: { applied: false, reason: 'insufficient-width', totalWidth, totalHeight },
            }
          }

          ownerSplit.setSidebarSize(Math.round(totalWidth * initialSidebarRatio))
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

          const appliedSidebarWidth = ownerSplit.sidebarSize()
          return {
            found: true,
            selectedTabId: tabbedPane.selectedTabId,
            layout: {
              applied: true,
              totalWidth,
              totalHeight,
              gameWidth: totalWidth - appliedSidebarWidth,
              sidebarWidth: appliedSidebarWidth,
              sidebarRatio: appliedSidebarWidth / totalWidth,
              measurementSource: 'initial-ratio',
            },
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      return { found: false, reason: 'timeout' }
    })()`,
    true,
  )

  if (!selectedPanel.found || !selectedPanel.layout?.applied) {
    return { panelId, ...selectedPanel }
  }

  let measurement = await measureKc3Panel(devToolsWebContents, extensionId)
  if (!measurement) return { panelId, ...selectedPanel }

  let fittedPanel = selectedPanel
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const contentOverflow = measurement.contentWidth - measurement.viewportWidth
    fittedPanel = await devToolsWebContents.executeJavaScript(
      `(async () => {
        const UI = await import('./ui/legacy/legacy.js')
        const inspectorView = UI.InspectorView.InspectorView.instance()
        const ownerSplit = inspectorView.ownerSplit()
        if (!ownerSplit || !ownerSplit.isVertical()) {
          return {
            found: true,
            selectedTabId: inspectorView.tabbedPane.selectedTabId,
            layout: { applied: false, reason: 'right-docked-layout-unavailable' },
          }
        }
        if (!ownerSplit.element) {
          return {
            found: true,
            selectedTabId: inspectorView.tabbedPane.selectedTabId,
            layout: { applied: false, reason: 'split-element-unavailable' },
          }
        }

        const totalWidth = ownerSplit.element.clientWidth
        const totalHeight = ownerSplit.element.clientHeight
        const previousSidebarWidth = ownerSplit.sidebarSize()
        const requestedSidebarWidth = previousSidebarWidth + ${JSON.stringify(contentOverflow)}
        ownerSplit.setSidebarSize(Math.min(totalWidth - 1, Math.max(1, requestedSidebarWidth)))
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

        const appliedSidebarWidth = ownerSplit.sidebarSize()
        return {
          found: true,
          selectedTabId: inspectorView.tabbedPane.selectedTabId,
          layout: {
            applied: true,
            totalWidth,
            totalHeight,
            gameWidth: totalWidth - appliedSidebarWidth,
            sidebarWidth: appliedSidebarWidth,
            sidebarRatio: appliedSidebarWidth / totalWidth,
            panelContentWidth: ${JSON.stringify(measurement.contentWidth)},
            panelViewportWidth: ${JSON.stringify(measurement.viewportWidth)},
            contentOverflow: ${JSON.stringify(contentOverflow)},
            panelUrl: ${JSON.stringify(measurement.url)},
            measurementSource: 'panel-content',
          },
        }
      })()`,
      true,
    )

    if (!fittedPanel.layout?.applied || Math.abs(contentOverflow) <= 1) break
    const nextMeasurement = await measureKc3Panel(devToolsWebContents, extensionId)
    if (!nextMeasurement) break
    measurement = nextMeasurement
  }

  return { panelId, ...fittedPanel }
}
