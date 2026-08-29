import {
  getResourceLedgerWindow,
  parseKC3ResourceLedgerSnapshot,
  summarizeResourceLedger,
} from '@kancolle-assistant/recommendation-core'

const RESOURCE_LEDGER_SNAPSHOT_CACHE_TTL_MS = 15_000
const resourceLedgerSnapshotCache = new WeakMap()

const cacheKeyForWindow = (request) =>
  `${request.startHour}:${request.endHourExclusive}:${request.currentHour}`

const cacheForTarget = (webContents) => {
  if (!resourceLedgerSnapshotCache.has(webContents)) {
    resourceLedgerSnapshotCache.set(webContents, new Map())
  }
  return resourceLedgerSnapshotCache.get(webContents)
}

export const kc3ResourceLedgerMainWorld = async (request) => {
  if (!window.KC3Database?.con?.navaloverall || !window.PlayerManager?.hq) {
    throw new Error('KC3 resource ledger is not ready')
  }

  await window.KC3Database.loadIfNecessary()
  if (typeof window.PlayerManager.hq.load === 'function') window.PlayerManager.hq.load()
  if (typeof window.PlayerManager.loadConsumables === 'function') {
    window.PlayerManager.loadConsumables()
  }

  const playerId = String(window.PlayerManager.hq.id)

  const readRecordMinute = (record) => {
    if (typeof record.minute !== 'undefined' && record.minute !== null) {
      const explicitMinute = Number(record.minute)
      if (Number.isFinite(explicitMinute)) return explicitMinute
    }
    for (const field of ['timestamp', 'time', 'date', 'createdAt', 'updatedAt']) {
      const value = record[field]
      if (typeof value === 'undefined' || value === null) continue
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric > 1000000000) {
        const milliseconds = numeric > 100000000000 ? numeric : numeric * 1000
        return Math.floor(milliseconds / 60000)
      }
      if (typeof value === 'string') {
        const parsed = Date.parse(value)
        if (Number.isFinite(parsed)) return Math.floor(parsed / 60000)
      }
    }
    return Number(record.hour) * 60
  }

  const readSnapshots = async (table, fields) => {
    if (!table) return []
    const before = await table
      .where('hour')
      .below(request.startHour)
      .reverse()
      .and((record) => String(record.hq) === playerId)
      .first()
    const within = await table
      .where('hour')
      .between(request.startHour, request.endHourExclusive, true, false)
      .and((record) => String(record.hq) === playerId)
      .toArray()
    return [before, ...within]
      .filter(Boolean)
      .sort((left, right) => Number(left.hour) - Number(right.hour))
      .map((record) => ({
        hour: Number(record.hour),
        values: Object.fromEntries(
          Object.entries(fields).map(([key, field]) => [key, Number(record[field]) || 0]),
        ),
      }))
  }

  const recordsPromise = window.KC3Database.con.navaloverall
    .where('hour')
    .between(request.startHour, request.endHourExclusive, true, false)
    .and((record) => String(record.hq) === playerId)
    .toArray()

  const [records, materialSnapshots, consumableSnapshots] = await Promise.all([
    recordsPromise,
    readSnapshots(window.KC3Database.con.resource, {
      fuel: 'rsc1',
      ammo: 'rsc2',
      steel: 'rsc3',
      bauxite: 'rsc4',
    }),
    readSnapshots(window.KC3Database.con.useitem, {
      torch: 'torch',
      bucket: 'bucket',
      devmat: 'devmat',
      screws: 'screw',
    }),
  ])
  const currentMaterials = window.PlayerManager.hq.lastMaterial

  return {
    generatedAt: new Date(request.now).toISOString(),
    startHour: request.startHour,
    endHourExclusive: request.endHourExclusive,
    currentHour: request.currentHour,
    current: {
      fuel: Number(currentMaterials?.[0]) || 0,
      ammo: Number(currentMaterials?.[1]) || 0,
      steel: Number(currentMaterials?.[2]) || 0,
      bauxite: Number(currentMaterials?.[3]) || 0,
      torch: Number(window.PlayerManager.consumables?.torch) || 0,
      bucket: Number(window.PlayerManager.consumables?.buckets) || 0,
      devmat: Number(window.PlayerManager.consumables?.devmats) || 0,
      screws: Number(window.PlayerManager.consumables?.screws) || 0,
    },
    records: records.map((record) => ({
      hour: Number(record.hour),
      minute: readRecordMinute(record),
      type: String(record.type || ''),
      data: Array.isArray(record.data) ? record.data.map((value) => Number(value) || 0) : [],
    })),
    materialSnapshots,
    consumableSnapshots,
  }
}

export const readKC3ResourceLedgerSnapshot = (webContents, request) =>
  webContents.executeJavaScript(
    `(${kc3ResourceLedgerMainWorld.toString()})(${JSON.stringify(request)})`,
    true,
  )

const readCachedKC3ResourceLedgerSnapshot = async (webContents, request) => {
  const cache = cacheForTarget(webContents)
  const key = cacheKeyForWindow(request)
  const cached = request.forceRefresh ? null : cache.get(key)
  const now = Date.now()
  if (cached?.value && now - cached.cachedAt <= RESOURCE_LEDGER_SNAPSHOT_CACHE_TTL_MS) {
    return cached.value
  }
  if (cached?.promise) return cached.promise

  const promise = readKC3ResourceLedgerSnapshot(webContents, request).then(
    (value) => {
      cache.set(key, { value, cachedAt: Date.now() })
      return value
    },
    (error) => {
      if (cache.get(key)?.promise === promise) cache.delete(key)
      throw error
    },
  )
  cache.set(key, { promise, cachedAt: now })
  return promise
}

export const readKC3ResourceLedgerSummary = async (
  webContents,
  request,
  summarizer = summarizeResourceLedger,
) => {
  const now = Date.now()
  const window = getResourceLedgerWindow(request.range, now)
  const value = await readCachedKC3ResourceLedgerSnapshot(webContents, {
    ...request,
    ...window,
    now,
  })
  return summarizer({
    snapshot: parseKC3ResourceLedgerSnapshot(value),
    range: request.range,
    now,
    granularity: request.granularity,
  })
}
