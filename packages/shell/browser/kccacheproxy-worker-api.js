import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'

const GIT_BATCH_SIZE = 1000
let lastLogTime = 0
let lastPhase = ''

const logProgress = (progress) => {
  const now = Date.now()
  const shouldLog =
    progress.phase !== lastPhase || progress.loaded === progress.total || now - lastLogTime >= 1000

  if (!shouldLog) return

  if (progress.total > 0) {
    const percent = ((progress.loaded / progress.total) * 100).toFixed(2)
    console.log(`${progress.phase}: ${percent}% [${progress.loaded}/${progress.total}]`)
  } else {
    console.log(`${progress.phase}: ${progress.loaded} items processed`)
  }

  lastLogTime = now
  lastPhase = progress.phase
}

// Keep updater workers isolated from KCCacheProxy's browser-facing facade and heavy modules.
export const updateKccpMod = async (modPath, gitRemote, progressHandler) => {
  const repoPath = path.dirname(modPath)
  const cache = {}
  const result = { modPath }
  const onProgress = (progress) => {
    logProgress(progress)
    progressHandler?.(progress)
  }

  try {
    console.log(`Updating mod from ${gitRemote}...`)
    const serverRefs = await git.listServerRefs({
      fs,
      http,
      dir: repoPath,
      url: gitRemote,
      cache,
    })
    const currentOid = await git.resolveRef({
      fs,
      dir: repoPath,
      ref: 'HEAD',
      cache,
    })
    const targetOid = serverRefs[0].oid

    if (currentOid === targetOid) {
      console.log('Mod is already up to date.')
      return false
    }

    console.log(`Updating to commit ${targetOid}...`)
    await git.fetch({
      fs,
      http,
      dir: repoPath,
      url: gitRemote,
      singleBranch: true,
      ref: targetOid,
      cache,
      onProgress,
    })

    console.log('Updating files...')
    await git.checkout({
      fs,
      nonBlocking: true,
      batchSize: GIT_BATCH_SIZE,
      dir: repoPath,
      ref: targetOid,
      force: true,
      cache,
      onProgress,
    })

    result.success = true
    result.modMeta = JSON.parse(await readFile(modPath, 'utf8'))
  } catch (error) {
    console.error(`Failed to update Git mod ${gitRemote}:`, error)
    result.success = false
    result.error = error
  }

  return result
}
