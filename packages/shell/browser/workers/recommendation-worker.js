const { parentPort } = require('worker_threads')
const { recommendFleet } = require('@kancolle-assistant/recommendation-core')

parentPort.on('message', (message) => {
  if (message?.type !== 'recommendation:run' || typeof message.id !== 'number') return
  try {
    parentPort.postMessage({
      type: 'recommendation:result',
      id: message.id,
      result: recommendFleet(message.input),
    })
  } catch (error) {
    parentPort.postMessage({
      type: 'recommendation:error',
      id: message.id,
      error: { message: error instanceof Error ? error.message : String(error) },
    })
  }
})
