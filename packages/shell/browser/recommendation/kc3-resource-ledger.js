import {
  getResourceLedgerWindow,
  parseKC3ResourceLedgerSnapshot,
  summarizeResourceLedger,
} from '@kancolle-assistant/recommendation-core'

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
  const records = await window.KC3Database.con.navaloverall
    .where('hour')
    .between(request.startHour, request.endHourExclusive, true, false)
    .and((record) => String(record.hq) === playerId)
    .toArray()

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

  const [materialSnapshots, consumableSnapshots] = await Promise.all([
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

export const readKC3ResourceLedgerSummary = async (
  webContents,
  request,
  summarizer = summarizeResourceLedger,
) => {
  const now = Date.now()
  const window = getResourceLedgerWindow(request.range, now)
  const value = await readKC3ResourceLedgerSnapshot(webContents, { ...request, ...window, now })
  return summarizer({
    snapshot: parseKC3ResourceLedgerSnapshot(value),
    range: request.range,
    now,
  })
}
