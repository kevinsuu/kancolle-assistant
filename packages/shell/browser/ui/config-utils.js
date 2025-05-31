const configSchema = {
  app: {
    update: {
      auto: { type: 'bool', default: true },
      removeOld: { type: 'bool', default: true },
    },
    data: {
      location: {
        type: 'option',
        options: ['home', 'appdata', 'appdir', 'custom'],
        default: 'appdata',
      },
      customPath: { type: 'string' },
    },
  },
  window: {
    state: {
      width: { type: 'number', default: 1200 },
      height: { type: 'number', default: 800 },
    },
    style: {
      theme: {
        type: 'option',
        options: [
          'noir',
          'haku',
          'andra',
          'damecon',
          'daybreak',
          'savatieri',
          'souya',
          'taiha',
          'yasen',
          'zuiun',
          'chuuha',
          'cirrus',
          'kazagumo',
          'langley',
          'sagiri',
          'sakura',
          'sammy',
          'seafoam',
        ],
        default: 'damecon',
      },
      brightness: { type: 'option', options: ['system', 'light', 'dark'], default: 'system' },
    },
    view: {
      hideAddressBarSites: {
        type: 'array',
        default: [
          'http://www.dmm.com/netgame/social/-/gadgets/=/app_id=854854/',
          '{{kc3-extension}}/*',
        ],
      },
      alwaysShowExtensions: { type: 'bool', default: true },
      alwaysShowReload: { type: 'bool', default: true },
      alwaysShowBack: { type: 'bool', default: false },
      alwaysShowForward: { type: 'bool', default: false },
    },
    behavior: {
      confirmCloseGamePage: { type: 'bool', default: true },
      occlusion: { type: 'bool', default: false },
    },
    gpu: {
      availableMemoryMb: { type: 'number', default: 10000 },
      rasterization: { type: 'bool', default: true },
      nativeBuffers: { type: 'bool', default: true },
      compositorResources: { type: 'bool', default: true },
    },
  },
  kc3kai: {
    startup: {
      gamePage: { type: 'option', options: ['none', 'kc3', 'dmm'], default: 'kc3' },
      openStartPage: { type: 'bool' }, // TODO: remove
      openDMMPage: { type: 'bool' }, // TODO: remove
      openDevtools: { type: 'bool', default: true },
      openStratRoom: { type: 'bool', default: true },
    },
    update: {
      channel: {
        type: 'option',
        options: ['release', 'master', 'develop', 'custom1', 'custom2'],
        default: 'release',
      },
      schedule: {
        type: 'option',
        options: ['startup', 'daily', 'weekly', 'manual'],
        default: 'daily',
      },
      auto: { type: 'bool', default: true },
    },
    custom1Location: { type: 'string' },
    custom2Location: { type: 'string' },
  },
  proxy: {
    enable: { type: 'bool', default: false },
    mode: {
      type: 'option',
      options: ['kccp-external', 'kccp-internal', 'all-external'],
      default: 'kccp-external',
    },
    client: {
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'number', default: 8081 },
    },
  },
}

const updateConfigDefaults = function (options) {
  if (options.preexisting) configSchema.app.data.location.default = 'appdir'
}

const createKey = function (obj, key) {
  if (!obj.hasOwnProperty(key) || typeof obj[key] != 'object') obj[key] = {}
}

const configApply = async function (target, options) {
  let { source, propertyCallback, schema, path } = options
  schema = schema || configSchema
  path = path || ''
  for (const key in schema) {
    const keyPath = path ? `${path}.${key}` : key
    const keySchema = schema[key]
    if (keySchema.type && typeof keySchema.type == 'string') {
      // config property
      await propertyCallback(keyPath, key, keySchema, target, source)
    } else {
      // sub-key
      createKey(target, key)
      if (!!source) createKey(source, key)
      await configApply(target[key], {
        propertyCallback,
        schema: keySchema,
        path: keyPath,
        source: source[key],
      })
    }
  }
  return target
}
const configApplySync = function (target, options) {
  let { source, propertyCallback, schema, path } = options
  schema = schema || configSchema
  path = path || ''
  source = source || target
  for (const key in schema) {
    const keyPath = path ? `${path}.${key}` : key
    const keySchema = schema[key]
    if (keySchema.type && typeof keySchema.type == 'string') {
      // config property
      propertyCallback(keyPath, key, keySchema, target, source)
    } else {
      // sub-key
      createKey(target, key)
      if (!!source) createKey(source, key)
      configApplySync(target[key], {
        propertyCallback,
        schema: keySchema,
        path: keyPath,
        source: source[key],
      })
    }
  }
  return target
}

const populateConfigDefaults = function (config, schema = configSchema) {
  configApplySync(config, {
    propertyCallback: (path, key, keySchema, config) => {
      if (
        typeof keySchema.default == 'undefined' ||
        (config.hasOwnProperty(key) && typeof config[key] != 'undefined')
      )
        return
      config[key] = keySchema.default
    },
    schema,
  })
}

// gets a value that may be an observable or a plain value
const getMaybeObsValue = (obj) => (typeof obj === 'function' ? obj() : obj)
// does a shallow array comparison, comparing raw values of observables if present
const arrayObsEquals = function (arr1, arr2) {
  return (
    [arr1, arr2].every(Array.isArray) &&
    arr1.length == arr2.length &&
    arr1.every((val, idx) => getMaybeObsValue(arr2[idx]) === getMaybeObsValue(val))
  )
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    configSchema,
    updateConfigDefaults,
    configApply,
    configApplySync,
    populateConfigDefaults,
  })
}
if (typeof module !== 'undefined') {
  module.exports = {
    configSchema,
    updateConfigDefaults,
    configApply,
    configApplySync,
    populateConfigDefaults,
  }
}
