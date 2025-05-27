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

const urlRegex =
  /^(?<base>(?:(?<scheme>[\w-]+:)(?<open>\/\/\/?)(?<cred>(?<user>[\w]*)(?::(?<pw>[\w]*))?@)?)?(?<host>[\d\w\.-]+?(?<tld>\.[\w]+)?)(?::(?<port>\d+))?)?(?:\/(?<path>[\/\\\w\.()-]*))?(?:(?<query>[?][^#]*)?(?<hash>#.*)?)*$/gim
