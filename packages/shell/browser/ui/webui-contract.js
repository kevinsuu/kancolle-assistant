/** @typedef {{type: string, windowId?: number, tabId?: number, source?: string, target?: string, data?: unknown}} WebUiCommand */
/** @typedef {{type: string, meta?: object, data?: unknown}} WebUiEvent */
export const WEBUI_COMMAND_CHANNEL = 'webui-message'
export const WEBUI_EVENT_CHANNELS = Object.freeze({
  onWebUiMessage: 'webui-message',
  onLogUpdate: 'update',
  onRecentLogs: 'recent',
})
export const WEBUI_COMMANDS = new Set([
  'get-damecon-info',
  'get-damecon-version',
  'get-config-item',
  'get-config',
  'set-config-item',
  'get-should-hide-addressbar',
  'clear-cache',
  'start-find-in-page',
  'close-find-in-page',
  'kc3-doupdate',
  'kccp-modder-doupdate',
  'kc3-get-isupdating',
  'kccp-modder-get-isupdating',
  'kc3-select-custom-location',
  'select-custom-data-location',
  'select-custom-kccp-location',
  'webui-init-complete',
  'webui-zoom-changed',
  'webui-display-mode-changed',
  'webui-close-tab',
  'kccp-get-status',
  'kccp-get-config',
  'kccp-save-config',
  'kccp-import-cache',
  'kccp-verify-cache',
  'kccp-extract-spritesheet',
  'kccp-make-outlines',
  'kccp-convert-poi',
  'kccp-add-mod',
  'kccp-add-git-mod',
  'kccp-update-git-mod',
  'kccp-open-mod-folder',
  'kccp-log-get-recent',
  'kccp-reload-mods',
  'kccp-reload-cache',
  'kccp-prepatch',
  'kccp-check-mitm-cert',
])

export const validateWebUiCommand = (meta, data) => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta) || !WEBUI_COMMANDS.has(meta.type))
    return false
  if (['windowId', 'tabId'].some((key) => meta[key] !== undefined && !Number.isInteger(meta[key])))
    return false
  if (data !== undefined && (data === null || typeof data !== 'object' || Array.isArray(data)))
    return false
  if (['get-config-item', 'set-config-item'].includes(meta.type)) {
    if (
      typeof data?.key !== 'string' ||
      !data.key.length ||
      data.key.split('.').some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
    )
      return false
  }
  if (meta.type === 'set-config-item' && !Object.hasOwn(data, 'value')) return false
  if (
    ['webui-zoom-changed', 'webui-display-mode-changed'].includes(meta.type) &&
    (!Number.isFinite(data?.height) || data.height < 0)
  )
    return false
  if (
    ['webui-close-tab', 'start-find-in-page', 'close-find-in-page'].includes(meta.type) &&
    !Number.isInteger(data?.tabId)
  )
    return false
  if (meta.type === 'start-find-in-page' && typeof data?.searchInput !== 'string') return false
  if (meta.type === 'kccp-save-config' && (!data || !Array.isArray(data.mods))) return false
  return true
}
