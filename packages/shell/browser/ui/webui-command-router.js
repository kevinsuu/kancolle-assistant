export const createWebUiCommandRouter = ({
  app,
  appDataDir,
  appDir,
  browser,
  configStore,
  dialog,
  fs,
  getKc3ExtensionId,
  hideHome,
  homeDataLocation,
  isMatch,
  kccpService,
  logger,
  logSource,
  nativeTheme,
  path,
  rootDir,
  settingsUrl,
  shell,
}) =>
  async function routeWebUiCommand(_event, meta, data) {
    let result
    let kccpConfig, cachePath, source, target
    switch (meta.type) {
      case 'get-damecon-info':
        result = {
          version: `${app.getName()} v${app.getVersion()}`,
          paths: {
            home: homeDataLocation,
            app: appDir,
            appData: appDataDir,
          },
          kccpStatus: kccpService.getStatus(),
        }
        break
      case 'get-damecon-version':
        result = `${app.getName()} v${app.getVersion()}`
        break
      case 'get-config-item':
        result = configStore.get(data.key)
        break
      case 'get-config':
        result = configStore.all
        break
      case 'set-config-item':
        result = configStore.set(data.key, data.value)
        if (data.key.startsWith('proxy.')) {
          if (
            ((data.key == 'proxy.enable' &&
              data.value == true &&
              configStore.get('proxy.mode') == 'kccp-internal') ||
              (data.key == 'proxy.mode' &&
                data.value == 'kccp-internal' &&
                configStore.get('proxy.enable') == true)) &&
            (await kccpService.getConfig(configStore))?.config?.autoUpdateGitMods
          ) {
            await browser.updateKccpMods()
          } else {
            await kccpService.startStop(configStore)
            await browser.applyProxy()
          }
        } else if (data.key == 'kc3kai.update.channel') {
          const kc3ExtensionId = getKc3ExtensionId()
          if (kc3ExtensionId) browser.session.removeExtension(kc3ExtensionId)
          await browser.updateKc3IfScheduled()
        } else if (data.key === 'window.style.brightness') {
          nativeTheme.themeSource = data.value
        } else if (data.key.startsWith('kc3kai.custom')) {
          const kc3Path = browser.getKc3Path()
          await browser.checkStartKc3(kc3Path)
        } else if (data.key == 'kancolle.forceCookieHack' && data.value == true) {
          browser.applyCookieHack()
        }
        browser.sendToAllWindows('config-saved', configStore.all)
        break
      case 'get-should-hide-addressbar':
        if (data.url === settingsUrl) {
          result = true
        } else {
          const sites = configStore
            .get('window.view.hideAddressBarSites')
            .map((site) =>
              site.replace('{{kc3-extension}}', `chrome-extension://${getKc3ExtensionId()}`),
            )
          result = isMatch(data.url, sites)
        }
        break
      case 'clear-cache':
        await browser.session.clearCache()
        if (configStore.get('proxy.enable') && configStore.get('proxy.mode') === 'kccp-internal') {
          const kccpCfg = await kccpService.getConfig(configStore)
          const cachePath = kccpService.getCachePath(kccpCfg.config)
          const mainjsPath = path.join(cachePath, 'kcs2', 'js', 'main.js')
          if (fs.existsSync(mainjsPath)) {
            logger.log(logSource, 'Deleting main.js from internal KCCacheProxy cache.')
            try {
              fs.rmSync(mainjsPath)
            } catch (error) {
              logger.error(logSource, 'Failed to delete main.js from', hideHome(mainjsPath))
              logger.error(logSource, error)
            }
          }
        }
        logger.log(logSource, 'Cache cleared.')
        break
      case 'start-find-in-page':
        browser.startFindInPage(data.tabId, data.searchInput)
        break
      case 'close-find-in-page':
        browser.setFindInPageVisible(data.tabId, false)
        break
      case 'kc3-doupdate':
        await browser.updateKc3(configStore.get('kc3kai.update.channel'))
        break
      case 'kccp-modder-doupdate':
        await browser.updateKccpMods()
        break
      case 'kc3-get-isupdating':
        result = { isUpdating: browser.kc3IsUpdating, channel: browser.kc3UpdatingChannel }
        break
      case 'kccp-modder-get-isupdating':
        result = { isUpdating: browser.kccpModderIsUpdating }
        break
      case 'kc3-select-custom-location':
      case 'select-custom-data-location':
      case 'select-custom-kccp-location': {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          properties: ['openDirectory'],
        })
        result = { canceled, filePaths }
        break
      }
      case 'webui-init-complete': {
        const initWin = browser.windows.find((window) => window.window.id === meta.windowId)
        initWin.resolveReady()
        break
      }
      case 'webui-zoom-changed': {
        const zoomWin = browser.windows.find((window) => window.window.id === meta.windowId)
        zoomWin?.tabs.updateLayout(data.height)
        break
      }
      case 'webui-display-mode-changed': {
        const modeWin = browser.windows.find((window) => window.window.id === meta.windowId)
        modeWin?.tabs.updateLayout(data.height)
        break
      }
      case 'webui-close-tab':
        browser.confirmCloseTab(data.tabId)
        break
      case 'kccp-get-status':
        result = kccpService.getStatus()
        break
      case 'kccp-get-config':
        result = await kccpService.getConfig(configStore)
        break
      case 'kccp-save-config': {
        const newConfig = data
        await kccpService.setConfig(newConfig)
        if (configStore.get('proxy.enable') && newConfig.autoUpdateGitMods) {
          await browser.updateKccpMods()
        } else {
          await kccpService.startStop(configStore)
          await browser.applyProxy()
        }
        break
      }
      case 'kccp-import-cache': {
        let location = 'unknown'
        try {
          if (data?.builtIn) {
            location = path.join(rootDir, 'resources/minimum-cache.zip')
            await kccpService.mergeCache(location)
          } else {
            const response = await dialog.showOpenDialog({
              title: 'Select cache dump .zip file',
              filters: [{ name: '.zip files', extensions: ['zip'] }],
              properties: ['openFile'],
            })
            if (!response.canceled) {
              location = response.filePaths[0]
              await kccpService.mergeCache(location)
            }
          }
        } catch (error) {
          logger.error(logSource, "Couldn't load cache dump.", error)
        }
        break
      }
      case 'kccp-verify-cache': {
        const verifyResponse = dialog.showMessageBoxSync({
          type: 'question',
          title: 'Delete invalid files?',
          buttons: ['Cancel', 'Delete', 'Keep'],
          message: 'Delete invalid files?',
          detail:
            'Cached files created in an old version might count as invalid and will be deleted.',
          defaultId: 0,
          cancelId: 1,
        })
        if (verifyResponse === 0) return
        await kccpService.verifyCache(verifyResponse === 1)
        break
      }
      case 'kccp-extract-spritesheet':
        kccpConfig = await kccpService.getConfig(configStore)
        cachePath = kccpService.getKcs2CachePath(kccpConfig.config)
        source = await dialog.showOpenDialog({
          title: 'Select a spritesheet',
          defaultPath: cachePath,
          filters: [{ name: 'Spritesheet image', extensions: ['png'] }],
          properties: ['openFile'],
        })
        if (source.canceled) return
        target = await dialog.showOpenDialog({
          title: 'Select a folder to extract to',
          defaultPath: kccpService.getModPath(kccpConfig.config),
          properties: ['openDirectory'],
        })
        if (target.canceled) return
        await kccpService.extractSplit(source.filePaths[0], target.filePaths[0])
        break
      case 'kccp-make-outlines':
        kccpConfig = await kccpService.getConfig(configStore)
        cachePath = kccpService.getKcs2CachePath(kccpConfig.config)
        source = await dialog.showOpenDialog({
          title: 'Select a spritesheet',
          defaultPath: cachePath,
          filters: [{ name: 'Spritesheet image', extensions: ['png'] }],
          properties: ['openFile'],
        })
        if (source.canceled) return
        target = await dialog.showSaveDialog({
          title: 'Select a location to save outlines to',
          defaultPath: kccpService.getModPath(kccpConfig.config),
          filters: [{ name: 'Images', extensions: ['png'] }],
        })
        if (target.canceled) return
        await kccpService.makeOutlines(source.filePaths[0], target.filePath)
        break
      case 'kccp-convert-poi':
        kccpConfig = await kccpService.getConfig(configStore)
        source = await dialog.showOpenDialog({
          title: 'Select cache folder to import from',
          defaultPath: browser.getModPath(kccpConfig.config),
          properties: ['openDirectory'],
        })
        if (source.canceled) return
        target = await dialog.showOpenDialog({
          title: 'Select a folder to export to',
          defaultPath: browser.getModPath(kccpConfig.config),
          properties: ['openDirectory'],
        })
        if (target.canceled) return
        await kccpService.importExternalMod(source.filePaths[0], target.filePaths[0])
        break
      case 'kccp-add-mod': {
        kccpConfig = await kccpService.getConfig(configStore)
        const addModResponse = await dialog.showOpenDialog({
          title: 'Select a mod metadata file',
          filters: [
            {
              name: 'Mod metadata',
              defaultPath: kccpService.getModPath(kccpConfig.config),
              extensions: ['mod.json'],
            },
          ],
          properties: ['openFile'],
        })
        if (addModResponse.canceled) return
        if (kccpConfig.config.mods.map((mod) => mod.path).includes(addModResponse.filePaths[0])) {
          logger.error(logSource, 'Mod already added')
          return
        }
        kccpConfig.config.mods.push({ path: addModResponse.filePaths[0] })
        await kccpService.setConfig(kccpConfig.config)
        await browser.applyProxy()
        break
      }
      case 'kccp-add-git-mod': {
        const { url } = data
        if (!url) return
        logger.log(logSource, 'Adding KCCP git mod')
        await kccpService.installGitMod(configStore, url)
        break
      }
      case 'kccp-update-git-mod': {
        const modToUpdate = data.mod
        if (!path) return
        logger.log(logSource, 'Updating KCCP git mod', modToUpdate.path)
        await kccpService.updateGitMod(modToUpdate)
        await kccpService.startStop(configStore)
        break
      }
      case 'kccp-open-mod-folder': {
        const modToOpen = data.mod
        kccpConfig = await kccpService.getConfig(configStore)
        const modPath = browser.getModPath(kccpConfig.config)
        if (modPath) shell.openPath(modPath)
        void modToOpen
        break
      }
      case 'kccp-log-get-recent':
        logger.sendRecent()
        break
      case 'kccp-reload-mods':
        await kccpService.reloadModCache()
        break
      case 'kccp-reload-cache':
        kccpService.reloadCache()
        break
      case 'kccp-prepatch':
        await kccpService.prepatch()
        break
      case 'kccp-check-mitm-cert':
        await kccpService.checkTrustMitmCert()
        break
    }
    return result
  }
