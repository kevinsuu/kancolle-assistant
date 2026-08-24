const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 720
const POLL_INTERVAL_MS = 250
const TIMEOUT_MS = 5 * 60 * 1000
const STABLE_SAMPLES = 3

const measureCanvas = (canvas) => {
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
    parent: parentRect
      ? {
          width: parentRect.width,
          height: parentRect.height,
        }
      : null,
    viewport: {
      width: Math.max(document.documentElement.clientWidth, window.innerWidth || 0),
      height: Math.max(document.documentElement.clientHeight, window.innerHeight || 0),
    },
  }
}

const measurementKey = (measurement) =>
  [
    measurement.canvas.width,
    measurement.canvas.height,
    measurement.canvas.top,
    measurement.canvas.left,
    measurement.parent?.width ?? 0,
    measurement.parent?.height ?? 0,
    measurement.viewport.width,
    measurement.viewport.height,
  ]
    .map((value) => Math.round(Number(value)))
    .join(':')

export const observeGameCanvas = (onReady) => {
  let previousKey = ''
  let stableCount = 0
  const startedAt = Date.now()

  const timer = setInterval(() => {
    if (Date.now() - startedAt >= TIMEOUT_MS) {
      clearInterval(timer)
      return
    }

    const canvas = Array.from(document.querySelectorAll('canvas')).find(
      (element) =>
        Number(element.width) === CANVAS_WIDTH && Number(element.height) === CANVAS_HEIGHT,
    )
    const measurement = canvas ? measureCanvas(canvas) : null
    if (!measurement) {
      previousKey = ''
      stableCount = 0
      return
    }

    const currentKey = measurementKey(measurement)
    if (currentKey === previousKey) stableCount += 1
    else {
      previousKey = currentKey
      stableCount = 1
    }

    if (stableCount < STABLE_SAMPLES) return
    clearInterval(timer)
    onReady({ ...measurement, stableSamples: stableCount, waitedMs: Date.now() - startedAt })
  }, POLL_INTERVAL_MS)
}
