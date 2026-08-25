//
// Do not use from webui.js
// ... I mean you can, but you probably shouldn't
//

let tabId = 0
let windowId = 0
let messageSource

const setMessageSource = function (source) {
  console.log('Message source set to', JSON.stringify(source))
  messageSource = source
}

const checkMessageSource = function () {
  if (!messageSource) throw new Error('Must set messageSource before using sendMessage.')
}

const tryInvoke = async function (asyncCallback, name) {
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

const sendToMain = function (type, data) {
  return sendMessage('main', type, data)
}

const sendMessage = async function (target, type, data) {
  try {
    checkMessageSource()
    if (!tabId) tabId = (await chrome.tabs.getCurrent())?.id || -1
    if (!windowId) windowId = (await chrome.windows.getCurrent())?.id || -1

    return await ipc.send(
      'webui-message',
      { type, windowId, tabId, source: messageSource, target },
      data,
    )
  } catch (error) {
    console.error('Caught error while sending message', target, type, data, error)
    throw error
  }
}

const configStore = {
  set: async function (key, value) {
    return await sendMessage('main', 'set-config-item', { key, value })
  },
  get: async function (key) {
    return await sendMessage('main', 'get-config-item', { key })
  },
  all: async function () {
    return await sendMessage('main', 'get-config')
  },
}

const kccpConfigStore = {
  save: async function (config) {
    return await sendMessage('main', 'kccp-save-config', config)
  },
  all: async function () {
    return await sendMessage('main', 'kccp-get-config')
  },
}

//
// Rest are OK to use anywhere
//

// Access a node of an object tree via dot notation string ('foo.bar.baz')
const access = function (o, s) {
  s = s.replace(/\[(\w+)\]/g, '.$1') // convert indexes to properties
  s = s.replace(/^\./, '') // strip a leading dot
  var a = s.split('.')
  for (var i = 0, n = a.length; i < n; ++i) {
    var k = a[i]
    if (o === Object(o) && k in o) {
      o = o[k]
    } else {
      return
    }
  }
  return o
}

const sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))

ko.bindingHandlers['style'] = {
  update: function (element, valueAccessor) {
    const value = ko.utils.unwrapObservable(valueAccessor() || {})
    ko.utils.objectForEach(value, function (styleName, styleValue) {
      styleValue = ko.utils.unwrapObservable(styleValue)

      if (styleValue === null || styleValue === undefined || styleValue === false) {
        styleValue = ''
      }

      if (styleName.startsWith('--')) element.style.setProperty(styleName, styleValue)
      else element.style[styleName] = styleValue
    })
  },
}

const normalizeThemeColor = function (value) {
  const color = String(value || '').trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null
}

const mixThemeColor = function (color, blackWeight) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => parseInt(channel, 16))
  const mixed = channels.map((channel) => Math.round(channel * (1 - blackWeight)))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

const createCustomThemeStyle = function (value) {
  const color = normalizeThemeColor(value) || '#6e35ae'
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => parseInt(channel, 16) / 255)
  const luminance = channels
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
    )
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0)
  const textColor = luminance > 0.42 ? '#171717' : '#ececec'

  return {
    '--custom-theme-color': color,
    '--custom-theme-mid-color': mixThemeColor(color, 0.22),
    '--custom-theme-bg-color': mixThemeColor(color, 0.44),
    '--custom-theme-text-color': textColor,
    '--custom-theme-control-text-color': `${textColor}c0`,
  }
}

const urlRegex =
  /^(?<base>(?:(?<scheme>[\w-]+:)(?<open>\/\/\/?)(?<cred>(?<user>[\w]*)(?::(?<pw>[\w]*))?@)?)?(?<host>[\d\w\.-]+?(?<tld>\.[\w]+)?)(?::(?<port>\d+))?)?(?:\/(?<path>[\/\\\w\.()-]*))?(?:(?<query>[?][^#]*)?(?<hash>#.*)?)*$/gim
