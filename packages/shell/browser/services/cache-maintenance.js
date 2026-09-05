import fs from 'fs/promises'
import path from 'path'

// Metadata stays with the proxy. Decompression never runs on its event loop.
export const createCacheMaintenance = ({ run, getCache, getDirectory, save, logger }) => {
  let tail = Promise.resolve(),
    disposed = false
  const mergeCache = (source) => {
    const operation = tail.then(async () => {
      if (disposed) throw new Error('Cache maintenance disposed')
      const startedAt = Date.now(),
        directory = getDirectory()
      let copied = 0,
        skipped = 0
      try {
        const { prefix, entries } = await run({ operation: 'zip-index', source })
        if (!entries || typeof entries !== 'object' || Array.isArray(entries))
          throw new Error('Invalid archive metadata')
        for (const [key, metadata] of Object.entries(entries)) {
          if (disposed) throw new Error('Cache maintenance disposed')
          if (directory !== getDirectory()) throw new Error('Cache directory changed during import')
          if (!metadata || typeof metadata !== 'object')
            throw new Error('Invalid cache entry metadata')
          const relative = key.replace(/^\/+/, '')
          const target = path.resolve(directory, relative)
          if (!target.startsWith(path.resolve(directory) + path.sep) || relative.includes('\\'))
            throw new Error('Invalid cache archive path')
          const previous = getCache()[key]
          const previousSignature = JSON.stringify(previous)
          let exists = true
          try {
            await fs.access(target)
          } catch (error) {
            if (error.code === 'ENOENT') exists = false
            else throw error
          }
          if (
            exists &&
            previous &&
            (new Date(previous.lastmodified) > new Date(metadata.lastmodified) ||
              (previous.length === metadata.length &&
                previous.lastmodified === metadata.lastmodified))
          ) {
            if (
              previous.length === metadata.length &&
              previous.lastmodified === metadata.lastmodified
            )
              getCache()[key] = metadata
            skipped++
            continue
          }
          const contents = await run({ operation: 'zip-entry', source, entry: prefix + relative })
          // Recheck after decompression; game downloads may have updated this entry meanwhile.
          if (disposed || directory !== getDirectory()) throw new Error('Cache import superseded')
          if (getCache()[key] !== previous) {
            skipped++
            continue
          }
          await fs.mkdir(path.dirname(target), { recursive: true })
          const realDirectory = await fs.realpath(directory),
            realParent = await fs.realpath(path.dirname(target))
          if (realParent !== realDirectory && !realParent.startsWith(realDirectory + path.sep))
            throw new Error('Cache archive path escapes through a symlink')
          const staging = await fs.mkdtemp(path.join(realParent, '.cache-merge-'))
          try {
            const staged = path.join(staging, 'entry')
            await fs.writeFile(staged, contents)
            if (disposed || directory !== getDirectory()) throw new Error('Cache import superseded')
            if (
              getCache()[key] !== previous ||
              JSON.stringify(getCache()[key]) !== previousSignature
            ) {
              skipped++
              continue
            }
            await fs.rename(staged, target)
            getCache()[key] = metadata
          } finally {
            await fs.rm(staging, { recursive: true, force: true })
          }
          copied++
        }
        logger('cache.merge-completed', {
          outcome: 'success',
          copied,
          skipped,
          entryCount: Object.keys(entries).length,
          elapsedMs: Date.now() - startedAt,
        })
        return { copied, skipped }
      } catch (error) {
        logger('cache.merge-failed', {
          outcome: 'failed',
          copied,
          skipped,
          reasonCode: 'CACHE_MERGE_FAILED',
          message: String(error.message).slice(0, 240),
          elapsedMs: Date.now() - startedAt,
        })
        throw error
      } finally {
        await save()
      }
    })
    tail = operation.catch(() => {}) // callers receive the failure; the queue remains usable.
    return operation
  }
  return {
    mergeCache,
    dispose: () => {
      disposed = true
      return tail
    },
  }
}
