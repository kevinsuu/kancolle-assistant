import { createModUpdateChecker } from './services/mod-update-checker'
import path from 'path'
import fsSync from 'fs'
import { setTimeout as delay } from 'timers/promises'
import { createProxyLifecycle } from './services/proxy-lifecycle'

export const createKccpRuntime = ({
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  kccp,
  kccpCacher,
  kccpCacheHandler,
  kccpModderUtils,
  kccpPatcher,
  installKccpMod,
  updateKccpMod,
  reloadKccpModCache,
  lifecycleOptions = {},
}) => {
  let pendingProxyConfig = null
  let kccpProxy
  const kccpStatus = { started: false, busy: false, busyActions: 0 }

  const logSource = 'kccp-integration'

  const kccpIncBusy = function (amt) {
    kccpStatus.busyActions += amt
    kccpSendStatusUpdate()
    if (!kccpStatus.busy && pendingProxyConfig) {
      const config = pendingProxyConfig
      pendingProxyConfig = null
      queueMicrotask(() => {
        void startStopKccp(config).catch((error) =>
          kccp.logger.error(logSource, 'proxy.deferred-transition-failed', {
            message: String(error.message).slice(0, 240),
          }),
        )
      })
    }
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
    const repoName = url.split('/').pop().replace('.git', '')
    const modsPath = getKccpModsPath(kccpConfig)
    const modPath = path.join(modsPath, repoName)
    // Check if mod directory already exists before attempting installation
    // if it exists, ask the user if they want to delete the old folder or cancel the installation
    if (fsSync.existsSync(modPath)) {
      const response = dialog.showMessageBoxSync({
        type: 'question',
        buttons: ['Delete and continue', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'Mod directory already exists',
        message: `A directory for this git mod already exists at ${modPath}.\n\nThis was most likely from a previous installation and can be safely removed.\nDo you want to delete the existing folder and continue with the installation?`,
      })
      if (response === 0) {
        try {
          await fsSync.promises.rm(modPath, { recursive: true, force: true })
          kccp.logger.log(logSource, `Deleted existing mod directory at ${modPath}.`)
        } catch (error) {
          kccp.logger.error(
            logSource,
            `Failed to delete existing mod directory at ${modPath}:`,
            error,
          )
          dialog.showMessageBoxSync({
            type: 'error',
            buttons: ['OK'],
            title: 'Error deleting existing mod directory',
            message: `Failed to delete existing mod directory at ${modPath}. Please check the logs for more details and try again.`,
          })
          return { success: false, error }
        }
      } else {
        kccp.logger.log(logSource, 'User cancelled mod installation due to existing mod directory.')
        return { success: false, error: new Error('User cancelled installation') }
      }
    }

    const installResult = await installKccpMod(
      modsPath,
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
      const updateResult = await updateKccpMod(mod.path, mod.git, handleProgress)
      if (updateResult.success) {
        await reloadKccpModCache()
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

  let modErrors = []
  const getKccpConfig = async function (configStore, includeManager) {
    let traceShown = false
    const deadline = Date.now() + 10_000
    while (kccpStatus.busy) {
      if (lifecycle.isDisposed() || Date.now() > deadline)
        throw new Error('KCCacheProxy configuration wait timed out')
      const busyMessage = '(getKccpConfig): KCCacheProxy is currently busy; waiting.'
      if (!traceShown) kccp.logger.trace(logSource, busyMessage)
      else kccp.logger.log(logSource, busyMessage)
      traceShown = true
      await delay(1000)
    }

    kccpIncBusy(1)
    try {
      const configManager = kccp.config
      const config = configManager.getConfig()
      const modInfo = []
      let modified = false
      let doRestart = false

      let errorCount = 0
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
          const modData = JSON.parse(await fsSync.promises.readFile(mod.path, 'utf8'))
          info.info = modData

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
            doRestart = true
          }
        } catch (error) {
          errorCount++
          kccp.logger.error(logSource, `Failed to load mod at ${mod.path}:`, error)
          // Only show the dialog for a specific mod once, to prevent spamming if there are multiple errors with the same mod
          if (!modErrors.includes(mod.path)) {
            modErrors.push(mod.path)
            dialog.showMessageBoxSync(this, {
              type: 'info',
              buttons: ['OK'],
              title: 'Mod load error',
              message: `Failed to load metadata for mod.\nlocation: ${mod.path}\nerror:${error}\n\nRecommended action: Remove and re-add the mod. If the problem persists, report to mod author.`,
            })
          }
        }

        // If we loaded all mods successfully, clear the error list so that future errors will trigger dialogs again
        // This is to prevent a scenario where a mod repeatedly triggers error dialogs
        if (errorCount === 0) modErrors = []

        modInfo.push(info)
      }

      if (modified) {
        await setKccpConfig(config)
        await reloadKccpModCache()
        if (doRestart) {
          kccp.logger.log(logSource, 'Config updates pending, restarting KCCP...')
          await startStopKccp(configStore, kccpStatus.busyActions)
        }
      }

      const result = { config, modInfo, modified }
      if (includeManager) result.configManager = configManager
      return result
    } finally {
      kccpIncBusy(-1)
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

  const lifecycle = createProxyLifecycle({
    createProxy: () => new kccp.Proxy(),
    logger: (event, data) => kccp.logger.log(logSource, event, data),
    ...lifecycleOptions,
  })
  const startStopKccp = async (configStore, expectedBusyActions = 0) => {
    if (lifecycle.isDisposed()) return
    if (kccpStatus.busyActions > expectedBusyActions) {
      pendingProxyConfig = configStore
      kccp.logger.log(logSource, 'proxy.transition-deferred', {
        busyActions: kccpStatus.busyActions,
        outcome: 'queued',
      })
      return
    }
    kccpIncBusy(1)
    try {
      await lifecycle.startStop(
        configStore.get('proxy.enable') === true &&
          configStore.get('proxy.mode') === 'kccp-internal',
      )
      kccpProxy = lifecycle.getProxy()
      kccpStatus.started = Boolean(kccpProxy?.listening())
    } finally {
      kccpIncBusy(-1)
    }
  }
  const stopKccp = async () => {
    await lifecycle.stop()
    kccpProxy = null
    kccpStatus.started = false
  }
  const kccpCheckRestart = (configStore) =>
    lifecycle.watch(async () => {
      const enabled =
        configStore.get('proxy.enable') === true &&
        configStore.get('proxy.mode') === 'kccp-internal'
      if (
        !kccpStatus.busy &&
        (lifecycle.needsRetry() || Boolean(lifecycle.getProxy()?.listening()) !== enabled)
      )
        await startStopKccp(configStore)
      void modUpdateChecker.check()
    })

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

  const modUpdateChecker = createModUpdateChecker({
    getConfig: () => kccp.config.getConfig(),
    setConfig: setKccpConfig,
    readMod: async (location, signal) =>
      JSON.parse(await fsSync.promises.readFile(location, { encoding: 'utf8', signal })),
    fetchUpdate: async (url, signal) => {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    },
    logger: (event, data) => kccp.logger.log(logSource, event, data),
  })
  const createService = (dependencies = {}) => {
    const runtime = {
      kccp: dependencies.kccp || kccp,
      cacher: dependencies.cacher || kccpCacher,
      cacheHandler: dependencies.cacheHandler || kccpCacheHandler,
      modderUtils: dependencies.modderUtils || kccpModderUtils,
      patcher: dependencies.patcher || kccpPatcher,
    }

    return Object.freeze({
      logger: runtime.kccp.logger,
      logSource: runtime.kccp.kccpLogSource,
      getStatus: getKccpStatus,
      getConfig: getKccpConfig,
      setConfig: setKccpConfig,
      init: initKccp,
      startStop: startStopKccp,
      checkRestart: kccpCheckRestart,
      stop: stopKccp,
      dispose: async () => {
        pendingProxyConfig = null
        await Promise.all([lifecycle.dispose(), modUpdateChecker.dispose()])
        kccpProxy = null
        kccpStatus.started = false
      },
      checkModUpdates: modUpdateChecker.check,
      getCachePath: getKccpCachePath,
      getKcs2CachePath: getKccpKcs2CachePath,
      getImageCachePath: getKccpImgCachePath,
      getModPath: getKccpModPath,
      proxyRequest,
      installGitMod: installKccpGitMod,
      updateGitMod: updateKccpGitMod,
      mergeCache: (...args) => runtime.cacheHandler.mergeCache(...args),
      verifyCache: (...args) => runtime.cacheHandler.verifyCache(...args),
      reloadCache: (...args) => runtime.cacher.loadCached(...args),
      extractSplit: (...args) => runtime.modderUtils.extractSplit(...args),
      makeOutlines: (...args) => runtime.modderUtils.outlines(...args),
      importExternalMod: (...args) => runtime.modderUtils.importExternalMod(...args),
      reloadModCache: (...args) => runtime.patcher.reloadModCache(...args),
      prepatch: (...args) => runtime.patcher.prepatch(...args),
      checkTrustMitmCert: (...args) => runtime.kccp.checkTrustMitmCert(...args),
    })
  }

  return createService()
}
