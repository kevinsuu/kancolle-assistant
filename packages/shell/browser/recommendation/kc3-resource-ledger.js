export const kc3ResourceLedgerMainWorld = async (request) => {
  const hourMs = 60 * 60 * 1000
  const jstOffsetMs = 9 * hourMs
  const resourceKeys = ['fuel', 'ammo', 'steel', 'bauxite', 'torch', 'bucket', 'devmat', 'screws']
  const resourceIndexes = {
    fuel: 0,
    ammo: 1,
    steel: 2,
    bauxite: 3,
    torch: 4,
    bucket: 5,
    devmat: 6,
    screws: 7,
  }
  const emptyValues = () => Object.fromEntries(resourceKeys.map((key) => [key, 0]))
  const emptyNullableValues = () => Object.fromEntries(resourceKeys.map((key) => [key, null]))
  const sourceCategory = (type) => {
    const value = String(type || '').toLowerCase()
    if (value.startsWith('sortie')) return 'sortie'
    if (value.startsWith('pvp')) return 'pvp'
    if (value.startsWith('exped')) return 'expedition'
    if (value.startsWith('quest')) return 'quest'
    if (value.startsWith('repair') || value.startsWith('akashi') || value.startsWith('nosaki')) {
      return 'repair'
    }
    if (
      value.startsWith('crship') ||
      value.startsWith('critem') ||
      value.startsWith('remodel') ||
      value.startsWith('rmditem')
    ) {
      return 'arsenal'
    }
    if (value.startsWith('dsship') || value.startsWith('dsitem')) return 'disposal'
    if (value.startsWith('lbas')) return 'landBase'
    if (value.startsWith('regen')) return 'regen'
    if (value.startsWith('useitem')) return 'item'
    return 'other'
  }
  const startOfJstDay = (timestamp) => {
    const shifted = new Date(timestamp + jstOffsetMs)
    return (
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - jstOffsetMs
    )
  }

  if (!window.KC3Database?.con?.navaloverall || !window.PlayerManager?.hq) {
    throw new Error('KC3 resource ledger is not ready')
  }

  await window.KC3Database.loadIfNecessary()
  if (typeof window.PlayerManager.hq.load === 'function') {
    window.PlayerManager.hq.load()
  }
  if (typeof window.PlayerManager.loadConsumables === 'function') {
    window.PlayerManager.loadConsumables()
  }

  const now = Date.now()
  const currentHour = Math.floor(now / hourMs)
  const todayStart = startOfJstDay(now)
  let startHour
  let endHourExclusive

  switch (request.range) {
    case 'yesterday':
      startHour = Math.floor((todayStart - 24 * hourMs) / hourMs)
      endHourExclusive = Math.floor(todayStart / hourMs)
      break
    case 'rolling24':
      endHourExclusive = currentHour + 1
      startHour = endHourExclusive - 24
      break
    case 'today':
    default:
      startHour = Math.floor(todayStart / hourMs)
      endHourExclusive = currentHour + 1
      break
  }

  const playerId = String(window.PlayerManager.hq.id)
  const records = await window.KC3Database.con.navaloverall
    .where('hour')
    .between(startHour, endHourExclusive, true, false)
    .and((record) => String(record.hq) === playerId)
    .toArray()

  const hourly = new Map()
  for (let hour = startHour; hour < endHourExclusive; hour += 1) {
    hourly.set(hour, {
      hour,
      gained: emptyValues(),
      spent: emptyValues(),
      net: emptyValues(),
    })
  }

  records.forEach((record) => {
    const bucket = hourly.get(Number(record.hour))
    if (!bucket || !Array.isArray(record.data)) return
    resourceKeys.forEach((key) => {
      const value = Number(record.data[resourceIndexes[key]]) || 0
      if (value > 0) bucket.gained[key] += value
      if (value < 0) bucket.spent[key] += Math.abs(value)
      bucket.net[key] += value
    })
  })

  const currentMaterials = window.PlayerManager.hq.lastMaterial
  const current = {
    fuel: Number(currentMaterials?.[0]) || 0,
    ammo: Number(currentMaterials?.[1]) || 0,
    steel: Number(currentMaterials?.[2]) || 0,
    bauxite: Number(currentMaterials?.[3]) || 0,
    torch: Number(window.PlayerManager.consumables?.torch) || 0,
    bucket: Number(window.PlayerManager.consumables?.buckets) || 0,
    devmat: Number(window.PlayerManager.consumables?.devmats) || 0,
    screws: Number(window.PlayerManager.consumables?.screws) || 0,
  }
  const summary = Object.fromEntries(
    resourceKeys.map((key) => {
      const values = [...hourly.values()].reduce(
        (total, item) => ({
          gained: total.gained + item.gained[key],
          spent: total.spent + item.spent[key],
          net: total.net + item.net[key],
        }),
        { gained: 0, spent: 0, net: 0 },
      )
      return [key, { ...values, current: current[key] }]
    }),
  )
  const sourceMap = new Map()
  records.forEach((record) => {
    if (!Array.isArray(record.data)) return
    const key = sourceCategory(record.type)
    if (!sourceMap.has(key)) {
      sourceMap.set(key, {
        key,
        entryCount: 0,
        gained: emptyValues(),
        spent: emptyValues(),
        net: emptyValues(),
      })
    }
    const source = sourceMap.get(key)
    source.entryCount += 1
    resourceKeys.forEach((resourceKey) => {
      const value = Number(record.data[resourceIndexes[resourceKey]]) || 0
      if (value > 0) source.gained[resourceKey] += value
      if (value < 0) source.spent[resourceKey] += Math.abs(value)
      source.net[resourceKey] += value
    })
  })

  const readSnapshots = async (table, fields) => {
    if (!table) return []
    const before = await table
      .where('hour')
      .below(startHour)
      .reverse()
      .and((record) => String(record.hq) === playerId)
      .first()
    const within = await table
      .where('hour')
      .between(startHour, endHourExclusive, true, false)
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
  const snapshotValues = emptyNullableValues()
  let materialIndex = 0
  let consumableIndex = 0
  const inventoryHours = []
  for (let hour = startHour; hour < endHourExclusive; hour += 1) {
    while (
      materialIndex < materialSnapshots.length &&
      materialSnapshots[materialIndex].hour <= hour
    ) {
      Object.assign(snapshotValues, materialSnapshots[materialIndex].values)
      materialIndex += 1
    }
    while (
      consumableIndex < consumableSnapshots.length &&
      consumableSnapshots[consumableIndex].hour <= hour
    ) {
      Object.assign(snapshotValues, consumableSnapshots[consumableIndex].values)
      consumableIndex += 1
    }
    if (hour === currentHour && request.range !== 'yesterday')
      Object.assign(snapshotValues, current)
    inventoryHours.push({ hour, values: { ...snapshotValues } })
  }
  const hourFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    hourCycle: 'h23',
  })

  return {
    generatedAt: new Date(now).toISOString(),
    entryCount: records.length,
    range: {
      key: request.range,
      start: new Date(startHour * hourMs).toISOString(),
      end: new Date(endHourExclusive * hourMs).toISOString(),
      timeZone: 'Asia/Tokyo',
    },
    summary,
    sources: [...sourceMap.values()],
    hours: [...hourly.values()].map((item) => ({
      ...item,
      label: hourFormatter.format(new Date(item.hour * hourMs)),
    })),
    inventoryHours: inventoryHours.map((item) => ({
      ...item,
      label: hourFormatter.format(new Date(item.hour * hourMs)),
    })),
  }
}

export const readKC3ResourceLedgerSummary = (webContents, request) =>
  webContents.executeJavaScript(
    `(${kc3ResourceLedgerMainWorld.toString()})(${JSON.stringify(request)})`,
    true,
  )
