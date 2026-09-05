import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createCacheMaintenance } from '../browser/services/cache-maintenance'

test('cache imports preserve newer local data, persist metadata and diagnose failures', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-import-test-'))
  const cached = {},
    logs = []
  let saves = 0
  const maintenance = createCacheMaintenance({
    getCache: () => cached,
    getDirectory: () => directory,
    save: async () => {
      saves++
    },
    logger: (event, data) => logs.push({ event, data }),
    run: async ({ operation, source }) => {
      if (operation === 'zip-index')
        return {
          prefix: '',
          entries:
            source === 'bad'
              ? { '/../outside': {} }
              : { '/kcs2/file': { length: 3, lastmodified: '2026-01-01' } },
        }
      return Buffer.from('abc')
    },
  })
  try {
    assert.deepEqual(await maintenance.mergeCache('good'), { copied: 1, skipped: 0 })
    assert.equal(await fs.readFile(path.join(directory, 'kcs2/file'), 'utf8'), 'abc')
    cached['/kcs2/file'] = { length: 3, lastmodified: '2026-02-01' }
    assert.deepEqual(await maintenance.mergeCache('good'), { copied: 0, skipped: 1 })
    await assert.rejects(maintenance.mergeCache('bad'), /Invalid cache archive path/)
    assert.ok(logs.some((log) => log.event === 'cache.merge-completed' && log.data.copied === 1))
    assert.ok(
      logs.some(
        (log) => log.event === 'cache.merge-failed' && log.data.reasonCode === 'CACHE_MERGE_FAILED',
      ),
    )
    assert.equal(saves, 3)
  } finally {
    await maintenance.dispose()
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('an entry updated during decompression is preserved and staging is cleaned', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cache-race-test-'))
  const cached = { '/file': { length: 3, lastmodified: '2025-01-01' } }
  await fs.writeFile(path.join(directory, 'file'), 'new')
  const maintenance = createCacheMaintenance({
    getCache: () => cached,
    getDirectory: () => directory,
    save: async () => {},
    logger: () => {},
    run: async ({ operation }) => {
      if (operation === 'zip-index')
        return { prefix: '', entries: { '/file': { length: 3, lastmodified: '2026-01-01' } } }
      cached['/file'].lastmodified = '2027-01-01'
      return Buffer.from('old')
    },
  })
  try {
    assert.deepEqual(await maintenance.mergeCache('fixture'), { copied: 0, skipped: 1 })
    assert.equal(await fs.readFile(path.join(directory, 'file'), 'utf8'), 'new')
    assert.deepEqual(await fs.readdir(directory), ['file'])
  } finally {
    await maintenance.dispose()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
