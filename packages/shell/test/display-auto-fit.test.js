import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateGameAndSidebarWindowLayout } from '../browser/display/game-auto-fit.js'
import {
  calculateKc3QuestPanelHeightIncrease,
  calculateKc3QuestPanelMinHeight,
  showKc3DevToolsPanel,
} from '../browser/devtools/kc3-devtools.js'

const displayMetrics = (width, height) => ({
  displayId: 1,
  scaleFactor: 1,
  workAreaSize: { width, height },
  physicalWorkAreaSize: { width, height },
})

const createKc3DevTools = (questCapacity) => {
  const capacities = Array.isArray(questCapacity) ? questCapacity : [questCapacity]
  const frames = capacities.map((capacity, index) => {
    const panelUrl =
      capacity.frameUrl ||
      `chrome-extension://kc3/pages/devtools/themes/murasaki/murasaki-${index}.html`
    return {
      url: panelUrl,
      executeJavaScript: async (script) => {
        if (script.includes('kancolle-assistant-quest-capacity')) return capacity
        return {
          contentWidth: 320,
          viewportWidth: 320,
          hasWrapper: true,
          url: panelUrl,
        }
      },
    }
  })
  let topLevelCallCount = 0
  return {
    isDestroyed: () => false,
    mainFrame: { framesInSubtree: frames },
    executeJavaScript: async () => {
      topLevelCallCount += 1
      if (topLevelCallCount === 1) {
        return {
          found: true,
          selectedTabId: 'KanColle',
          layout: {
            applied: true,
            totalWidth: 1000,
            totalHeight: 600,
            gameWidth: 680,
            sidebarWidth: 320,
            sidebarRatio: 0.32,
            measurementSource: 'initial-ratio',
          },
        }
      }
      return {
        found: true,
        selectedTabId: 'KanColle',
        layout: {
          applied: true,
          totalWidth: 1000,
          totalHeight: 600,
          gameWidth: 680,
          sidebarWidth: 320,
          sidebarRatio: 0.32,
          measurementSource: 'panel-content',
        },
      }
    },
  }
}

test('startup game layout does not upscale past the native game size on wide displays', () => {
  const layout = calculateGameAndSidebarWindowLayout({
    displayMetrics: displayMetrics(1920, 817),
    sidebarWidth: 584,
    topBarHeight: 32,
  })

  assert.equal(layout.applied, true)
  assert.equal(layout.zoomFactor, 1)
  assert.deepEqual(layout.targetSize, { width: 1784, height: 752 })
})

test('startup game layout still scales down when native size cannot fit', () => {
  const layout = calculateGameAndSidebarWindowLayout({
    displayMetrics: displayMetrics(1400, 700),
    sidebarWidth: 500,
    topBarHeight: 32,
  })

  assert.equal(layout.applied, true)
  assert.equal(layout.zoomFactor, 0.75)
  assert.deepEqual(layout.targetSize, { width: 1400, height: 572 })
})

test('KC3 quest panel reserves space for eight rows', () => {
  assert.equal(
    calculateKc3QuestPanelMinHeight({ rowHeight: 20, rowGap: 3, paddingTop: 5, paddingBottom: 5 }),
    191,
  )
  assert.equal(calculateKc3QuestPanelHeightIncrease({ rowHeight: 18 }), 18)
})

test('KC3 layout diagnostics report quest capacity when the theme is supported', async () => {
  const hiddenFrameUrl =
    'chrome-extension://kc3/pages/devtools/themes/natsuiro/natsuiro-hidden.html'
  const visibleFrameUrl =
    'chrome-extension://kc3/pages/devtools/themes/natsuiro/natsuiro-visible.html'
  const result = await showKc3DevToolsPanel({
    devToolsWebContents: createKc3DevTools([
      {
        applied: true,
        frameUrl: hiddenFrameUrl,
        frameVisible: false,
        selector: '.module.quests',
        rows: 8,
        questCount: 0,
        visibleQuestCount: 0,
        clippedQuestCount: 0,
        measurementSource: 'line-height-fallback',
        outcome: 'panel-hidden',
        theme: 'natsuiro',
        rowHeight: 18,
        rowGap: 0,
        minHeight: 144,
        panelHeightIncrease: 18,
        statusOffset: 0,
        statusBottomGap: 0,
        backgroundBottomGap: 0,
        backgroundSize: '',
        backgroundRepeat: '',
        heightMode: 'minimum-visible-rows',
        panelHeightMode: 'fixed-plus-one-row',
        overflow: 'overlay',
        wrapperFillsViewport: false,
        appliedHeight: 0,
      },
      {
        applied: true,
        frameUrl: visibleFrameUrl,
        frameVisible: true,
        selector: '.module.quests',
        rows: 8,
        questCount: 8,
        visibleQuestCount: 8,
        clippedQuestCount: 0,
        measurementSource: 'rendered-row',
        outcome: 'eight-rows-visible',
        theme: 'natsuiro',
        rowHeight: 18,
        rowGap: 0,
        minHeight: 144,
        panelHeightIncrease: 18,
        statusOffset: 18,
        statusBottomGap: 5,
        backgroundBottomGap: 0,
        backgroundSize: '800px 468px',
        backgroundRepeat: 'no-repeat',
        heightMode: 'minimum-visible-rows',
        panelHeightMode: 'fixed-plus-one-row',
        overflow: 'overlay',
        wrapperFillsViewport: false,
        appliedHeight: 144,
      },
    ]),
    extensionId: 'kc3',
  })

  assert.equal(result.layout.questCapacity.applied, true)
  assert.equal(result.layout.questCapacity.frameUrl, visibleFrameUrl)
  assert.equal(result.layout.questCapacity.frameVisible, true)
  assert.equal(result.layout.questCapacity.frameCount, 2)
  assert.equal(result.layout.questCapacity.candidateCount, 2)
  assert.equal(result.layout.questCapacity.rows, 8)
  assert.equal(result.layout.questCapacity.questCount, 8)
  assert.equal(result.layout.questCapacity.visibleQuestCount, 8)
  assert.equal(result.layout.questCapacity.clippedQuestCount, 0)
  assert.equal(result.layout.questCapacity.measurementSource, 'rendered-row')
  assert.equal(result.layout.questCapacity.outcome, 'eight-rows-visible')
  assert.equal(result.layout.questCapacity.minHeight, 144)
  assert.equal(result.layout.questCapacity.heightMode, 'minimum-visible-rows')
  assert.equal(result.layout.questCapacity.panelHeightIncrease, 18)
  assert.equal(result.layout.questCapacity.statusOffset, 18)
  assert.equal(result.layout.questCapacity.statusBottomGap, 5)
  assert.equal(result.layout.questCapacity.backgroundBottomGap, 0)
  assert.equal(result.layout.questCapacity.backgroundSize, '800px 468px')
  assert.equal(result.layout.questCapacity.backgroundRepeat, 'no-repeat')
  assert.equal(result.layout.questCapacity.panelHeightMode, 'fixed-plus-one-row')
  assert.equal(result.layout.questCapacity.wrapperFillsViewport, false)
  assert.equal(result.layout.questCapacity.overflow, 'overlay')
  assert.equal(result.layout.questCapacity.appliedHeight, 144)
})

test('KC3 layout diagnostics preserve unsupported quest theme reasons', async () => {
  const result = await showKc3DevToolsPanel({
    devToolsWebContents: createKc3DevTools({
      applied: false,
      reason: 'quest-module-unavailable',
    }),
    extensionId: 'kc3',
  })

  assert.equal(result.layout.questCapacity.applied, false)
  assert.equal(result.layout.questCapacity.reason, 'quest-module-unavailable')
})
