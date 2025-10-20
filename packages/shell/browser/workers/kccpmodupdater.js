import ProcessTracker from './processtracker'
import { onUpdateStarted, onUpdateProgress, onUpdateCompleted } from './updater-utils.js'
import { updateMod } from '../../../kccacheproxy/src/proxy/mod/gitModHandler'
import { reloadModCache } from '../../../kccacheproxy/src/proxy/mod/patcher'
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
    if (!config.autoUpdateGitMods) return

    let modCount = config.mods.length
    if (modCount == 0) return

    const updateProcess = self.newProcess('KCCP Mod Update')
    try {
      for (let i = 0; i < modCount; i++) {
        const mod = config.mods[i]
        updateProcess.progress({
          phase: `Updating ${path.basename(mod.path)}`,
          loaded: i,
          total: modCount,
        })
        if (mod.git) {
          try {
            const updateResult = await updateMod(mod.path, mod.git)
            if (updateResult && global.mainWindow) {
              global.mainWindow.webContents.send('gitModUpdated', updateResult)
              reloadModCache()
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
