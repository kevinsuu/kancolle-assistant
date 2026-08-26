export const RESOURCE_LEDGER_KEYS = [
  'fuel',
  'ammo',
  'steel',
  'bauxite',
  'torch',
  'bucket',
  'devmat',
  'screws',
] as const

export type ResourceLedgerKey = (typeof RESOURCE_LEDGER_KEYS)[number]
export type ResourceLedgerRange = 'today' | 'yesterday' | 'rolling24'
export type ResourceLedgerValues = Readonly<Record<ResourceLedgerKey, number>>
export type NullableResourceLedgerValues = Readonly<Record<ResourceLedgerKey, number | null>>

export interface ResourceLedgerRecord {
  readonly hour: number
  readonly type: string
  readonly data: readonly number[]
}

export interface ResourceInventorySnapshot {
  readonly hour: number
  readonly values: Readonly<Partial<ResourceLedgerValues>>
}

export interface ResourceLedgerWindow {
  readonly startHour: number
  readonly endHourExclusive: number
  readonly currentHour: number
}

export interface ResourceLedgerSnapshot extends ResourceLedgerWindow {
  readonly generatedAt: string
  readonly current: ResourceLedgerValues
  readonly records: readonly ResourceLedgerRecord[]
  readonly materialSnapshots: readonly ResourceInventorySnapshot[]
  readonly consumableSnapshots: readonly ResourceInventorySnapshot[]
}

export interface ResourceLedgerBucket {
  readonly hour: number
  readonly gained: ResourceLedgerValues
  readonly spent: ResourceLedgerValues
  readonly net: ResourceLedgerValues
  readonly label: string
}

export interface ResourceLedgerSource {
  readonly key: string
  readonly entryCount: number
  readonly gained: ResourceLedgerValues
  readonly spent: ResourceLedgerValues
  readonly net: ResourceLedgerValues
}

export interface ResourceLedgerSummary {
  readonly generatedAt: string
  readonly entryCount: number
  readonly range: {
    readonly key: ResourceLedgerRange
    readonly start: string
    readonly end: string
    readonly timeZone: 'Asia/Tokyo'
  }
  readonly summary: Readonly<
    Record<
      ResourceLedgerKey,
      {
        readonly gained: number
        readonly spent: number
        readonly net: number
        readonly current: number
      }
    >
  >
  readonly sources: readonly ResourceLedgerSource[]
  readonly hours: readonly ResourceLedgerBucket[]
  readonly inventoryHours: readonly {
    readonly hour: number
    readonly values: NullableResourceLedgerValues
    readonly label: string
  }[]
}

const HOUR_MS = 60 * 60 * 1000
const JST_OFFSET_MS = 9 * HOUR_MS
const RESOURCE_INDEXES: Readonly<Record<ResourceLedgerKey, number>> = {
  fuel: 0,
  ammo: 1,
  steel: 2,
  bauxite: 3,
  torch: 4,
  bucket: 5,
  devmat: 6,
  screws: 7,
}

const emptyValues = (): Record<ResourceLedgerKey, number> =>
  Object.fromEntries(RESOURCE_LEDGER_KEYS.map((key) => [key, 0])) as Record<
    ResourceLedgerKey,
    number
  >

const emptyNullableValues = (): Record<ResourceLedgerKey, number | null> =>
  Object.fromEntries(RESOURCE_LEDGER_KEYS.map((key) => [key, null])) as Record<
    ResourceLedgerKey,
    number | null
  >

const startOfJstDay = (timestamp: number): number => {
  const shifted = new Date(timestamp + JST_OFFSET_MS)
  return (
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - JST_OFFSET_MS
  )
}

export const getResourceLedgerWindow = (
  range: ResourceLedgerRange,
  now: number,
): ResourceLedgerWindow => {
  const currentHour = Math.floor(now / HOUR_MS)
  const todayStart = startOfJstDay(now)
  if (range === 'yesterday') {
    return {
      currentHour,
      startHour: Math.floor((todayStart - 24 * HOUR_MS) / HOUR_MS),
      endHourExclusive: Math.floor(todayStart / HOUR_MS),
    }
  }
  if (range === 'rolling24') {
    return { currentHour, startHour: currentHour + 1 - 24, endHourExclusive: currentHour + 1 }
  }
  return {
    currentHour,
    startHour: Math.floor(todayStart / HOUR_MS),
    endHourExclusive: currentHour + 1,
  }
}

type UnknownRecord = Record<string, unknown>

const asRecord = (value: unknown, path: string): UnknownRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} 必須是物件`)
  }
  return value as UnknownRecord
}

const asArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${path} 必須是陣列`)
  return value
}

const asNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} 必須是數字`)
  return value
}

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') throw new Error(`${path} 必須是字串`)
  return value
}

const parseValues = (value: unknown, path: string): ResourceLedgerValues => {
  const record = asRecord(value, path)
  return Object.fromEntries(
    RESOURCE_LEDGER_KEYS.map((key) => [key, asNumber(record[key], `${path}.${key}`)]),
  ) as unknown as ResourceLedgerValues
}

const parsePartialValues = (
  value: unknown,
  path: string,
): Readonly<Partial<ResourceLedgerValues>> => {
  const record = asRecord(value, path)
  return Object.fromEntries(
    RESOURCE_LEDGER_KEYS.filter((key) => typeof record[key] !== 'undefined').map((key) => [
      key,
      asNumber(record[key], `${path}.${key}`),
    ]),
  )
}

const parseInventorySnapshot = (value: unknown, path: string): ResourceInventorySnapshot => {
  const record = asRecord(value, path)
  return {
    hour: asNumber(record.hour, `${path}.hour`),
    values: parsePartialValues(record.values, `${path}.values`),
  }
}

export const parseKC3ResourceLedgerSnapshot = (value: unknown): ResourceLedgerSnapshot => {
  const record = asRecord(value, 'snapshot')
  return {
    generatedAt: asString(record.generatedAt, 'snapshot.generatedAt'),
    current: parseValues(record.current, 'snapshot.current'),
    startHour: asNumber(record.startHour, 'snapshot.startHour'),
    endHourExclusive: asNumber(record.endHourExclusive, 'snapshot.endHourExclusive'),
    currentHour: asNumber(record.currentHour, 'snapshot.currentHour'),
    records: asArray(record.records, 'snapshot.records').map((item, index) => {
      const raw = asRecord(item, `snapshot.records[${index}]`)
      return {
        hour: asNumber(raw.hour, `snapshot.records[${index}].hour`),
        type: asString(raw.type, `snapshot.records[${index}].type`),
        data: asArray(raw.data, `snapshot.records[${index}].data`).map((entry, itemIndex) =>
          asNumber(entry, `snapshot.records[${index}].data[${itemIndex}]`),
        ),
      }
    }),
    materialSnapshots: asArray(record.materialSnapshots, 'snapshot.materialSnapshots').map(
      (item, index) => parseInventorySnapshot(item, `snapshot.materialSnapshots[${index}]`),
    ),
    consumableSnapshots: asArray(record.consumableSnapshots, 'snapshot.consumableSnapshots').map(
      (item, index) => parseInventorySnapshot(item, `snapshot.consumableSnapshots[${index}]`),
    ),
  }
}

const sourceCategory = (type: string): string => {
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

export const summarizeResourceLedger = ({
  snapshot,
  range,
  now,
}: {
  readonly snapshot: ResourceLedgerSnapshot
  readonly range: ResourceLedgerRange
  readonly now: number
}): ResourceLedgerSummary => {
  const hourly = new Map<
    number,
    {
      hour: number
      gained: Record<ResourceLedgerKey, number>
      spent: Record<ResourceLedgerKey, number>
      net: Record<ResourceLedgerKey, number>
    }
  >()
  for (let hour = snapshot.startHour; hour < snapshot.endHourExclusive; hour += 1) {
    hourly.set(hour, { hour, gained: emptyValues(), spent: emptyValues(), net: emptyValues() })
  }

  snapshot.records.forEach((record) => {
    const bucket = hourly.get(record.hour)
    if (!bucket) return
    RESOURCE_LEDGER_KEYS.forEach((key) => {
      const value = Number(record.data[RESOURCE_INDEXES[key]]) || 0
      if (value > 0) bucket.gained[key] += value
      if (value < 0) bucket.spent[key] += Math.abs(value)
      bucket.net[key] += value
    })
  })

  const summary = Object.fromEntries(
    RESOURCE_LEDGER_KEYS.map((key) => {
      const values = [...hourly.values()].reduce(
        (total, item) => ({
          gained: total.gained + item.gained[key],
          spent: total.spent + item.spent[key],
          net: total.net + item.net[key],
        }),
        { gained: 0, spent: 0, net: 0 },
      )
      return [key, { ...values, current: snapshot.current[key] }]
    }),
  ) as ResourceLedgerSummary['summary']

  const sourceMap = new Map<
    string,
    {
      key: string
      entryCount: number
      gained: Record<ResourceLedgerKey, number>
      spent: Record<ResourceLedgerKey, number>
      net: Record<ResourceLedgerKey, number>
    }
  >()
  snapshot.records.forEach((record) => {
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
    if (!source) return
    source.entryCount += 1
    RESOURCE_LEDGER_KEYS.forEach((resourceKey) => {
      const value = Number(record.data[RESOURCE_INDEXES[resourceKey]]) || 0
      if (value > 0) source.gained[resourceKey] += value
      if (value < 0) source.spent[resourceKey] += Math.abs(value)
      source.net[resourceKey] += value
    })
  })

  const materialSnapshots = [...snapshot.materialSnapshots].sort(
    (left, right) => left.hour - right.hour,
  )
  const consumableSnapshots = [...snapshot.consumableSnapshots].sort(
    (left, right) => left.hour - right.hour,
  )
  const snapshotValues = emptyNullableValues()
  let materialIndex = 0
  let consumableIndex = 0
  const inventoryHours: { hour: number; values: NullableResourceLedgerValues }[] = []
  for (let hour = snapshot.startHour; hour < snapshot.endHourExclusive; hour += 1) {
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
    if (hour === snapshot.currentHour && range !== 'yesterday') {
      Object.assign(snapshotValues, snapshot.current)
    }
    inventoryHours.push({ hour, values: { ...snapshotValues } })
  }

  const hourFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const labelForHour = (hour: number): string => hourFormatter.format(new Date(hour * HOUR_MS))

  return {
    generatedAt: new Date(now).toISOString(),
    entryCount: snapshot.records.length,
    range: {
      key: range,
      start: new Date(snapshot.startHour * HOUR_MS).toISOString(),
      end: new Date(snapshot.endHourExclusive * HOUR_MS).toISOString(),
      timeZone: 'Asia/Tokyo',
    },
    summary,
    sources: [...sourceMap.values()],
    hours: [...hourly.values()].map((item) => ({ ...item, label: labelForHour(item.hour) })),
    inventoryHours: inventoryHours.map((item) => ({
      ...item,
      label: labelForHour(item.hour),
    })),
  }
}
