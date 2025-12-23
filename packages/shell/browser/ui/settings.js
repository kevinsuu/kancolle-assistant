scrollTop = function (selector, force = false) {
  var el = document.querySelector(selector)

  // the scroll bar is all the way down, so we know they want to follow the text
  if (
    el &&
    el.scrollTop !== undefined &&
    (force || el.scrollTop == el.scrollHeight - el.clientHeight)
  ) {
    // have to push our code outside of this thread since the text hasn't updated yet
    setTimeout(function () {
      el.scrollTop = el.scrollHeight - el.clientHeight
    }, 0)
  }
}

ko.extenders.scrollFollow = function (target, selector) {
  target.subscribe(function (newval) {
    scrollTop(selector)
  })
  return target
}

class Settings {
  theme = ko.observable('andra')
  brightness = ko.observable('system')

  configPages = [
    {
      id: 0,
      name: 'Damecon',
      img: 'assets/icons/damecon_icon_48.png',
    },
    {
      id: 1,
      name: 'KC3Kai',
      img: 'assets/icons/kc3kai.png',
    },
    {
      id: 2,
      name: 'Proxy',
      img: 'assets/icons/kccp.png',
      //faIcon: 'fa-solid fa-circle-nodes'
    },
    {
      id: 3,
      name: 'Downloads',
      img: 'assets/icons/download_icon_48.png',
      //faIcon: 'fa-solid fa-download',
    },
  ]

  config = {}
  kccpConfig = {
    current: ko.observable(),
    modInfo: ko.observable(),
  }

  addingKccpGitMod = ko.observable(false)
  kccpGitModUrl = ko.observable('')
  kccpModsOutOfDate = ko.pureComputed(() => {
    return this.kccpConfig
      .modInfo()
      .filter((m) => m.latestVersion && m.latestVersion != m.info.version).length
  })

  kccpStatus = ko.observable({ busy: false, started: false })
  kccpTabs = { config: 0, mods: 1, log: 2 }
  kccpTab = ko.observable(0)
  appTab = ko.observable(0)
  // TODO: Don't reference UI stuff in VM
  kccpLogRecent = ko.observableArray([]).extend({ scrollFollow: '#kccp-log-scroller' })

  appLogRecent = ko.observableArray([]).extend({ scrollFollow: '#app-log-scroller' })

  logTypes = ['log', 'error']
  badgeClasses = {
    log: 'info',
    trace: 'warning',
    error: 'danger',
  }

  version = ''

  logMaxLength = 50

  selectedConfigPage = ko.observable(0)

  // This sets up the mappings between knockout properties and config keys.
  settingsInitialized = ko.observable(false)

  processes = ko.observableArray([])

  newHideAddressBarSite = ko.observable('')
  canAddNewHideAddressBarSite = ko.computed(
    () =>
      !!this.newHideAddressBarSite() &&
      (!this.config.window.view.hideAddressBarSites() ||
        !this.config.window.view.hideAddressBarSites().includes(this.newHideAddressBarSite())),
    this,
  )

  kc3IsUpdating = ko.observable(false)
  kc3UpdatingChannel = ko.observable('')
  canSetKc3Channel = ko.computed(() => !this.kc3IsUpdating(), this)
  canUpdateKc3 = ko.observable(true)

  kccpModderIsUpdating = ko.observable(false)
  canUpdateKccpMods = ko.observable(false)

  downloads = ko.observableArray([])

  /*async sendMessage(type, data) {
    return await ipc.send('webui-message', { type, data })
  }*/

  async prepKccpConfig(config) {
    const current = config || (await kccpConfigStore.all())
    this.kccpConfig.current(current.config)
    this.kccpConfig.modInfo(current.modInfo)
    this.prepKccpConfigItems()
  }

  prepKccpConfigItems() {
    const keys = [
      'hostname',
      'port',
      'httpsPort',
      'mode',
      'cacheLocation',
      'disableBrowserCache',
      'verifyCache',
      'bypassGadgetUpdateCheck',
      'enableModder',
      'autoUpdateGitMods',
    ]
    const cfg = this.kccpConfig
    this.convertPropertiesToObservables(cfg.current(), {
      viewModel: cfg,
      keys,
    })
    for (const key of keys) {
      if (cfg[key].getSubscriptionsCount() === 0) {
        cfg[key].subscribe(async (newValue) => {
          cfg.current()[key] = newValue
          await kccpConfigStore.save(cfg.current())
        })
      }
    }
    if (!cfg.initialized) {
      cfg.useCacheLocation = ko.observable(cfg.cacheLocation() !== 'default')
      cfg.useCacheLocation.subscribe((newValue) => {
        if (!newValue) cfg.cacheLocation('default')
      })
      cfg.initialized = true
    }
  }

  async clearSessionCache() {
    await sendToMain('clear-cache')
  }

  kccpOpenLog() {
    this.kccpTab(this.kccpTabs.log)
  }
  async kccpImportBasicCacheDump() {
    this.kccpOpenLog()
    await sendToMain('kccp-import-cache', { builtIn: true })
  }
  async kccpImportCacheDump() {
    this.kccpOpenLog()
    await sendToMain('kccp-import-cache', { builtIn: false })
  }
  async kccpReloadCache() {
    this.kccpOpenLog()
    await sendToMain('kccp-reload-cache')
  }
  async kccpVerifyCache() {
    this.kccpOpenLog()
    await sendToMain('kccp-verify-cache')
  }
  async kccpPrepatchAssets() {
    this.kccpOpenLog()
    await sendToMain('kccp-prepatch')
  }
  async kccpExtractSpritesheet() {
    await sendToMain('kccp-extract-spritesheet')
  }
  async kccpMakeOutlines() {
    await sendToMain('kccp-make-outlines')
  }
  async kccpConvertFromPoi() {
    await sendToMain('kccp-convert-poi')
  }

  kccpBeginAddGitMod() {
    this.kccpGitModUrl('')
    this.addingKccpGitMod(true)
  }
  kccpCancelAddGitMod() {
    this.addingKccpGitMod(false)
  }
  async kccpAddGitMod() {
    const url = this.kccpGitModUrl()
    this.addingKccpGitMod(false)
    console.log('Adding git mod ' + url)
    await sendToMain('kccp-add-git-mod', { url })
  }
  async kccpUpdateGitMod(mod) {
    console.log('Updating git mod ' + mod.path)
    await sendToMain('kccp-update-git-mod', { mod })
  }
  async kccpAddMod() {
    await sendToMain('kccp-add-mod')
  }
  async kccpReloadMods() {
    await sendToMain('kccp-reload-mods')
  }
  async kccpRemoveMod(path) {
    const cfg = this.kccpConfig.current()
    const ind = cfg.mods.findIndex((m) => m.path == path)
    cfg.mods.splice(ind, 1)
    await kccpConfigStore.save(cfg)
  }
  async kccpMoveMod(path, dir) {
    const cfg = this.kccpConfig.current()
    const ind = cfg.mods.findIndex((m) => m.path == path)
    const mod = cfg.mods.find((m) => m.path == path)
    const newIdx = ind + dir
    if (newIdx < 0 || newIdx >= cfg.mods.length) {
      console.error('Tried to move a mod out of range.')
      return
    }
    cfg.mods.splice(ind, 1)
    cfg.mods.splice(ind + dir, 0, mod)
    await kccpConfigStore.save(cfg)
  }

  convertPropertiesToObservables(baseObj, opts) {
    const newObj = opts?.viewModel ?? {}
    for (const key of opts?.keys ?? Object.keys(baseObj)) {
      const isFunc = typeof newObj[key] === 'function'
      if (Array.isArray(baseObj[key])) {
        const newArr = baseObj[key].map((p) => ko.observable(p))
        if (isFunc) newObj[key](newArr)
        else newObj[key] = ko.observableArray(newArr)
      } else {
        if (isFunc) newObj[key](baseObj[key])
        else newObj[key] = ko.observable(baseObj[key])
      }
      if (opts?.subscribeCallback) {
        newObj[key].subscribe(opts.subscribeCallback)
      }
    }
    return newObj
  }

  selectConfigPage(item) {
    this.selectedConfigPage(item.id)
  }

  async tryInvoke(asyncCallback, name) {
    let result
    let tries = 5
    let error
    while (!result && tries-- > 0) {
      try {
        console.log(`>> invoking ${name ?? 'action'}...`)
        result = await asyncCallback()
        console.log(`>> received`, result)
        return result
      } catch (err) {
        error = err

        console.error(
          ` >> got error while invoking ${name ?? 'action'}. ${tries > 0 ? 'retrying...' : 'giving up.'}`,
          err,
        )
      }
    }
    throw error
  }

  // loads values from the current config into ko properties
  async prepConfigProperties(newConfig) {
    if (!newConfig) newConfig = await configStore.all()
    if (!newConfig) throw new Error('Error occurred fetching config.')
    configApplySync(this.config, {
      propertyCallback: this.prepConfigProperty.bind(this),
      source: newConfig,
    })

    this.theme(this.config.window.style.theme())
    this.config.window.style.theme.subscribe((newValue) => this.theme(newValue))
    this.brightness(this.config.window.style.brightness())
    this.config.window.style.brightness.subscribe((newValue) => this.brightness(newValue))
    return this.config
  }

  setArrayItemSubscriber(observable, path) {
    observable.subscribe(async (changes) => {
      let newValue = access(this.config, path)().map(getMaybeObsValue)
      await configStore.set(path, newValue)
    })
  }

  prepConfigProperty(path, key, keySchema, target, source) {
    // do we operate on the current object or pull from the new source
    const currentSource = source || target

    // convert to observable
    //const itemsKey = `${key}_items`
    let schema = keySchema

    // capture the raw value
    let value = currentSource[key]
    if (typeof value === 'function') value = value()

    // set up array contents as observables
    if (schema.type === 'array') {
      if (!Array.isArray(value)) value = []
      for (let i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'function') {
          value[i] = ko.observable(value[i])
          this.setArrayItemSubscriber(value[i], path)
        }
      }
    }

    // set up observable if it's not already set
    if (typeof target[key] !== 'function') {
      target[key] = schema.type === 'array' ? ko.observableArray(value) : ko.observable(value)
    }

    if (target[key].getSubscriptionsCount() === 0) {
      const subscriptionType = schema.type === 'array' ? 'arrayChange' : undefined
      target[key].subscribe(
        async (changes) => {
          if (!this.settingsInitialized()) return
          let newValue = access(this.config, path)()
          if (schema.type === 'array') newValue = newValue.map(getMaybeObsValue)
          const oldValue = await configStore.get(path)
          let changed = false

          console.log('>> checking: ', key)

          if (Array.isArray(newValue)) changed = !arrayObsEquals(oldValue, newValue)
          else changed = newValue != oldValue

          if (!changed) return

          console.log('>> setting changed: ', key, oldValue, newValue)

          await configStore.set(path, newValue)
          if (path == 'kc3kai.update.channel') this.setCanUpdateKc3()
        },
        this,
        subscriptionType,
      )
    }

    // update the value if needed
    if (
      (schema.type === 'array' && !arrayObsEquals(target[key](), value)) ||
      (schema.type !== 'array' && target[key]() !== value)
    )
      target[key](value)
  }

  // updates the config from ko properties
  async saveConfig() {
    await configApply(this.config, {
      propertyCallback: async (path, config, key, keySchema) => {
        let value = config[key]
        if (Array.isArray(value)) value = value.map(getMaybeObsValue)
        await configStore.set(path, value)
      },
    })
  }

  async kc3CheckForUpdates() {
    await sendToMain('kc3-doupdate')
  }

  addNewHideAddressBarSite() {
    const site = this.newHideAddressBarSite()
    if (!this.canAddNewHideAddressBarSite()) return
    this.newHideAddressBarSite('')

    const path = 'window.view.hideAddressBarSites'
    const item = ko.observable(site)
    this.setArrayItemSubscriber(item, path)

    this.config.window.view.hideAddressBarSites.push(item)
  }
  removeHideAddressBarSite(value) {
    const actualValue = this.config.window.view.hideAddressBarSites().find((v) => v() === value)
    this.config.window.view.hideAddressBarSites.remove(actualValue)
  }

  addNewProcess(data) {
    const p = {
      name: data.name,
      phase: ko.observable(''),
      current: ko.observable(0),
      total: ko.observable(0),
      type: ko.observable('steps'),
    }
    p.progressPct = ko.computed(() => {
      return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 3 }).format(
        (p.current() / p.total()) * 100,
      )
    })
    p.progress = ko.computed(() => {
      if (p.total() <= 0 || !p.total()) return ''

      const current = p.type() === 'bytes' ? this.friendlySize(p.current()) : p.current()
      const total = p.type() === 'bytes' ? this.friendlySize(p.total()) : p.total()

      return `${current}/${total} (${p.progressPct()}%)`
    })
    this.processes.push(p)
  }

  async getCustomKc3Path() {
    const channel = this.config.kc3kai.update.channel()
    if (!channel.startsWith('custom')) {
      console.error('Custom kc3 channel not selected.')
      return
    }
    const result = await sendToMain('kc3-select-custom-location')
    if (result.canceled || !result.filePaths.length) return
    const path = result.filePaths[0]
    console.log('Selected kc3 path', path)

    if (channel === 'custom1') this.config.kc3kai.custom1Location(path)
    else if (channel === 'custom2') this.config.kc3kai.custom2Location(path)
    else console.error('Unknown custom kc3 channel', channel)
  }

  async getCustomDataPath() {
    const loc = this.config.app.data.location()
    if (loc != 'custom') {
      console.error('Custom data location not selected.')
      return
    }
    const result = await sendToMain('select-custom-data-location')
    if (result.canceled || !result.filePaths.length) return
    const path = result.filePaths[0]
    console.log('Selected data path', path)

    this.config.app.data.customPath(path)
  }

  async getCustomKccpPath() {
    const result = await sendToMain('select-custom-kccp-location')
    if (result.canceled || !result.filePaths.length) return
    const path = result.filePaths[0]
    console.log('Selected KCCP path', path)
    this.kccpConfig.cacheLocation(path)
  }

  friendlySize(bytes, decimals = 2) {
    let received = bytes
    if (received < 1024) return `${received}bytes`
    received = (bytes / 1024).toFixed(decimals)
    if (received < 1024) return `${received}KB`
    received = (bytes / Math.pow(1024, 2)).toFixed(decimals)
    if (received < 1024) return `${received}MB`
    received = (bytes / Math.pow(1024, 3)).toFixed(decimals)
    return `${received}GB`
  }

  prepDownload(item) {
    const dl = this.convertPropertiesToObservables(item)
    dl.file = ko.pureComputed(() => {
      const split = (dl.filename() || dl.url()).split(/\\|\//)
      return split[split.length - 1]
    })
    if (!dl.endTime) dl.endTime = ko.observable()
    if (!dl.estimatedEndTime) dl.estimatedEndTime = ko.observable()

    dl.received = ko.pureComputed(() => this.friendlySize(dl.bytesReceived()))
    dl.total = ko.pureComputed(() => this.friendlySize(dl.totalBytes()))
    dl.progressPct = ko.pureComputed(() =>
      dl.totalBytes() > 0 && dl.bytesReceived() >= 0
        ? dl.bytesReceived() / dl.totalBytes()
        : undefined,
    )

    dl.open = () => chrome.downloads.open(dl.id())
    dl.openFolder = () => chrome.downloads.show(dl.id())
    dl.pause = () => chrome.downloads.pause(dl.id())
    dl.resume = () => chrome.downloads.resume(dl.id())
    dl.deleteFile = () => chrome.downloads.removeFile(dl.id())
    dl.erase = () => chrome.downloads.erase({ id: dl.id() })
    return dl
  }

  async receiveFromMain(msg) {
    switch (msg.type) {
      case 'status-kc3-is-updating':
        this.kc3IsUpdating(msg.data.isUpdating)
        this.kc3UpdatingChannel(msg.data.channel)
        break
      case 'status-kccp-modder-is-updating':
        this.kccpModderIsUpdating(msg.data.isUpdating)
        break
      case 'error-do-kc3-update':
      case 'error-do-kccp-modder-update':
        // TODO: report the error
        break
      case 'update-process-started':
        console.log('process started', msg.data.name)
        this.addNewProcess(msg.data)
        break
      case 'update-process-progress':
        const processToUpdate = this.processes().find((p) => p.name == msg.data.name)
        if (!processToUpdate) {
          this.addNewProcess(msg.data)
        }
        processToUpdate.phase(msg.data.phase)
        processToUpdate.type(msg.data.type)
        processToUpdate.total(msg.data.total)
        processToUpdate.current(msg.data.current)
        break
      case 'update-process-completed':
        console.log('process completed', msg.data.name)
        const processToRemove = this.processes().find((p) => p.name == msg.data.name)
        this.processes.remove(processToRemove)
        break
      case 'config-saved':
        await this.prepConfigProperties(msg.data)
        break
      case 'kccp-config-saved':
        await this.prepKccpConfig()
        break
      case 'kccp-status':
        this.kccpStatus(msg.data)
        break
      case 'kccp-log-update':
        if (!this.logTypes.includes(msg.data[2])) return
        let logTarget = this.appLogRecent
        if (msg.data[1].startsWith('kccp-')) logTarget = this.kccpLogRecent
        logTarget.push(msg.data)
        if (logTarget().length > this.logMaxLength) logTarget.shift()
        break
      case 'kccp-log-recent':
        msg.data.reverse()
        const kccpLog = msg.data.filter(
          (l) => l[1].startsWith('kccp-') && this.logTypes.includes(l[2]),
        )
        const appLog = msg.data.filter(
          (l) => !l[1].startsWith('kccp-') && this.logTypes.includes(l[2]),
        )
        this.kccpLogRecent(kccpLog.slice(kccpLog.length - this.logMaxLength))
        this.appLogRecent(appLog.slice(appLog.length - this.logMaxLength))
        break
      case 'kccp-git-mod-installed':
        const installedProcessName = 'Installing/updating KCCP mod'
        const installedProcess = this.processes().find((p) => p.name == installedProcessName)
        if (installedProcess) this.processes.remove(installedProcess)
        console.log('KCCP git mod installed:', msg.data)
        break
      case 'kccp-git-mod-updated':
        const updatedProcessName = 'Installing/updating KCCP mod'
        const updatedProcess = this.processes().find((p) => p.name == updatedProcessName)
        if (updatedProcess) this.processes.remove(updatedProcess)
        console.log('KCCP git mod updated:', msg.data)
        break
      case 'kccp-git-mod-progress':
        try {
          const installingProcessName = 'Installing/updating KCCP mod'
          const installingProcess = this.processes().find((p) => p.name == installingProcessName)
          if (!installingProcess) this.addNewProcess({ name: installingProcessName })
        } catch (error) {
          console.error('Error checking processes', error)
        }
        console.log('KCCP git mod install/update progress:', msg.data)
        break
      default:
        throw new Error(`Unknown message type ${msg.type || '(none)'}`)
    }
  }

  addBrowserListeners() {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      ;(async () => {
        // windows/tabs getCurrent methods are super unreliable

        const myWindowId = (await chrome.windows.getCurrent()).id
        if (!msg.meta.allWindows && msg.meta.windowId !== myWindowId) {
          console.log('Ignoring message for other window', msg.meta.windowId)
          return
        }
        if (!msg.meta.allWindows && !msg.meta.allTabs && msg.meta.tabId !== this.tabId) {
          console.log('Ignoring message for other tab', msg.meta.tabId)
          return
        } //*/
        let result
        try {
          await this.receiveFromMain(msg)
          //sendResponse({ result, complete: true })
        } catch (error) {
          //sendResponse({ error, complete: false })
        }
      })()
      //return true
    })

    chrome.downloads.onCreated.addListener((item) => this.downloads.push(this.prepDownload(item)))
    chrome.downloads.onChanged.addListener(async (downloadId, delta) => {
      const existing = this.downloads().find((d) => d.id() == delta.id)
      if (!existing) {
        console.error('received update for untracked download', delta)
        return
      }
      const results = await chrome.downloads.search({ id: delta.id })
      if (!results.length) {
        console.error(
          'received update for download but downloads api returned no results for its ID.',
          delta,
        )
        return
      }
      const dl = results[0]
      for (const key of Object.keys(dl)) {
        if (key == 'id') continue
        try {
          existing[key](dl[key])
        } catch (error) {
          console.error(error)
        }
      }
    })
    chrome.downloads.onErased.addListener((downloadId) => {
      const dl = this.downloads().find((d) => d.id() == downloadId)
      if (!dl) return
      this.downloads.remove(dl)
    })
  }

  async clearFinishedDownloads() {
    await chrome.downloads.erase({ state: 'complete' })
    await chrome.downloads.erase({ state: 'interrupted' })
  }

  setCanUpdateKc3() {
    this.canUpdateKc3(!this.kc3IsUpdating() && !!this.config?.kc3kai?.update.channel())
  }

  setCanUpdateKccpMods() {
    this.canUpdateKccpMods(
      !this.kccpModderIsUpdating() && !!this.config?.kccpConfig?.current()?.autoUpdateGitMods,
    )
  }

  compareVersions(a, b) {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = pa[i] || 0
      const nb = pb[i] || 0
      if (na !== nb) return na > nb ? 1 : -1
    }
    return 0
  }

  constructor() {
    this.init()
  }
  async init() {
    setMessageSource('settings')
    const appInfo = await this.tryInvoke(
      async () => await sendToMain('get-damecon-info', {}),
      'get-damecon-info',
    )
    this.paths = appInfo.paths
    this.version = appInfo.version
    this.kccpStatus(appInfo.kccpStatus)

    await this.prepKccpConfig()

    await this.prepConfigProperties()
    console.log('done prepping config', this.config)
    this.settingsInitialized(true)

    const cfgVer = this.config.version()
    if (!cfgVer || this.compareVersions(cfgVer, '0.10.0') < 0) {
      console.log('Adding new game page URL')
      const newGamePageUrl = 'https://play.games.dmm.com/game/kancolle'
      const sites = vm.config.window.view.hideAddressBarSites()
      if (!sites.includes(newGamePageUrl)) {
        this.newHideAddressBarSite(newGamePageUrl)
        this.addNewHideAddressBarSite()
      }
    }

    const downloads = await chrome.downloads.search({})
    downloads.forEach((d) => this.downloads.push(this.prepDownload(d)))

    //this doesn't work lol
    //this.tabId = await chrome.tabs.getCurrent()

    this.addBrowserListeners()

    const kc3UpdateStatus = await sendToMain('kc3-get-isupdating')
    const kccpModUpdateStatus = await sendToMain('kccp-modder-get-isupdating')
    this.kc3IsUpdating.subscribe((newValue) => this.setCanUpdateKc3())
    this.kc3IsUpdating(kc3UpdateStatus.isUpdating)
    this.kccpModderIsUpdating(kccpModUpdateStatus.isUpdating)
    this.kc3UpdatingChannel(kc3UpdateStatus.channel)

    await sendToMain('kccp-log-get-recent')

    this.config.version(this.version.split(' v')[1])

    this.kccpTab.subscribe((value) => {
      if (value === this.kccpTabs.log) {
        setTimeout(() => scrollTop('#kccp-log-scroller', true), 10)
      }
    })
  }
}
window.vm = new Settings()
$(document).ready(() => ko.applyBindings(window.vm))
