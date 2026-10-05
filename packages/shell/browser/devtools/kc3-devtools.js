import fsSync from 'fs'
import path from 'path'

const DEVTOOLS_PREFERENCES_KEY = 'electron'
const KC3_PANEL_TITLE = 'KanColle'
const KC3_INITIAL_SIDEBAR_RATIO = 0.32
const KC3_PANEL_MEASURE_ATTEMPTS = 100
const KC3_PANEL_MEASURE_INTERVAL_MS = 100
export const KC3_DEFAULT_QUEST_ROWS = 8
const KC3_QUEST_CAPACITY_STYLE_ID = 'kancolle-assistant-quest-capacity'
export const KC3_QUEST_CAPACITY_LOG_PREFIX = '[Kancolle Assistant] kc3.quest-capacity '
const KC3_NATSUIRO_VISIBLE_QUEST_ROWS = 7
const KC3_NATSUIRO_QUEST_ROW_HEIGHT = 18
const KC3_NATSUIRO_BACKGROUND_WIDTH = 800
const KC3_NATSUIRO_HORIZONTAL_HEIGHT = 450
const KC3_NATSUIRO_HORIZONTAL_STATUS_TOP = 400
const KC3_NATSUIRO_VERTICAL_HEIGHT = 325

export const calculateKc3QuestPanelMinHeight = ({
  rowHeight,
  rowGap = 0,
  paddingTop = 0,
  paddingBottom = 0,
  rows = KC3_DEFAULT_QUEST_ROWS,
}) => {
  const normalizedRows = Math.max(1, Math.ceil(Number(rows) || KC3_DEFAULT_QUEST_ROWS))
  const normalizedRowHeight = Math.max(0, Number(rowHeight) || 0)
  const normalizedRowGap = Math.max(0, Number(rowGap) || 0)
  const normalizedPaddingTop = Math.max(0, Number(paddingTop) || 0)
  const normalizedPaddingBottom = Math.max(0, Number(paddingBottom) || 0)
  return Math.ceil(
    normalizedRows * normalizedRowHeight +
      Math.max(normalizedRows - 1, 0) * normalizedRowGap +
      normalizedPaddingTop +
      normalizedPaddingBottom,
  )
}

export const calculateKc3QuestPanelHeightIncrease = ({
  rowHeight,
  currentRows = KC3_NATSUIRO_VISIBLE_QUEST_ROWS,
  targetRows = KC3_DEFAULT_QUEST_ROWS,
}) =>
  Math.ceil(
    Math.max(0, Number(targetRows) - Number(currentRows)) * Math.max(0, Number(rowHeight) || 0),
  )

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

const APPLY_KC3_QUEST_CAPACITY_SCRIPT = `(() => {
  const questModule = document.querySelector('.module.quests')
  if (!questModule) return { applied: false, reason: 'quest-module-unavailable' }

  let style = document.getElementById(${JSON.stringify(KC3_QUEST_CAPACITY_STYLE_ID)})
  if (!style) {
    style = document.createElement('style')
    style.id = ${JSON.stringify(KC3_QUEST_CAPACITY_STYLE_ID)}
    ;(document.head || document.documentElement).append(style)
  }

  const stateKey = '__kancolleAssistantQuestCapacity'
  const previousState = questModule[stateKey]
  previousState?.observer?.disconnect()
  const wrapper = questModule.closest('.wrapper')
  const backgroundModule = wrapper?.querySelector(':scope > .wrapper_bg')
  const statusModule = wrapper?.querySelector('.module.status')

  const state = {
    observer: null,
    scheduled: false,
    lastDiagnosticSignature: previousState?.lastDiagnosticSignature || '',
  }
  questModule[stateKey] = state

  const numberValue = (value) => Number.parseFloat(value) || 0
  const rectValue = (rect) => ({
    top: Math.round(rect.top * 100) / 100,
    bottom: Math.round(rect.bottom * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
  })

  const applyCapacity = (trigger) => {
    const isNatsuiro = location.pathname.includes('/themes/natsuiro/')
    const questRows = Array.from(questModule.querySelectorAll(':scope > .quest'))
    const renderedRowHeights = questRows
      .map((row) => row.getBoundingClientRect().height)
      .filter((height) => height > 0)
    const moduleStyles = window.getComputedStyle(questModule)
    const rowStyles = questRows[0] ? window.getComputedStyle(questRows[0]) : null
    const renderedRowHeight = Math.max(0, ...renderedRowHeights)
    const rowHeight = renderedRowHeight ||
      numberValue(rowStyles?.lineHeight) ||
      (isNatsuiro ? ${KC3_NATSUIRO_QUEST_ROW_HEIGHT} : numberValue(moduleStyles.lineHeight)) ||
      18
    const measurementSource = renderedRowHeight > 0 ? 'rendered-row' : 'line-height-fallback'
    const rowGap = numberValue(moduleStyles.rowGap) || numberValue(moduleStyles.gap)
    const paddingTop = numberValue(moduleStyles.paddingTop)
    const paddingBottom = numberValue(moduleStyles.paddingBottom)
    const minHeight = Math.ceil(
      rowHeight * ${KC3_DEFAULT_QUEST_ROWS} +
        rowGap * (${KC3_DEFAULT_QUEST_ROWS} - 1) +
        paddingTop +
        paddingBottom,
    )
    const panelHeightIncrease = isNatsuiro
      ? ${KC3_NATSUIRO_QUEST_ROW_HEIGHT} *
        (${KC3_DEFAULT_QUEST_ROWS} - ${KC3_NATSUIRO_VISIBLE_QUEST_ROWS})
      : 0
    const natsuiroQuestHeight =
      ${KC3_NATSUIRO_QUEST_ROW_HEIGHT} * ${KC3_DEFAULT_QUEST_ROWS}
    const questSizeRule = isNatsuiro
      ? 'height: ' + natsuiroQuestHeight + 'px !important; ' +
        'min-height: ' + natsuiroQuestHeight + 'px !important; ' +
        'max-height: none !important; overflow-x: hidden !important; ' +
        'overflow-y: overlay !important;'
      : 'height: auto !important; min-height: ' + minHeight + 'px !important; ' +
        'max-height: none !important; overflow: visible !important;'
    const wrapperSizeRule = isNatsuiro
      ? '.wrapper.h { height: ' +
        (${KC3_NATSUIRO_HORIZONTAL_HEIGHT} + panelHeightIncrease) +
        'px !important; } ' +
        '.wrapper.v { height: ' +
        (${KC3_NATSUIRO_VERTICAL_HEIGHT} + panelHeightIncrease) +
        'px !important; } ' +
        '.wrapper.h .module.status { top: ' +
        (${KC3_NATSUIRO_HORIZONTAL_STATUS_TOP} + panelHeightIncrease) +
        'px !important; } ' +
        '.wrapper.h > .wrapper_bg { height: ' +
        (${KC3_NATSUIRO_HORIZONTAL_HEIGHT} + panelHeightIncrease) +
        'px !important; background-size: ${KC3_NATSUIRO_BACKGROUND_WIDTH}px ' +
        (${KC3_NATSUIRO_HORIZONTAL_HEIGHT} + panelHeightIncrease) +
        'px !important; background-repeat: no-repeat !important; } ' +
        '.wrapper.v > .wrapper_bg { height: ' +
        (${KC3_NATSUIRO_VERTICAL_HEIGHT} + panelHeightIncrease) +
        'px !important; }'
      : ''

    style.textContent =
      '.module.quests { box-sizing: border-box !important; ' + questSizeRule + ' } ' +
      wrapperSizeRule + ' .wrapper_bg { height: 100% !important; }'
    questModule.style.setProperty('box-sizing', 'border-box', 'important')
    questModule.style.setProperty(
      'height',
      isNatsuiro ? natsuiroQuestHeight + 'px' : 'auto',
      'important',
    )
    questModule.style.setProperty(
      'min-height',
      (isNatsuiro ? natsuiroQuestHeight : minHeight) + 'px',
      'important',
    )
    questModule.style.setProperty('max-height', 'none', 'important')
    if (isNatsuiro) {
      questModule.style.setProperty('overflow-x', 'hidden', 'important')
      questModule.style.setProperty('overflow-y', 'overlay', 'important')
    } else {
      questModule.style.setProperty('overflow', 'visible', 'important')
    }

    const questRect = questModule.getBoundingClientRect()
    const wrapperRect = wrapper?.getBoundingClientRect()
    const backgroundRect = backgroundModule?.getBoundingClientRect()
    const backgroundStyles = backgroundModule ? window.getComputedStyle(backgroundModule) : null
    const statusRect = statusModule?.getBoundingClientRect()
    const widthWrapperRect = wrapper?.parentElement?.classList.contains('width-wrapper')
      ? wrapper.parentElement.getBoundingClientRect()
      : null
    const frameVisible = questRect.height > 0 && Boolean(wrapperRect?.height)
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 0
    const wrapperFillsViewport = Boolean(wrapperRect && wrapperRect.height >= viewportHeight - 0.5)
    const statusOffset = isNatsuiro && wrapper?.classList.contains('h')
      ? panelHeightIncrease
      : 0
    const statusBottomGap = wrapperRect && statusRect
      ? Math.max(0, Math.round((wrapperRect.bottom - statusRect.bottom) * 100) / 100)
      : 0
    const backgroundBottomGap = wrapperRect && backgroundRect
      ? Math.max(0, Math.round((wrapperRect.bottom - backgroundRect.bottom) * 100) / 100)
      : 0
    const rowRects = questRows.map((row) => row.getBoundingClientRect())
    const visibleQuestCount = rowRects.filter(
      (rect) => rect.height > 0 && rect.top >= 0 && rect.bottom <= viewportHeight + 0.5,
    ).length
    const lastQuestBottom = rowRects.length ? Math.max(...rowRects.map((rect) => rect.bottom)) : 0
    const viewportOverflow = Math.max(0, Math.ceil(lastQuestBottom - viewportHeight))
    const wrapperOverflow = wrapperRect
      ? Math.max(0, Math.ceil(lastQuestBottom - wrapperRect.bottom))
      : 0
    const clippedQuestCount = Math.max(0, questRows.length - visibleQuestCount)
    const outcome = !frameVisible
      ? 'panel-hidden'
      : wrapperOverflow > 0
        ? 'wrapper-clipped'
        : viewportOverflow > 0
          ? 'viewport-clipped'
          : questRows.length >= ${KC3_DEFAULT_QUEST_ROWS}
            ? 'eight-rows-visible'
            : 'capacity-reserved'
    const diagnostics = {
      applied: true,
      selector: '.module.quests',
      trigger,
      outcome,
      frameUrl: location.href,
      frameVisible,
      theme: isNatsuiro ? 'natsuiro' : 'responsive',
      rows: ${KC3_DEFAULT_QUEST_ROWS},
      questCount: questRows.length,
      visibleQuestCount,
      clippedQuestCount,
      measurementSource,
      rowHeight,
      rowGap,
      minHeight,
      panelHeightIncrease,
      statusOffset,
      statusBottomGap,
      backgroundBottomGap,
      backgroundSize: backgroundStyles?.backgroundSize || '',
      backgroundRepeat: backgroundStyles?.backgroundRepeat || '',
      heightMode: 'minimum-visible-rows',
      panelHeightMode: isNatsuiro ? 'fixed-plus-one-row' : 'theme-content-height',
      overflow: isNatsuiro ? 'overlay' : 'visible',
      viewportHeight,
      wrapperFillsViewport,
      viewportOverflow,
      wrapperOverflow,
      questRect: rectValue(questRect),
      wrapperRect: wrapperRect ? rectValue(wrapperRect) : null,
      backgroundRect: backgroundRect ? rectValue(backgroundRect) : null,
      statusRect: statusRect ? rectValue(statusRect) : null,
      widthWrapperRect: widthWrapperRect ? rectValue(widthWrapperRect) : null,
      questScrollHeight: questModule.scrollHeight,
      wrapperScrollHeight: wrapper?.scrollHeight || 0,
      appliedHeight: questRect.height,
    }
    const diagnosticSignature = JSON.stringify({
      outcome,
      frameVisible,
      questCount: diagnostics.questCount,
      visibleQuestCount,
      measurementSource,
      rowHeight,
      minHeight,
      panelHeightIncrease,
      statusOffset,
      statusBottomGap,
      backgroundBottomGap,
      backgroundSize: diagnostics.backgroundSize,
      backgroundRepeat: diagnostics.backgroundRepeat,
      viewportHeight,
      wrapperFillsViewport,
      viewportOverflow,
      wrapperOverflow,
    })
    if (trigger !== 'initial' && diagnosticSignature !== state.lastDiagnosticSignature) {
      console.info(
        ${JSON.stringify(KC3_QUEST_CAPACITY_LOG_PREFIX)} + JSON.stringify(diagnostics),
      )
    }
    state.lastDiagnosticSignature = diagnosticSignature
    return diagnostics
  }

  const diagnostics = applyCapacity('initial')
  state.observer = new MutationObserver(() => {
    if (state.scheduled) return
    state.scheduled = true
    window.requestAnimationFrame(() => {
      state.scheduled = false
      applyCapacity('quest-dom-changed')
    })
  })
  state.observer.observe(questModule, { childList: true })
  if (wrapper) {
    state.observer.observe(wrapper, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
  }

  return diagnostics
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

export const applyKc3QuestPanelCapacity = async (devToolsWebContents, extensionId) => {
  if (!devToolsWebContents || devToolsWebContents.isDestroyed() || !extensionId) {
    return { applied: false, reason: 'quest-panel-unavailable' }
  }

  const panelUrlPrefix = `chrome-extension://${extensionId}/pages/devtools/`
  const frames = (devToolsWebContents.mainFrame.framesInSubtree || []).filter(
    (frame) =>
      isLiveFrame(frame) && typeof frame.url === 'string' && frame.url.startsWith(panelUrlPrefix),
  )
  const results = await Promise.all(
    frames.map(async (frame) => {
      try {
        const result = await frame.executeJavaScript(APPLY_KC3_QUEST_CAPACITY_SCRIPT, true)
        return result ? { ...result, frameUrl: frame.url } : null
      } catch (error) {
        return {
          applied: false,
          reason: 'quest-capacity-script-failed',
          frameUrl: frame.url,
          error: String(error?.message || error).slice(0, 200),
        }
      }
    }),
  )
  const candidates = results.filter(Boolean).map((result) => ({
    applied: Boolean(result.applied),
    reason: result.reason,
    frameUrl: result.frameUrl,
    frameVisible: Boolean(result.frameVisible),
    questCount: result.questCount || 0,
    visibleQuestCount: result.visibleQuestCount || 0,
    appliedHeight: result.appliedHeight || 0,
    viewportHeight: result.viewportHeight || 0,
    outcome: result.outcome,
  }))
  const appliedResult = results
    .filter((result) => result?.applied)
    .sort((left, right) => {
      const leftScore =
        Number(Boolean(left.frameVisible)) * 1_000_000_000 +
        Number((left.questCount || 0) > 0) * 1_000_000 +
        (left.visibleQuestCount || 0) * 10_000 +
        (left.questCount || 0) * 100 +
        (left.appliedHeight || 0)
      const rightScore =
        Number(Boolean(right.frameVisible)) * 1_000_000_000 +
        Number((right.questCount || 0) > 0) * 1_000_000 +
        (right.visibleQuestCount || 0) * 10_000 +
        (right.questCount || 0) * 100 +
        (right.appliedHeight || 0)
      return rightScore - leftScore
    })[0]
  if (appliedResult) {
    return {
      ...appliedResult,
      frameCount: frames.length,
      candidateCount: candidates.length,
      candidates,
    }
  }
  const failedResult = results.find((result) => result?.reason) || {
    applied: false,
    reason: 'quest-panel-frame-unavailable',
  }
  return {
    ...failedResult,
    frameCount: frames.length,
    candidateCount: candidates.length,
    candidates,
  }
}

const withQuestCapacity = (layout, questCapacity) =>
  layout ? { ...layout, questCapacity } : layout

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
  const questCapacity = await applyKc3QuestPanelCapacity(devToolsWebContents, extensionId)
  if (!measurement) {
    return {
      panelId,
      ...selectedPanel,
      questCapacity,
      layout: withQuestCapacity(selectedPanel.layout, questCapacity),
    }
  }

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

  return {
    panelId,
    ...fittedPanel,
    questCapacity,
    layout: withQuestCapacity(fittedPanel.layout, questCapacity),
  }
}
