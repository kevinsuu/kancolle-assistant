import { fitGameTabOnce } from './game-auto-fit'
import {
  GAME_CANVAS_OBSERVER_STARTED_CHANNEL,
  GAME_CANVAS_READY_CHANNEL,
} from './game-auto-fit-channels'

const observedFrameKeys = new Set()

const finiteNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const isAllowedGameFrameUrl = (value) => {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      (url.hostname.endsWith('.dmm.com') ||
        url.hostname.endsWith('.dmm.co.jp') ||
        url.hostname.endsWith('.kancolle-server.com'))
    )
  } catch {
    return false
  }
}

const parseRect = (value) => {
  if (!value || typeof value !== 'object') return null
  const width = finiteNumber(value.width)
  const height = finiteNumber(value.height)
  if (!width || !height || width <= 0 || height <= 0) return null
  return {
    width,
    height,
    top: finiteNumber(value.top) ?? 0,
    left: finiteNumber(value.left) ?? 0,
    intrinsicWidth: finiteNumber(value.intrinsicWidth),
    intrinsicHeight: finiteNumber(value.intrinsicHeight),
  }
}

const parseCanvasMeasurement = (value, senderFrameUrl) => {
  if (!value || typeof value !== 'object') return null
  if (!isAllowedGameFrameUrl(senderFrameUrl)) return null
  const canvas = parseRect(value.canvas)
  const viewport = parseRect(value.viewport)
  const parent = value.parent ? parseRect(value.parent) : null
  if (!canvas || !viewport) return null
  if (canvas.intrinsicWidth !== 1200 || canvas.intrinsicHeight !== 720) return null
  return {
    url: senderFrameUrl,
    canvas,
    parent,
    viewport,
    stableSamples: finiteNumber(value.stableSamples) ?? 0,
    waitedMs: finiteNumber(value.waitedMs) ?? 0,
  }
}

export const registerGameAutoFitIpc = ({ ipcMain, enabled, findTab, displayMetrics, logger }) => {
  ipcMain.on(GAME_CANVAS_OBSERVER_STARTED_CHANNEL, (event) => {
    const frame = event.senderFrame
    const frameKey = `${event.sender.id}:${frame?.processId ?? 0}:${frame?.routingId ?? 0}`
    if (observedFrameKeys.has(frameKey)) return
    observedFrameKeys.add(frameKey)
    logger('display.game-canvas-observer-started', {
      webContentsId: event.sender.id,
      frameUrl: frame?.url || '',
    })
  })

  ipcMain.on(GAME_CANVAS_READY_CHANNEL, (event, payload) => {
    if (!enabled()) return
    const measurement = parseCanvasMeasurement(payload, event.senderFrame?.url || '')
    if (!measurement) {
      logger('display.game-canvas-ready-invalid', { senderFrameUrl: event.senderFrame?.url })
      return
    }

    const tab = findTab(event.sender)
    if (!tab || tab.gameAutoFitScheduled) return
    tab.gameAutoFitScheduled = true
    logger('display.game-canvas-ready', {
      webContentsId: event.sender.id,
      frameUrl: measurement.url,
      canvas: measurement.canvas,
      viewport: measurement.viewport,
      stableSamples: measurement.stableSamples,
      waitedMs: measurement.waitedMs,
    })

    const applyAutoFit = async () => {
      if (tab.gameDevtoolsReady) await tab.gameDevtoolsReady
      const result = await fitGameTabOnce({
        tab,
        displayMetrics,
        logger,
        initialMeasurement: measurement,
      })
      if (!result.applied) tab.gameAutoFitScheduled = false
    }
    applyAutoFit().catch((error) => {
      tab.gameAutoFitScheduled = false
      logger('display.game-auto-fit-error', { message: error?.message || String(error) })
    })
  })
}
