import path from 'path'
import fsSync from 'fs'
import {
  app,
  session,
  BrowserWindow,
  Notification,
  globalShortcut,
  ipcMain,
  nativeTheme,
  dialog,
} from 'electron'
import { setTimeout } from 'timers/promises'

// KCCP
const kccp = require('../../kccacheproxy/src/proxy/proxy.js')
const kccpCacher = require('../../kccacheproxy/src/proxy/cacher.js')
const kccpCacheHandler = require('../../kccacheproxy/src/proxy/cacheHandler.js')
const kccpModderUtils = require('../../kccacheproxy/src/proxy/mod/modderUtils.js')
const kccpPatcher = require('../../kccacheproxy/src/proxy/mod/patcher.js')
const {
  updateMod,
  handleModInstallation,
} = require('../../kccacheproxy/src/proxy/mod/gitModHandler.js')

let kccpProxy
const kccpStatus = { started: false, busy: false, busyActions: 0 }

const logSource = 'kccp-integration'

const kccpIncBusy = function (amt) {
  kccpStatus.busyActions += amt
}

const kccpSendStatusUpdate = function () {
  kccpStatus.busy = kccpStatus.busyActions > 0
  try {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach((w) =>
      w.webContents.send('webui-message', {
        type: 'kccp-status',
        meta: { windowId: w.id },
        data: kccpStatus,
      }),
    )
  } catch (error) {
    kccp.logger.error(logSource, "Couldn't send KCCacheProxy status update to window.")
  }
}

function handleProgress(progress) {
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((w) =>
    w.webContents.send('webui-message', {
      type: 'kccp-git-mod-progress',
      meta: { windowId: w.id },
      data: progress,
    }),
  )
}

async function installKccpGitMod(configStore, url) {
  const kccpConfig = await getKccpConfig(configStore, true)
  const installResult = await handleModInstallation(
    getKccpModsPath(kccpConfig),
    url,
    kccpConfig.config,
    kccpConfig.configManager,
    handleProgress,
  )
  const windows = BrowserWindow.getAllWindows()
  windows.forEach((w) =>
    w.webContents.send('webui-message', {
      type: 'kccp-git-mod-installed',
      meta: { windowId: w.id },
      data: installResult,
    }),
  )
  // force finalization
  await getKccpConfig(configStore)

  await startStopKccp(configStore)
  return installResult
}

const updateKccpGitMod = async function (mod) {
  try {
    const updateResult = await updateMod(mod.path, mod.git, handleProgress)
    if (updateResult.success) {
      await kccpPatcher.reloadModCache()
      const windows = BrowserWindow.getAllWindows()
      windows.forEach((w) =>
        w.webContents.send('webui-message', {
          type: 'kccp-git-mod-updated',
          meta: { windowId: w.id },
          data: updateResult,
        }),
      )
      kccpSendStatusUpdate()
    }
  } catch (error) {
    kccp.logger.error(logSource, `Failed to update Git mod ${mod.git}:`, error)
  }
}

const getKccpConfig = async function (configStore, includeManager) {
  let traceShown = false
  while (kccpStatus.busy) {
    kccp.logger.log(logSource, '(getKccpConfig): KCCacheProxy is currently busy; waiting.')
    if (!traceShown) kccp.logger.trace(logSource, 'startStopKccp')
    traceShown = true
    await setTimeout(1000)
  }

  kccpIncBusy(1)
  kccpSendStatusUpdate()
  try {
    const configManager = kccp.config
    const config = configManager.getConfig()
    const modInfo = []
    let modified = false

    // check mods
    for (const mod of config.mods) {
      const path = mod.path
      const exists = fsSync.existsSync(path)
      const info = {}
      Object.assign(info, mod)
      info.exists = exists

      if (!exists) {
        dialog.showMessageBoxSync(this, {
          type: 'info',
          buttons: ['OK'],
          title: 'Mod not found',
          message: `Couldn't find a KCCP mod in this location.\nlocation: ${mod.path}`,
        })
        continue
      }

      try {
        const modData = JSON.parse(fsSync.readFileSync(mod.path))
        info.info = modData
        if (modData.updateUrl) {
          if (mod.lastCheck == undefined || mod.lastCheck < Date.now() - 3 * 60 * 60 * 1000) {
            try {
              mod.lastCheck = Date.now()
              kccp.logger.log(logSource, `Checking for update for KCCP mod ${modData.name}`)
              const response = await fetch(modData.updateUrl)
              const updateJson = await response.json()
              //const oldVersion = mod.latestVersion
              mod.latestVersion = updateJson.version
              mod.url = updateJson.downloadUrl || updateJson.url || updateJson.updateUrl

              modified = true
            } catch (error) {
              kccp.logger.error(
                logSource,
                `failed to check for updates for KCCP mod ${mod.name} at ${mod.updateUrl}`,
              )
            }
          }
        }

        if (modData.requireScripts && !mod.allowScripts) {
          const message = `The mod '${modData.name}' (${mod.path}) requires scripts to be enabled. Do you trust this mod?`
          const resp = dialog.showMessageBoxSync(this, {
            type: 'question',
            buttons: ['Yes', 'No'],
            title: 'Mod Scripts',
            message,
          })
          if (resp == 1) {
            const ind = config.mods.indexOf(mod)
            config.mods.splice(ind, 1)
            continue
          }
          mod.allowScripts = true
          modified = true
        }
      } catch (error) {
        dialog.showMessageBoxSync(this, {
          type: 'info',
          buttons: ['OK'],
          title: 'Mod load error',
          message: `Failed to load metadata for mod.\nlocation: ${mod.path}\nerror:${error}`,
        })
      }

      modInfo.push(info)
    }

    if (modified) {
      await setKccpConfig(config)
      await kccpPatcher.reloadModCache()
      await startStopKccp(configStore, kccpStatus.busyActions)
    }

    const result = { config, modInfo, modified }
    if (includeManager) result.configManager = configManager
    return result
  } finally {
    kccpIncBusy(-1)
    kccpSendStatusUpdate()
  }
}

const setKccpConfig = async function (kccpConfig) {
  await kccp.config.setConfig(kccpConfig, true)
  const windows = BrowserWindow.getAllWindows()
  if (windows.length == 0) {
    kccp.logger.log(logSource, 'No windows to report to.')
    return
  }
  windows.forEach((w) =>
    w.webContents.send('webui-message', {
      type: 'kccp-config-saved',
      meta: { windowId: w.id },
      data: { config: kccpConfig },
    }),
  )
}

var kccpInitialized = false
const initKccp = function () {
  if (!kccpInitialized) {
    kccpInitialized = true
    kccp.logger.registerElectron(ipcMain, app)
    kccp.config.loadConfig(app)
  }
}

const startStopKccp = async function (configStore, expectedBusyActions = 0) {
  const enabled = configStore.get('proxy.enable')
  const mode = configStore.get('proxy.mode')
  let traceShown = false
  while (kccpStatus.busyActions > expectedBusyActions) {
    kccp.logger.log(logSource, '(startStopKccp): KCCacheProxy is currently busy; waiting.')
    //if (!traceShown)
    //kccp.logger.trace(logSource, 'startStopKccp')
    traceShown = true
    await setTimeout(1000)
  }
  kccpIncBusy(1)
  kccpStatus.started = false
  kccpSendStatusUpdate()
  try {
    if (enabled !== true || mode !== 'kccp-internal') {
      stopKccp()
      return
    }

    kccp.logger.log(logSource, `${kccpProxy ? 'Res' : 'S'}tarting KCCacheProxy`)

    if (kccpProxy) {
      kccpProxy.close()
      kccp.logger.log(logSource, 'Waiting for KCCacheProxy to stop listening.')
      while (kccpProxy.server.listening) {
        await setTimeout(10)
      }
      kccp.logger.log(logSource, 'KCCacheProxy has stopped listening.')
    }

    kccpProxy = new kccp.Proxy()
    await kccpProxy.init()
    await kccpProxy.start()
    kccp.logger.log(logSource, 'Waiting for KCCacheProxy to start listening.')
    while (!kccpProxy.server.listening) {
      await setTimeout(10)
    }
    kccp.logger.log(logSource, 'KCCacheProxy is now listening.')
  } catch (error) {
    kccp.logger.error(logSource, `Error occurred starting KCCacheProxy.`, error)
    stopKccp()
  } finally {
    kccpIncBusy(-1)
    kccpStatus.started = true
    kccpSendStatusUpdate()
  }
}

const stopKccp = function () {
  if (kccpProxy) {
    kccp.logger.log(logSource, 'Shutting down KCCacheProxy.')
    kccpProxy?.close()
    kccpProxy = undefined
  }
}

function getKccpRootPath(kccpConfig) {
  return path.join(app.getPath('userData'), 'ProxyData')
}

function getKccpCachePath(kccpConfig) {
  let cachePath = kccpConfig.cacheLocation
  if (
    !kccpConfig.cacheLocation ||
    kccpConfig.cacheLocation == undefined ||
    kccpConfig.cacheLocation == 'default'
  )
    cachePath = path.join(getKccpRootPath(kccpConfig), 'cache')
  return cachePath
}

function getKccpModsPath(kccpConfig) {
  return path.join(getKccpRootPath(kccpConfig), 'mods')
}

function getKccpKcs2CachePath(kccpConfig) {
  let cachePath = getKccpCachePath(kccpConfig)
  cachePath = path.join(cachePath, 'kcs2')
  return cachePath
}

function getKccpImgCachePath(kccpConfig) {
  let cachePath = getKccpKcs2CachePath(kccpConfig)
  cachePath = path.join(cachePath, 'img')
  return cachePath
}

function getKccpModPath(kccpConfig) {
  return kccpConfig.mods.length > 0
    ? path.join(kccpConfig.mods[kccpConfig.mods.length - 1].path, '..')
    : undefined
}

function getKccpStatus() {
  return kccpStatus
}

async function proxyRequest(req, callback) {
  return await kccpProxy.proxyRequest(req, callback)
}

export {
  getKccpStatus,
  kccpSendStatusUpdate,
  getKccpConfig,
  setKccpConfig,
  initKccp,
  startStopKccp,
  stopKccp,
  getKccpCachePath,
  getKccpKcs2CachePath,
  getKccpImgCachePath,
  getKccpModPath,
  proxyRequest,
  installKccpGitMod,
  updateKccpGitMod,
}
