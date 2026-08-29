import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateGameAndSidebarWindowLayout } from '../browser/display/game-auto-fit.js'

const displayMetrics = (width, height) => ({
  displayId: 1,
  scaleFactor: 1,
  workAreaSize: { width, height },
  physicalWorkAreaSize: { width, height },
})

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
