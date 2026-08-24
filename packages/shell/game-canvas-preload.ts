import { ipcRenderer } from 'electron'
import {
  GAME_CANVAS_OBSERVER_STARTED_CHANNEL,
  GAME_CANVAS_READY_CHANNEL,
} from './browser/display/game-auto-fit-channels.js'
import { observeGameCanvas } from './browser/display/game-canvas-observer.js'

if (location.protocol === 'http:' || location.protocol === 'https:') {
  ipcRenderer.send(GAME_CANVAS_OBSERVER_STARTED_CHANNEL)
  const startCanvasObserver = () => {
    observeGameCanvas((measurement) => {
      ipcRenderer.send(GAME_CANVAS_READY_CHANNEL, measurement)
    })
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startCanvasObserver, { once: true })
  } else {
    startCanvasObserver()
  }
}
