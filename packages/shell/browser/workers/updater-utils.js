import { parentPort } from 'worker_threads'

const onUpdateStarted = function (name) {
  parentPort.postMessage({ type: 'update-process-started', data: { name } })
}
const onUpdateProgress = function (name, phase, current, total) {
  parentPort.postMessage({ type: 'update-process-progress', data: { name, phase, current, total } })
}
const onUpdateCompleted = function (name) {
  parentPort.postMessage({ type: 'update-process-completed', data: { name } })
}

export { onUpdateStarted, onUpdateProgress, onUpdateCompleted }
