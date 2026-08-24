const GAME_VIEWPORT = Object.freeze({ width: 1200, height: 720 })
const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.25
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 250
const DEFAULT_STABLE_SAMPLES = 3
const fittedWebContents = new WeakSet()

const MEASURE_GAME_CANVAS_SCRIPT = `(() => {
  const canvas = Array.from(document.querySelectorAll('canvas')).find((element) =>
    Number(element.width) === ${GAME_VIEWPORT.width} &&
    Number(element.height) === ${GAME_VIEWPORT.height}
  )
  if (!canvas) return null

  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const parentRect = canvas.parentElement?.getBoundingClientRect()
  return {
    url: location.href,
    canvas: {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      intrinsicWidth: Number(canvas.width),
      intrinsicHeight: Number(canvas.height),
    },
    parent: parentRect ? {
      width: parentRect.width,
      height: parentRect.height,
    } : null,
    viewport: {
      width: Math.max(document.documentElement.clientWidth, window.innerWidth || 0),
      height: Math.max(document.documentElement.clientHeight, window.innerHeight || 0),
    },
  }
})()`

const MEASURE_VIEWPORT_SCRIPT = `({
  width: Math.max(document.documentElement.clientWidth, window.innerWidth || 0),
  height: Math.max(document.documentElement.clientHeight, window.innerHeight || 0),
})`

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

const waitForMainFrame = async (webContents) => {
  if (!webContents.isLoadingMainFrame()) return
  await new Promise((resolve) => {
    const finish = () => {
      webContents.removeListener('did-finish-load', finish)
      webContents.removeListener('did-fail-load', finish)
      resolve()
    }
    webContents.once('did-finish-load', finish)
    webContents.once('did-fail-load', finish)
  })
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const roundedMeasurementKey = (frame, measurement) =>
  [
    frame.routingId,
    measurement.canvas.width,
    measurement.canvas.height,
    measurement.canvas.top,
    measurement.canvas.left,
    measurement.parent?.width ?? 0,
    measurement.parent?.height ?? 0,
    measurement.viewport.width,
    measurement.viewport.height,
  ]
    .map((value, index) => (index === 0 ? value : Math.round(Number(value))))
    .join(':')

const findLargestCanvas = async (webContents) => {
  const frames = webContents.mainFrame.framesInSubtree.filter(
    (frame) =>
      frame &&
      typeof frame.executeJavaScript === 'function' &&
      !(typeof frame.isDestroyed === 'function' && frame.isDestroyed()),
  )
  const measurements = await Promise.all(
    frames.map(async (frame) => {
      try {
        const measurement = await frame.executeJavaScript(MEASURE_GAME_CANVAS_SCRIPT, true)
        return measurement ? { frame, measurement } : null
      } catch {
        return null
      }
    }),
  )
  return measurements
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.measurement.canvas.width * right.measurement.canvas.height -
        left.measurement.canvas.width * left.measurement.canvas.height,
    )[0]
}

const measureTopViewport = async (webContents) => {
  try {
    return await webContents.mainFrame.executeJavaScript(MEASURE_VIEWPORT_SCRIPT, true)
  } catch {
    return null
  }
}

const waitForStableGameCanvas = async (
  webContents,
  { timeoutMs, pollIntervalMs, stableSamples },
) => {
  const startedAt = Date.now()
  let previousKey = ''
  let stableCount = 0

  while (!webContents.isDestroyed() && Date.now() - startedAt < timeoutMs) {
    const candidate = await findLargestCanvas(webContents)
    if (candidate) {
      const measurementKey = roundedMeasurementKey(candidate.frame, candidate.measurement)
      if (measurementKey === previousKey) stableCount += 1
      else {
        previousKey = measurementKey
        stableCount = 1
      }
      if (stableCount >= stableSamples) {
        return { ...candidate, waitedMs: Date.now() - startedAt, stableSamples: stableCount }
      }
    } else {
      previousKey = ''
      stableCount = 0
    }
    await delay(pollIntervalMs)
  }
  return null
}

const withEffectiveViewport = (measurement, topViewport) => ({
  ...measurement,
  viewport: {
    width: Math.min(
      Number(measurement.viewport.width),
      Number(topViewport?.width) || Number.POSITIVE_INFINITY,
    ),
    height: Math.min(
      Number(measurement.viewport.height),
      Number(topViewport?.height) || Number.POSITIVE_INFINITY,
    ),
  },
})

const calculateZoomFactor = (measurement, currentZoom, displayMetrics) => {
  const usableViewportWidth = Math.max(
    Number(measurement.viewport.width) - Math.max(Number(measurement.canvas.left), 0),
    1,
  )
  const usableViewportHeight = Math.max(
    Number(measurement.viewport.height) - Math.max(Number(measurement.canvas.top), 0),
    1,
  )
  const measuredViewportWidth = usableViewportWidth * currentZoom
  const measuredViewportHeight = usableViewportHeight * currentZoom
  const availableWidth = Math.min(
    Number.isFinite(measuredViewportWidth) && measuredViewportWidth > 0
      ? measuredViewportWidth
      : displayMetrics.workAreaSize.width,
    displayMetrics.workAreaSize.width,
  )
  const availableHeight = Math.min(
    Number.isFinite(measuredViewportHeight) && measuredViewportHeight > 0
      ? measuredViewportHeight
      : displayMetrics.workAreaSize.height,
    displayMetrics.workAreaSize.height,
  )
  const canvasWidth = Number(measurement.canvas.width) * currentZoom
  const canvasHeight = Number(measurement.canvas.height) * currentZoom
  const fitRatio = Math.min(availableWidth / canvasWidth, availableHeight / canvasHeight)
  return Math.round(clamp(currentZoom * fitRatio, MIN_ZOOM, MAX_ZOOM) * 100) / 100
}

export const captureStartupDisplayMetrics = (electronScreen) => {
  const display = electronScreen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  return Object.freeze({
    displayId: display.id,
    scaleFactor: display.scaleFactor,
    workAreaSize: Object.freeze({ width, height }),
    physicalWorkAreaSize: Object.freeze({
      width: Math.round(width * display.scaleFactor),
      height: Math.round(height * display.scaleFactor),
    }),
  })
}

export const constrainWindowSizeToDisplay = (size, displayMetrics) => ({
  width: Math.min(size.width, displayMetrics.workAreaSize.width),
  height: Math.min(size.height, displayMetrics.workAreaSize.height),
})

export const fitGameTabOnce = async ({
  tab,
  displayMetrics,
  logger,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  stableSamples = DEFAULT_STABLE_SAMPLES,
  initialMeasurement = null,
}) => {
  const webContents = tab?.webContents
  if (!webContents || webContents.isDestroyed() || fittedWebContents.has(webContents)) {
    return { applied: false, reason: 'already-fitted-or-unavailable' }
  }

  await waitForMainFrame(webContents)
  if (webContents.isDestroyed()) return { applied: false, reason: 'destroyed' }

  if (!initialMeasurement) {
    const frameUrls = (webContents.mainFrame.framesInSubtree || []).map((frame) => frame?.url || '')
    logger('display.game-auto-fit-waiting-canvas', {
      url: webContents.getURL(),
      timeoutMs,
      frameUrls,
    })
  }
  const candidate = initialMeasurement
    ? {
        measurement: initialMeasurement,
        waitedMs: initialMeasurement.waitedMs ?? 0,
        stableSamples: initialMeasurement.stableSamples ?? stableSamples,
      }
    : await waitForStableGameCanvas(webContents, {
        timeoutMs,
        pollIntervalMs,
        stableSamples,
      })
  if (!candidate) {
    logger('display.game-auto-fit-timeout', { timeoutMs })
    return { applied: false, reason: 'canvas-timeout' }
  }

  logger('display.game-canvas-found', {
    source: initialMeasurement ? 'renderer-signal' : 'main-process-frame-scan',
    frameUrl: candidate.measurement.url,
    canvas: candidate.measurement.canvas,
    viewport: candidate.measurement.viewport,
    waitedMs: candidate.waitedMs,
  })

  const currentZoom = webContents.getZoomFactor()
  const topViewport = await measureTopViewport(webContents)
  const stableMeasurement = withEffectiveViewport(candidate.measurement, topViewport)
  let zoomFactor = calculateZoomFactor(stableMeasurement, currentZoom, displayMetrics)

  webContents.setZoomFactor(zoomFactor)
  await delay(Math.max(pollIntervalMs, 250))

  const finalCandidate = await findLargestCanvas(webContents)
  if (finalCandidate) {
    const finalTopViewport = await measureTopViewport(webContents)
    const finalMeasurement = withEffectiveViewport(finalCandidate.measurement, finalTopViewport)
    const correctedZoom = calculateZoomFactor(
      finalMeasurement,
      webContents.getZoomFactor(),
      displayMetrics,
    )
    if (Math.abs(correctedZoom - zoomFactor) >= 0.01) {
      zoomFactor = correctedZoom
      webContents.setZoomFactor(zoomFactor)
    }
  }

  fittedWebContents.add(webContents)
  logger('display.game-auto-fit', {
    displayId: displayMetrics.displayId,
    scaleFactor: displayMetrics.scaleFactor,
    physicalWorkAreaSize: displayMetrics.physicalWorkAreaSize,
    waitedMs: candidate.waitedMs,
    stableSamples: candidate.stableSamples,
    frameUrl: candidate.measurement.url,
    canvas: candidate.measurement.canvas,
    parent: candidate.measurement.parent,
    frameViewport: candidate.measurement.viewport,
    topViewport,
    effectiveViewport: stableMeasurement.viewport,
    finalCanvas: finalCandidate?.measurement.canvas ?? null,
    zoomFactor,
  })
  return { applied: true, zoomFactor }
}
