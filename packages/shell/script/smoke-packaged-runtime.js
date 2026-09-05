// Run with the matching Electron runtime against packaged ASAR assets; unset ELECTRON_RUN_AS_NODE.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const { Worker } = require('node:worker_threads')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const directory = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'kancolle-runtime-smoke-'))
app.setPath('userData', directory)
let window
const workers = []
const timeout = setTimeout(() => {
  console.error('Packaged runtime smoke timed out')
  app.exit(1)
}, 30_000)
const request = (worker, input) =>
  new Promise((resolve, reject) => {
    const onError = (error) => {
      worker.off('message', onMessage)
      reject(error)
    }
    const onMessage = (message) => {
      worker.off('error', onError)
      resolve(message)
    }
    worker.once('error', onError)
    worker.once('message', onMessage)
    worker.postMessage(input)
  })
app
  .whenReady()
  .then(async () => {
    const archive = process.env.KANCOLLE_SMOKE_ASAR
    if (!archive) throw new Error('KANCOLLE_SMOKE_ASAR is required')
    const mainDir = path.join(archive, '.webpack/main')
    for (const filename of ['recommendation.worker.js', 'maintenance.worker.js']) {
      const worker = new Worker(path.join(mainDir, filename))
      workers.push(worker)
      const message = await request(worker, {
        type: 'recommendation:run',
        id: 1,
        operation: 'unknown',
        input: { operation: 'unknown' },
      })
      assert.equal(message.type, 'recommendation:error')
      assert.equal(message.id, 1)
    }
    const snapshot = {
      generatedAt: '2026-09-05T00:00:00Z',
      startHour: 0,
      endHourExclusive: 1,
      currentHour: 0,
      current: Object.fromEntries(
        ['fuel', 'ammo', 'steel', 'bauxite', 'torch', 'bucket', 'devmat', 'screws'].map((key) => [
          key,
          0,
        ]),
      ),
      records: [],
      materialSnapshots: [],
      consumableSnapshots: [],
    }
    const summary = await request(workers[0], {
      type: 'recommendation:run',
      id: 2,
      operation: 'resource-ledger',
      input: { snapshot, range: 'today', now: 0 },
    })
    assert.equal(summary.type, 'recommendation:result', summary.error?.message)
    const AdmZip = require('adm-zip'),
      archivePath = path.join(directory, 'fixture.zip'),
      zip = new AdmZip()
    zip.addFile('cached.json', Buffer.from('{}'))
    zip.writeZip(archivePath)
    const index = await request(workers[1], {
      type: 'recommendation:run',
      id: 2,
      input: { operation: 'zip-index', source: archivePath },
    })
    assert.equal(index.type, 'recommendation:result', index.error?.message)
    assert.deepEqual(index.result.entries, {})
    const Jimp = require(path.resolve(__dirname, '../../kccacheproxy/src/proxy/mod/jimp'))
    const imagePath = path.join(directory, 'sprites.png'),
      image = new Jimp(4, 4, 0x345678ff)
    await image.writeAsync(imagePath)
    await fs.writeFile(
      imagePath.replace('.png', '.json'),
      JSON.stringify({
        frames: {
          first: { frame: { x: 0, y: 0, w: 2, h: 2 } },
          second: { frame: { x: 2, y: 2, w: 2, h: 2 } },
        },
      }),
    )
    const extractDirectory = path.join(directory, 'split')
    const extracted = await request(workers[1], {
      type: 'recommendation:run',
      id: 3,
      input: { operation: 'extract', source: imagePath, target: extractDirectory },
    })
    assert.equal(extracted.type, 'recommendation:result', extracted.error?.message)
    assert.equal(extracted.result.fileCount, 2)
    assert.equal((await fs.readdir(extractDirectory)).length, 2)
    // Load the real bundled preload on an isolated extension page.
    const extensionDir = path.join(directory, 'extension')
    await fs.mkdir(extensionDir)
    await fs.writeFile(
      path.join(extensionDir, 'manifest.json'),
      JSON.stringify({ manifest_version: 2, name: 'Runtime smoke', version: '1.0' }),
    )
    await fs.writeFile(
      path.join(extensionDir, 'settings.html'),
      '<html><body>Runtime smoke</body></html>',
    )
    const isolated = session.fromPartition('persist:smoke-' + Date.now())
    const extension = await isolated.loadExtension(extensionDir)
    ipcMain.handle('webui-message', (_event, meta) => ({ type: meta.type }))
    window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: isolated,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(archive, '.webpack/renderer/browser/preload.js'),
      },
    })
    await window.loadURL(`chrome-extension://${extension.id}/settings.html`)
    const result = await window.webContents.executeJavaScript(`(async () => {
    if (typeof ipc.sendWebUiCommand !== 'function' || typeof ipc.onWebUiMessage !== 'function' || ipc.send !== undefined) throw Error('Invalid bridge')
    const unsub = ipc.onWebUiMessage(() => {}); unsub(); unsub()
    return ipc.sendWebUiCommand({type:'get-config'})
  })()`)
    assert.deepEqual(result, { type: 'get-config' })
    console.log(
      JSON.stringify({
        status: 'passed',
        workers: workers.length,
        preload: 'named IPC and unsubscribe',
        electron: process.versions.electron,
      }),
    )
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    clearTimeout(timeout)
    window?.destroy()
    await Promise.all(workers.map((worker) => worker.terminate()))
    if (directory) await fs.rm(directory, { recursive: true, force: true })
    app.exit(process.exitCode || 0)
  })
