const { createHash, randomUUID } = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const createWebpackBuildGuard = ({
  projectDirectory,
  runtime = process,
  logger = (event, data) => console.info(`[Kancolle Assistant] ${event}`, data),
}) => {
  const projectId = createHash('sha256')
    .update(fs.realpathSync(projectDirectory))
    .digest('hex')
    .slice(0, 24)
  const directory = path.join(os.tmpdir(), `kancolle-webpack-${projectId}`)
  let activeOperation
  let processMarker

  const isRunning = (pid) => {
    try {
      runtime.kill(pid, 0)
      return true
    } catch (error) {
      if (error.code === 'ESRCH') return false
      if (error.code === 'EPERM') return true
      throw error
    }
  }

  const removeMarker = (marker) => {
    try {
      fs.unlinkSync(marker)
    } catch (error) {
      if (error.code === 'ENOENT') return
      logger('build.guard-cleanup-failed', { outcome: 'failed', reasonCode: error.code })
    }
  }

  const release = () => {
    if (!processMarker) return
    removeMarker(processMarker)
    processMarker = undefined
    activeOperation = undefined
    runtime.removeListener('exit', release)
  }

  const createMarker = (operation, pid) => {
    const marker = path.join(directory, `${operation}-${pid}-${randomUUID()}.lock`)
    fs.writeFileSync(marker, '', { flag: 'wx' })
    return marker
  }

  const acquire = (operation) => {
    if (activeOperation === operation) return
    const startedAt = Date.now()
    let marker
    try {
      fs.mkdirSync(directory, { recursive: true })
      // Publish before checking other owners: overlapping commands cannot both pass.
      // Unique filenames let us remove dead owners without deleting a newer owner's lock.
      marker = createMarker(operation, runtime.pid)
      const blockers = []
      let staleCount = 0
      for (const name of fs.readdirSync(directory)) {
        const match = /^(development|package)-(\d+)-[\da-f-]+\.lock$/.exec(name)
        const candidate = path.join(directory, name)
        if (!match || candidate === marker) continue
        const pid = Number(match[2])
        if (isRunning(pid)) {
          blockers.push({ operation: match[1], pid })
        } else {
          removeMarker(candidate)
          staleCount++
        }
      }
      if (blockers.length) {
        logger('build.guard-blocked', {
          operation,
          outcome: 'blocked',
          reasonCode: 'WEBPACK_BUILD_IN_USE',
          ownerCount: blockers.length,
          owners: blockers.slice(0, 5),
          elapsedMs: Date.now() - startedAt,
        })
        throw Object.assign(
          new Error(
            'Webpack bundles are in use by this checkout. Close its development app and ' +
              'Forge process, or wait for packaging to finish, then retry. ' +
              'Use a separate checkout to develop and package concurrently.',
          ),
          { code: 'WEBPACK_BUILD_IN_USE' },
        )
      }
      processMarker = marker
      activeOperation = operation
      runtime.once('exit', release)
      logger('build.guard-acquired', {
        operation,
        outcome: 'acquired',
        pid: runtime.pid,
        staleCount,
        elapsedMs: Date.now() - startedAt,
      })
    } catch (error) {
      if (marker) removeMarker(marker)
      if (error.code !== 'WEBPACK_BUILD_IN_USE') {
        logger('build.guard-failed', { operation, outcome: 'failed', reasonCode: error.code })
      }
      throw error
    }
  }

  const trackChild = (child) => {
    if (activeOperation !== 'development' || !Number.isInteger(child.pid)) return
    try {
      const marker = createMarker('development', child.pid)
      // Keep the child's marker if Forge exits first; packaging must also wait for Electron.
      child.once('exit', () => removeMarker(marker))
    } catch (error) {
      logger('build.guard-failed', {
        operation: 'development',
        phase: 'track-child',
        outcome: 'failed',
        reasonCode: error.code,
      })
      throw error
    }
  }

  return { acquire, release, trackChild }
}

module.exports = { createWebpackBuildGuard }
