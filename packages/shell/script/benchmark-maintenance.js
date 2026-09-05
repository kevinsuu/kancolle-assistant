// Local synthetic benchmark: no game/account/network data. Compare identical codec operations.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { monitorEventLoopDelay, performance } = require('node:perf_hooks')
const assert = require('node:assert/strict')
const esbuild = require('esbuild')
const AdmZip = require('adm-zip')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'kancolle-maintenance-benchmark-'))
  let worker
  try {
    for (const [name, entry] of [
      ['operations', 'maintenance-operations'],
      ['worker', 'maintenance-worker'],
    ]) {
      esbuild.buildSync({
        entryPoints: [path.join(root, 'browser/workers', `${entry}.js`)],
        outfile: path.join(temporary, `${name}.cjs`),
        bundle: true,
        platform: 'node',
        logLevel: 'silent',
      })
    }
    const { runMaintenance } = require(path.join(temporary, 'operations.cjs'))
    const Jimp = require(path.resolve(root, '../kccacheproxy/src/proxy/mod/jimp'))
    const source = path.join(temporary, 'sprites.png')
    const img = new Jimp(1024, 1024, 0x345678ff)
    await img.writeAsync(source)
    const frames = Object.fromEntries(
      Array.from({ length: 64 }, (_, i) => [
        i,
        { frame: { x: (i % 8) * 128, y: Math.floor(i / 8) * 128, w: 128, h: 128 } },
      ]),
    )
    await fs.writeFile(source.replace('.png', '.json'), JSON.stringify({ frames }))
    const zipPath = path.join(temporary, 'cache.zip'),
      zip = new AdmZip()
    zip.addFile('cached.json', Buffer.from('{}'))
    zip.addFile('payload', Buffer.alloc(16 * 1024 * 1024, 37))
    zip.writeZip(zipPath)
    const rssBeforeWorker = process.memoryUsage().rss
    worker = new Worker(path.join(temporary, 'worker.cjs'))
    let id = 0
    const remote = (input) =>
      new Promise((resolve, reject) => {
        const requestId = ++id
        const timer = setTimeout(() => {
          cleanup()
          reject(new Error('Benchmark worker timed out'))
        }, 30_000)
        const cleanup = () => {
          clearTimeout(timer)
          worker.off('message', onMessage)
          worker.off('error', onError)
        }
        const onError = (error) => {
          cleanup()
          reject(error)
        }
        const onMessage = (message) => {
          if (message.id !== requestId) return
          cleanup()
          message.type === 'recommendation:result'
            ? resolve(message.result)
            : reject(new Error(message.error.message))
        }
        worker.on('message', onMessage)
        worker.on('error', onError)
        worker.postMessage({ type: 'recommendation:run', id: requestId, input })
      })
    await remote({ operation: 'zip-index', source: zipPath })
    const rssIdleWorker = process.memoryUsage().rss
    const results = []
    for (const operation of ['outlines', 'zip-entry']) {
      const input =
        operation === 'outlines'
          ? { operation, source, target: path.join(temporary, 'output.png') }
          : { operation, source: zipPath, entry: 'payload' }
      const expected = await runMaintenance(input)
      const expectedHash = hash(
        operation === 'outlines' ? await fs.readFile(input.target) : expected,
      )
      const actual = await remote(input)
      assert.equal(
        hash(operation === 'outlines' ? await fs.readFile(input.target) : Buffer.from(actual)),
        expectedHash,
      )
      for (const [mode, run] of [
        ['main', runMaintenance],
        ['worker', remote],
      ]) {
        const samples = []
        for (let i = 0; i < 5; i++) {
          const monitor = monitorEventLoopDelay({ resolution: 1 })
          monitor.enable()
          await sleep(10)
          const start = performance.now()
          await run(input)
          const elapsedMs = performance.now() - start
          await sleep(10)
          monitor.disable()
          samples.push({
            elapsedMs,
            eventLoopP95Ms: monitor.percentile(95) / 1e6,
            eventLoopMaxMs: monitor.max / 1e6,
            rss: process.memoryUsage().rss,
          })
        }
        results.push({ operation, mode, samples })
      }
    }
    const report = {
      node: process.version,
      platform: process.platform,
      imagePixels: 1024 * 1024,
      archivePayloadBytes: 16 * 1024 * 1024,
      rssBeforeWorker,
      rssIdleWorker,
      rssWithWorker: process.memoryUsage().rss,
      outputEquivalence: 'sha256 matched',
      results,
    }
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await worker?.terminate()
    await fs.rm(temporary, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
