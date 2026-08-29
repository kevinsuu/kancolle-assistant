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
export type ResourceLedgerGranularity = 'minute' | 'fiveMinute' | 'thirtyMinute' | 'hourly'
export type ResourceLedgerValues = Readonly<Record<ResourceLedgerKey, number>>
export type NullableResourceLedgerValues = Readonly<Record<ResourceLedgerKey, number | null>>

export interface ResourceLedgerRecord {
  readonly hour: number
  readonly minute?: number
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
  readonly startMinute: number
  readonly endMinuteExclusive: number
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
  readonly granularity: {
    readonly key: ResourceLedgerGranularity
    readonly minutes: number
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
    readonly startMinute: number
    readonly endMinuteExclusive: number
    readonly values: NullableResourceLedgerValues
    readonly label: string
  }[]
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * 60 * 1000
const JST_OFFSET_MS = 9 * HOUR_MS
const GRANULARITY_MINUTES: Readonly<Record<ResourceLedgerGranularity, number>> = {
  minute: 1,
  fiveMinute: 5,
  thirtyMinute: 30,
  hourly: 60,
}
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

const asOptionalNumber = (value: unknown, path: string): number | undefined =>
  typeof value === 'undefined' ? undefined : asNumber(value, path)

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
        minute: asOptionalNumber(raw.minute, `snapshot.records[${index}].minute`),
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

export const normalizeResourceLedgerGranularity = (
  value: unknown,
): ResourceLedgerGranularity | null => {
  if (
    value === 'minute' ||
    value === 'fiveMinute' ||
    value === 'thirtyMinute' ||
    value === 'hourly'
  ) {
    return value
  }
  return null
}

export const summarizeResourceLedger = ({
  snapshot,
  range,
  now,
  granularity = 'hourly',
}: {
  readonly snapshot: ResourceLedgerSnapshot
  readonly range: ResourceLedgerRange
  readonly now: number
  readonly granularity?: ResourceLedgerGranularity
}): ResourceLedgerSummary => {
  const normalizedGranularity = normalizeResourceLedgerGranularity(granularity) || 'hourly'
  const bucketMinutes = GRANULARITY_MINUTES[normalizedGranularity]
  const startMinute = snapshot.startHour * 60
  const hourlyEndMinute = snapshot.endHourExclusive * 60
  const currentMinute = Math.floor(now / MINUTE_MS)
  const endMinuteExclusive =
    normalizedGranularity === 'hourly' || range === 'yesterday'
      ? hourlyEndMinute
      : Math.min(hourlyEndMinute, currentMinute + 1)
  const buckets = new Map<
    number,
    {
      hour: number
      startMinute: number
      endMinuteExclusive: number
      gained: Record<ResourceLedgerKey, number>
      spent: Record<ResourceLedgerKey, number>
      net: Record<ResourceLedgerKey, number>
    }
  >()
  for (let minute = startMinute; minute < endMinuteExclusive; minute += bucketMinutes) {
    buckets.set(minute, {
      hour: Math.floor(minute / 60),
      startMinute: minute,
      endMinuteExclusive: Math.min(minute + bucketMinutes, endMinuteExclusive),
      gained: emptyValues(),
      spent: emptyValues(),
      net: emptyValues(),
    })
  }

  const bucketStartForRecord = (record: ResourceLedgerRecord): number | null => {
    const recordMinute =
      typeof record.minute === 'number' && Number.isFinite(record.minute)
        ? record.minute
        : record.hour * 60
    if (recordMinute < startMinute || recordMinute >= endMinuteExclusive) return null
    return startMinute + Math.floor((recordMinute - startMinute) / bucketMinutes) * bucketMinutes
  }

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
  const summaryTotals = Object.fromEntries(
    RESOURCE_LEDGER_KEYS.map((key) => [key, { gained: 0, spent: 0, net: 0 }]),
  ) as Record<ResourceLedgerKey, { gained: number; spent: number; net: number }>
  let visibleEntryCount = 0

  snapshot.records.forEach((record) => {
    const bucketStart = bucketStartForRecord(record)
    if (bucketStart === null) return
    const bucket = buckets.get(bucketStart)
    if (!bucket) return
    visibleEntryCount += 1

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
      if (value > 0) bucket.gained[resourceKey] += value
      if (value < 0) bucket.spent[resourceKey] += Math.abs(value)
      bucket.net[resourceKey] += value
      if (value > 0) summaryTotals[resourceKey].gained += value
      if (value < 0) summaryTotals[resourceKey].spent += Math.abs(value)
      summaryTotals[resourceKey].net += value
    })
  })

  const summary = Object.fromEntries(
    RESOURCE_LEDGER_KEYS.map((key) => [
      key,
      { ...summaryTotals[key], current: snapshot.current[key] },
    ]),
  ) as ResourceLedgerSummary['summary']

  const materialSnapshots = [...snapshot.materialSnapshots].sort(
    (left, right) => left.hour - right.hour,
  )
  const consumableSnapshots = [...snapshot.consumableSnapshots].sort(
    (left, right) => left.hour - right.hour,
  )
  const snapshotValues = emptyNullableValues()
  let materialIndex = 0
  let consumableIndex = 0
  const inventoryHours: {
    hour: number
    startMinute: number
    endMinuteExclusive: number
    values: NullableResourceLedgerValues
  }[] = []
  for (const bucket of buckets.values()) {
    while (
      materialIndex < materialSnapshots.length &&
      materialSnapshots[materialIndex].hour * 60 <= bucket.startMinute
    ) {
      Object.assign(snapshotValues, materialSnapshots[materialIndex].values)
      materialIndex += 1
    }
    while (
      consumableIndex < consumableSnapshots.length &&
      consumableSnapshots[consumableIndex].hour * 60 <= bucket.startMinute
    ) {
      Object.assign(snapshotValues, consumableSnapshots[consumableIndex].values)
      consumableIndex += 1
    }
    if (
      range !== 'yesterday' &&
      bucket.startMinute <= currentMinute &&
      currentMinute < bucket.endMinuteExclusive
    ) {
      Object.assign(snapshotValues, snapshot.current)
    }
    inventoryHours.push({ ...bucket, values: { ...snapshotValues } })
  }

  const hourFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  const minuteFormatter = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const labelForHour = (hour: number): string => hourFormatter.format(new Date(hour * HOUR_MS))
  const labelForMinute = (minute: number): string =>
    minuteFormatter.format(new Date(minute * MINUTE_MS))
  const labelForBucket = (bucket: { hour: number; startMinute: number }): string =>
    normalizedGranularity === 'hourly'
      ? labelForHour(bucket.hour)
      : labelForMinute(bucket.startMinute)

  return {
    generatedAt: new Date(now).toISOString(),
    entryCount: visibleEntryCount,
    range: {
      key: range,
      start: new Date(snapshot.startHour * HOUR_MS).toISOString(),
      end: new Date(snapshot.endHourExclusive * HOUR_MS).toISOString(),
      timeZone: 'Asia/Tokyo',
    },
    granularity: { key: normalizedGranularity, minutes: bucketMinutes },
    summary,
    sources: [...sourceMap.values()],
    hours: [...buckets.values()].map((item) => ({ ...item, label: labelForBucket(item) })),
    inventoryHours: inventoryHours.map((item) => ({
      ...item,
      label: labelForBucket(item),
    })),
  }
}
