const path = require('node:path')
const { Worker } = require('node:worker_threads')
const workerPath = path.resolve(
  process.argv[2] || path.join(__dirname, '../.webpack/x64/main/recommendation.worker.js'),
)
const workers = []
async function main() {
  const samples = [{ workers: 0, rss: process.memoryUsage().rss }]
  try {
    for (let count = 1; count <= 3; count++) {
      const worker = new Worker(workerPath)
      workers.push(worker)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker handshake timeout')), 10_000)
        worker.once('error', (error) => {
          clearTimeout(timer)
          reject(error)
        })
        worker.once('message', () => {
          clearTimeout(timer)
          resolve()
        })
        worker.postMessage({ type: 'recommendation:run', id: count, operation: 'memory-handshake' })
      })
      samples.push({ workers: count, rss: process.memoryUsage().rss })
    }
    console.log(
      JSON.stringify({ node: process.version, platform: process.platform, samples }, null, 2),
    )
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()))
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
