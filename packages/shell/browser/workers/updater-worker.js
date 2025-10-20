import { parentPort } from 'worker_threads'

import KC3Updater from './kc3updater.js'
import KCCPModUpdater from './kccpmodupdater'

let isKc3Updating = false
let isKccpModderUpdating = false
let kc3Channel

let kc3Updater = new KC3Updater()
let kccpModUpdater = new KCCPModUpdater()

parentPort.on('message', async (msg) => {
  console.log('updater-worker.js received message from Main', msg.type)
  // msg: { type, data }
  if (!msg?.type)
    throw new Error('Messages sent to update worker must be in the format { type, data }')

  switch (msg.type) {
    case 'get-is-kc3-updating':
      parentPort.postMessage({
        type: 'status-kc3-is-updating',
        data: { isUpdating: isKc3Updating, channel: kc3Channel },
      })
      break
    case 'get-is-kccp-modder-updating':
      parentPort.postMessage({
        type: 'status-kccp-modder-is-updating',
        data: { isUpdating: isKccpModderUpdating },
      })
      break
    case 'do-kc3-update':
      if (!msg.data || !msg.data.path || !msg.data.channel)
        throw new Error('do-kc3-update data must be in the format { path, channel }')
      await doUpdateKc3(msg.data.path, msg.data.channel)
      break
    case 'do-kccp-modder-update':
      await doUpdateKccpModder(msg.data.config)
      break
    default:
      throw new Error(`Unknown message type ${msg.type}`)
  }
})

const doUpdateKc3 = async function (extensionsPath, updateChannel) {
  if (isKc3Updating) {
    parentPort.postMessage({ type: 'error-do-kc3-update', data: 'Update already in progress.' })
    return
  }
  isKc3Updating = true
  kc3Channel = updateChannel
  parentPort.postMessage({
    type: 'status-kc3-is-updating',
    data: { isUpdating: isKc3Updating, channel: kc3Channel },
  })

  try {
    await kc3Updater.update(extensionsPath, updateChannel)
  } finally {
    isKc3Updating = false
    parentPort.postMessage({
      type: 'status-kc3-is-updating',
      data: { isUpdating: isKc3Updating, channel: kc3Channel },
    })
  }
}

const doUpdateKccpModder = async function (config) {
  if (isKccpModderUpdating) {
    parentPort.postMessage({
      type: 'error-do-kccp-modder-update',
      data: 'Update already in progress.',
    })
    return
  }
  isKccpModderUpdating = true
  parentPort.postMessage({ type: 'status-kccp-modder-is-updating', data: { isKccpModderUpdating } })

  try {
    await kccpModUpdater.update(config)
  } finally {
    isKccpModderUpdating = false
    parentPort.postMessage({
      type: 'status-kccp-modder-is-updating',
      data: { isKccpModderUpdating },
    })
  }
}
