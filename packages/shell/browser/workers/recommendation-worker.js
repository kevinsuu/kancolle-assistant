const { parentPort } = require('worker_threads')
const {
  planExpeditions,
  recommendFleet,
  summarizeResourceLedger,
} = require('@kancolle-assistant/recommendation-core')

const operations = {
  expedition: planExpeditions,
  fleet: recommendFleet,
  'resource-ledger': summarizeResourceLedger,
}

parentPort.on('message', (message) => {
  if (message?.type !== 'recommendation:run' || typeof message.id !== 'number') return
  try {
    const operation = operations[message.operation || 'fleet']
    if (!operation) throw new Error(`Unknown recommendation operation: ${message.operation}`)
    parentPort.postMessage({
      type: 'recommendation:result',
      id: message.id,
      result: operation(message.input),
    })
  } catch (error) {
    parentPort.postMessage({
      type: 'recommendation:error',
      id: message.id,
      error: { message: error instanceof Error ? error.message : String(error) },
    })
  }
})
