const pathSegments = (key) => String(key).split('.').filter(Boolean)

const getPath = (target, key) =>
  pathSegments(key).reduce(
    (value, segment) => (value === null || value === undefined ? undefined : value[segment]),
    target,
  )

const setPath = (target, key, value) => {
  const segments = pathSegments(key)
  if (segments.length === 0) return
  let cursor = target
  segments.slice(0, -1).forEach((segment) => {
    if (!cursor[segment] || typeof cursor[segment] !== 'object') cursor[segment] = {}
    cursor = cursor[segment]
  })
  cursor[segments.at(-1)] = value
}

const deletePath = (target, key) => {
  const segments = pathSegments(key)
  if (segments.length === 0) return
  const parent = segments
    .slice(0, -1)
    .reduce(
      (value, segment) => (value === null || value === undefined ? undefined : value[segment]),
      target,
    )
  if (parent && typeof parent === 'object') delete parent[segments.at(-1)]
}

export const createRuntimeConfigStore = (persistentStore, initialConfig = persistentStore.all) => {
  let config = initialConfig

  return {
    get all() {
      return config
    },
    set all(value) {
      persistentStore.all = value
      config = value
    },
    get size() {
      return Object.keys(config || {}).length
    },
    get(key) {
      return getPath(config, key)
    },
    set(key, value) {
      const updates = arguments.length === 1 ? key : { [key]: value }
      const result = persistentStore.set(updates)
      Object.entries(updates).forEach(([updateKey, updateValue]) => {
        setPath(config, updateKey, updateValue)
      })
      return result
    },
    has(key) {
      return getPath(config, key) !== undefined
    },
    delete(key) {
      const result = persistentStore.delete(key)
      deletePath(config, key)
      return result
    },
    clear() {
      const result = persistentStore.clear()
      config = {}
      return result
    },
    get path() {
      return persistentStore.path
    },
  }
}
