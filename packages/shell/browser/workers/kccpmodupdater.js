import ProcessTracker from './processtracker'
import { onUpdateStarted, onUpdateProgress, onUpdateCompleted } from './updater-utils.js'
import { updateKccpMod } from '../kccacheproxy-worker-api'
import path from 'path'

class KCCPModUpdater {
  processOpts = {
    processStarted: onUpdateStarted,
    processProgress: onUpdateProgress,
    processCompleted: onUpdateCompleted,
  }
  newProcess(name) {
    return new ProcessTracker(name, this.processOpts)
  }

  async update(config) {
    const updateProcess = this.newProcess('KCCP Mod Update')
    let modCount = 0
    try {
      if (!config.autoUpdateGitMods) return

      modCount = config.mods?.length ?? 0
      if (modCount == 0) return

      for (let i = 0; i < modCount; i++) {
        const mod = config.mods[i]
        updateProcess.progress({
          phase: `Updating ${path.basename(mod.path)}`,
          loaded: i,
          total: modCount,
        })
        if (mod.git) {
          try {
            await updateKccpMod(mod.path, mod.git)
          } catch (error) {
            console.error(`Failed to update Git mod ${mod.git}:`, error)
          }
        }
      }
    } finally {
      updateProcess.progress({
        phase: `Finished checking for mod updates`,
        loaded: modCount,
        total: modCount,
      })
      updateProcess.complete()
    }
  }
}

export default KCCPModUpdater
