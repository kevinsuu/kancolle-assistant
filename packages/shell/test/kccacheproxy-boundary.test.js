import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const browserRoot = path.resolve(process.cwd(), 'browser')
const allowedModule = path.join(browserRoot, 'kccacheproxy-api.js')

const sourceFiles = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return /\.(?:js|ts)$/.test(entry.name) ? [target] : []
  })

test('only kccacheproxy-api imports KCCacheProxy internals', () => {
  const violations = sourceFiles(browserRoot)
    .filter((file) => file !== allowedModule)
    .filter((file) => /kccacheproxy\/src\//i.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(browserRoot, file))

  assert.deepEqual(violations, [])
  assert.match(fs.readFileSync(allowedModule, 'utf8'), /kccacheproxy\/src\/proxy\/proxy\.js/)
})
