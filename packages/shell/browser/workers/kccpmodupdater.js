import ProcessTracker from './processtracker'
import { onUpdateStarted, onUpdateProgress, onUpdateCompleted } from './updater-utils.js'
import { reloadKccpModCache, updateKccpMod } from '../kccacheproxy-api'
import path from 'path'

let self

class KCCPModUpdater {
  processOpts = {
    processStarted: onUpdateStarted,
    processProgress: onUpdateProgress,
    processCompleted: onUpdateCompleted,
  }
  constructor(options) {
    self = this
  }

  newProcess(name) {
    return new ProcessTracker(name, self.processOpts)
  }

  async update(config) {
    const updateProcess = self.newProcess('KCCP Mod Update')
    let modCount = 0
    try {
      if (!config.autoUpdateGitMods) return

      modCount = config.mods?.length
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
            const updateResult = await updateKccpMod(mod.path, mod.git)
            if (updateResult && global.mainWindow) {
              global.mainWindow.webContents.send('gitModUpdated', updateResult)
              reloadKccpModCache()
            }
          } catch (error) {
            ipc.error(logSource, `Failed to update Git mod ${mod.git}:`, error)
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
