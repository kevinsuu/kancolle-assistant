const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const esbuild = require('esbuild')

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'kancolle-assistant-shell-test-'))
const outfile = path.join(temporaryDirectory, 'shell.test.cjs')

try {
  esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, '../test/index.test.js')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    alias: {
      '@kancolle-assistant/recommendation-core': path.resolve(
        __dirname,
        '../../recommendation-core/src/index.ts',
      ),
    },
    external: ['electron', 'node:*'],
    logLevel: 'silent',
  })

  const result = spawnSync(process.execPath, ['--test', outfile], {
    stdio: 'inherit',
  })
  process.exitCode = result.status ?? 1
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true })
}
