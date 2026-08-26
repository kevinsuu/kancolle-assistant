import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const browserRoot = path.resolve(process.cwd(), 'browser')
const browserApiModule = path.join(browserRoot, 'kccacheproxy-api.js')
const workerApiModule = path.join(browserRoot, 'kccacheproxy-worker-api.js')
const allowedModules = new Set([browserApiModule, workerApiModule])

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(?:js|ts)$/.test(entry.name) ? [target] : []
  })

test('only explicit KCCacheProxy boundary modules import upstream internals', () => {
  const violations = sourceFiles(browserRoot)
    .filter((file) => !allowedModules.has(file))
    .filter((file) => /kccacheproxy\/src\//i.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(browserRoot, file))

  assert.deepEqual(violations, [])
  assert.match(fs.readFileSync(browserApiModule, 'utf8'), /kccacheproxy\/src\/proxy\/proxy\.js/)
  const workerApiSource = fs.readFileSync(workerApiModule, 'utf8')
  assert.match(workerApiSource, /isomorphic-git/)
  assert.doesNotMatch(workerApiSource, /kccacheproxy\/src\//i)
})
