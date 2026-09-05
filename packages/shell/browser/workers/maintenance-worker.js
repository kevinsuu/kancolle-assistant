import { parentPort } from 'worker_threads'
import { runMaintenance } from './maintenance-operations'
parentPort.on('message', async (message) => {
  if (message?.type !== 'recommendation:run' || !Number.isInteger(message.id)) return
  try {
    const result = await runMaintenance(message.input)
    const transfers =
      ArrayBuffer.isView(result) && result.byteLength === result.buffer.byteLength
        ? [result.buffer]
        : []
    parentPort.postMessage({ type: 'recommendation:result', id: message.id, result }, transfers)
  } catch (error) {
    parentPort.postMessage({
      type: 'recommendation:error',
      id: message.id,
      error: { code: 'MAINTENANCE_FAILED', message: String(error.message).slice(0, 240) },
    })
  }
})
