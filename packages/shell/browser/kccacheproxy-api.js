// This is the only shell module allowed to depend on KCCacheProxy internals.
export const kccp = require('../../kccacheproxy/src/proxy/proxy.js')
export const kccpCacher = require('../../kccacheproxy/src/proxy/cacher.js')
export const kccpCacheHandler = require('../../kccacheproxy/src/proxy/cacheHandler.js')
export const kccpModderUtils = require('../../kccacheproxy/src/proxy/mod/modderUtils.js')
export const kccpPatcher = require('../../kccacheproxy/src/proxy/mod/patcher.js')
export const kccpGitModHandler = require('../../kccacheproxy/src/proxy/mod/gitModHandler.js')
export const kccpIpc = require('../../kccacheproxy/src/proxy/ipc.js')

export const updateKccpMod = (...args) => kccpGitModHandler.updateMod(...args)
export const installKccpMod = (...args) => kccpGitModHandler.handleModInstallation(...args)
export const reloadKccpModCache = (...args) => kccpPatcher.reloadModCache(...args)
export const setKccpMainWindow = (...args) => kccpIpc.setMainWindow(...args)
