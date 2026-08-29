const assert = require('node:assert/strict')
const test = require('node:test')
const {
  getResourceLedgerWindow,
  parseKC3ResourceLedgerSnapshot,
  summarizeResourceLedger,
} = require('../dist/index.js')

const HOUR_MS = 60 * 60 * 1000
const NOW = Date.parse('2026-08-24T17:15:00.000Z')
const TODAY_START_HOUR = Math.floor(Date.parse('2026-08-24T15:00:00.000Z') / HOUR_MS)
const values = (overrides = {}) => ({
  fuel: 0,
  ammo: 0,
  steel: 0,
  bauxite: 0,
  torch: 0,
  bucket: 0,
  devmat: 0,
  screws: 0,
  ...overrides,
})

test('calculates today, yesterday, and rolling 24-hour JST windows', () => {
  assert.deepEqual(getResourceLedgerWindow('today', NOW), {
    currentHour: Math.floor(NOW / HOUR_MS),
    startHour: TODAY_START_HOUR,
    endHourExclusive: Math.floor(NOW / HOUR_MS) + 1,
  })
  assert.deepEqual(getResourceLedgerWindow('yesterday', NOW), {
    currentHour: Math.floor(NOW / HOUR_MS),
    startHour: TODAY_START_HOUR - 24,
    endHourExclusive: TODAY_START_HOUR,
  })
  assert.deepEqual(getResourceLedgerWindow('rolling24', NOW), {
    currentHour: Math.floor(NOW / HOUR_MS),
    startHour: Math.floor(NOW / HOUR_MS) + 1 - 24,
    endHourExclusive: Math.floor(NOW / HOUR_MS) + 1,
  })
})

test('summarizes sources and carries inventory snapshots forward', () => {
  const window = getResourceLedgerWindow('today', NOW)
  const data = (index, value) => {
    const result = Array.from({ length: 8 }, () => 0)
    result[index] = value
    return result
  }
  const snapshot = parseKC3ResourceLedgerSnapshot({
    generatedAt: new Date(NOW).toISOString(),
    ...window,
    current: values({ fuel: 1000, bucket: 21 }),
    records: [
      { hour: window.startHour, type: 'exped-return', data: data(0, 10) },
      { hour: window.startHour + 1, type: 'repair-dock', data: data(5, -2) },
      { hour: window.startHour + 1, type: 'crship', data: data(1, -4) },
      { hour: window.startHour + 1, type: 'unknown', data: data(2, 5) },
    ],
    materialSnapshots: [{ hour: window.startHour - 1, values: values({ fuel: 900 }) }],
    consumableSnapshots: [{ hour: window.startHour - 1, values: { bucket: 20 } }],
  })
  const result = summarizeResourceLedger({ snapshot, range: 'today', now: NOW })

  assert.deepEqual(result.summary.fuel, { gained: 10, spent: 0, net: 10, current: 1000 })
  assert.deepEqual(result.summary.bucket, { gained: 0, spent: 2, net: -2, current: 21 })
  assert.deepEqual(
    result.sources.map(({ key, entryCount }) => ({ key, entryCount })),
    [
      { key: 'expedition', entryCount: 1 },
      { key: 'repair', entryCount: 1 },
      { key: 'arsenal', entryCount: 1 },
      { key: 'other', entryCount: 1 },
    ],
  )
  assert.equal(result.inventoryHours[0].values.fuel, 900)
  assert.equal(result.inventoryHours[0].values.bucket, 20)
  assert.equal(result.inventoryHours.at(-1).values.fuel, 1000)
  assert.equal(result.inventoryHours.at(-1).values.bucket, 21)
})

test('summarizes records into minute, five-minute, and thirty-minute buckets', () => {
  const window = getResourceLedgerWindow('today', NOW)
  const startMinute = window.startHour * 60
  const data = (index, value) => {
    const result = Array.from({ length: 8 }, () => 0)
    result[index] = value
    return result
  }
  const snapshot = parseKC3ResourceLedgerSnapshot({
    generatedAt: new Date(NOW).toISOString(),
    ...window,
    current: values({ fuel: 1000 }),
    records: [
      { hour: window.startHour, minute: startMinute + 1, type: 'exped-return', data: data(0, 10) },
      { hour: window.startHour, minute: startMinute + 4, type: 'quest', data: data(0, 2) },
      { hour: window.startHour, minute: startMinute + 5, type: 'repair-dock', data: data(0, -3) },
      { hour: window.startHour, minute: startMinute + 31, type: 'quest', data: data(0, 7) },
    ],
    materialSnapshots: [],
    consumableSnapshots: [],
  })

  const byMinute = summarizeResourceLedger({
    snapshot,
    range: 'today',
    now: NOW,
    granularity: 'minute',
  })
  assert.equal(byMinute.granularity.minutes, 1)
  assert.equal(byMinute.hours[1].gained.fuel, 10)
  assert.equal(byMinute.hours[4].gained.fuel, 2)
  assert.equal(byMinute.hours[5].spent.fuel, 3)

  const byFiveMinutes = summarizeResourceLedger({
    snapshot,
    range: 'today',
    now: NOW,
    granularity: 'fiveMinute',
  })
  assert.equal(byFiveMinutes.granularity.minutes, 5)
  assert.equal(byFiveMinutes.hours[0].gained.fuel, 12)
  assert.equal(byFiveMinutes.hours[1].spent.fuel, 3)
  assert.equal(byFiveMinutes.hours[6].gained.fuel, 7)

  const byThirtyMinutes = summarizeResourceLedger({
    snapshot,
    range: 'today',
    now: NOW,
    granularity: 'thirtyMinute',
  })
  assert.equal(byThirtyMinutes.granularity.minutes, 30)
  assert.equal(byThirtyMinutes.hours[0].gained.fuel, 12)
  assert.equal(byThirtyMinutes.hours[0].spent.fuel, 3)
  assert.equal(byThirtyMinutes.hours[1].gained.fuel, 7)
})
