import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { en } from '../browser/recommendation/i18n/en.js'
import { jp } from '../browser/recommendation/i18n/jp.js'
import { scn } from '../browser/recommendation/i18n/scn.js'
import { tcn } from '../browser/recommendation/i18n/tcn.js'
import {
  applyDailyImprovementCategoryFilter,
  applyDefaultDailyImprovementFilter,
  collectDailyImprovementCategories,
  getDailyImprovementEquipmentType,
  isDailyImprovementEquipmentAvailable,
} from '../browser/recommendation/daily-improvement-ui.js'
import {
  createStrategyRoomI18n,
  getStrategyRoomLanguage,
  getStrategyRoomLocale,
} from '../browser/recommendation/i18n.js'
import { EXPEDITION_RESOURCES } from '../browser/recommendation/resource-metadata.js'
import {
  plannerMarkup,
  styles as expeditionStyles,
} from '../browser/recommendation/views/expedition-goal-view.js'
import {
  panelMarkup as fleetMarkup,
  styles as fleetStyles,
} from '../browser/recommendation/views/fleet-recommender-view.js'
import {
  recentSectionMarkup,
  styles as recentStyles,
} from '../browser/recommendation/views/recent-tabs-view.js'
import {
  panelMarkup as resourceCenterMarkup,
  styles as resourceCenterStyles,
} from '../browser/recommendation/views/resource-center-view.js'
import {
  markup as resourceLedgerMarkup,
  styles as resourceLedgerStyles,
} from '../browser/recommendation/views/resource-ledger-view.js'

const interpolate = (message, values) =>
  String(message).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  )

const catalogs = {
  en,
  jp: { ...en, ...jp },
  scn: { ...en, ...scn },
  tcn: { ...en, ...tcn },
}

const translator =
  (language) =>
  (key, values = {}) =>
    interpolate(catalogs[language][key] ?? en[key] ?? key, values)

const viewSnapshot = (language) => {
  const t = translator(language)
  const weightResources = ['fuel', 'steel', 'ammo', 'bauxite'].map((key) =>
    EXPEDITION_RESOURCES.find((resource) => resource.key === key),
  )
  const output = [
    fleetMarkup(t),
    plannerMarkup(t, EXPEDITION_RESOURCES, weightResources, [[[1, '01', '00:15']]]),
    resourceCenterMarkup(t),
    resourceLedgerMarkup(t),
    recentSectionMarkup(t),
  ].join('\n---view---\n')
  return createHash('sha256').update(output).digest('hex')
}

test('strategy room pure views preserve four-language output snapshots', () => {
  assert.deepEqual(
    Object.fromEntries(Object.keys(catalogs).map((language) => [language, viewSnapshot(language)])),
    {
      en: '12ab915b306cb96a9bfffdbb980b9703976cce7c777bec72ec58e04cb98f7eb3',
      jp: '067fae1ae371a0bc5bf73a07540d6bfc2ce44744dd9af0a46d57e3d0408908ad',
      scn: 'feab33b29b46ebd9cd4786705e625532ffd99d7139a81b360553909aa6d185d8',
      tcn: '5267562af9d6416aeeb4c3fee936840c01e4aeb108ec2c1964d2938026a8aa2e',
    },
  )
})

test('strategy room styles retain light, dark, selector, and layout contracts', () => {
  const styleSheets = [
    expeditionStyles,
    fleetStyles,
    recentStyles,
    resourceCenterStyles,
    resourceLedgerStyles,
  ]
  styleSheets.forEach((styles) => {
    assert.match(styles, /body\.dark/)
    assert.match(styles, /body:not\(\.dark\)/)
  })
  assert.match(fleetStyles, /\.dfr-root \{\s*width: 700px;/)
  assert.match(fleetStyles, /\.dfr-button\.is-loading:disabled/)
  assert.match(fleetStyles, /@keyframes dfr-route-spin/)
  assert.match(expeditionStyles, /\.dep-root \{ width: 680px;/)
  assert.match(resourceCenterStyles, /\.drc-root \{ width: 700px;/)
})

test('strategy room i18n preserves aliases, fallback, interpolation, and KC3 locale', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = {
    ConfigManager: { keyName: () => 'fixture-config', language: 'en' },
    KC3Translation: { getLocale: (language) => `kc3:${language}` },
    localStorage: { getItem: () => JSON.stringify({ language: 'zh-TW' }) },
  }
  globalThis.document = { documentElement: { lang: 'en' } }
  try {
    assert.equal(getStrategyRoomLanguage(), 'tcn')
    assert.equal(getStrategyRoomLocale(), 'kc3:zh-TW')
    const i18n = createStrategyRoomI18n()
    assert.equal(i18n.t('fixture.unknown-key'), 'fixture.unknown-key')
    assert.equal(i18n.t('common.minimum', { value: 42 }).includes('42'), true)
    assert.equal(
      i18n
        .translateMessage({
          code: 'EXTERNAL_COMBAT_SETUP_REQUIRED',
          values: { tags: 'lbas, smoke-screen' },
        })
        .includes(i18n.t('fleet.tag.lbas')),
      true,
    )
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})

test('fleet speed and torpedo-cruiser labels exist in all supported languages', () => {
  Object.values(catalogs).forEach((catalog) => {
    ;[
      'fleet.baseSpeed',
      'fleet.fleetSpeed',
      'fleet.speed.slow',
      'fleet.speed.fast',
      'fleet.speed.fast+',
      'fleet.speed.fastest',
      'fleet.role.torpedo-cruiser',
      'fleet.manualSetup',
      'message.NO_AUTOMATED_ROUTE',
      'message.NO_STABLE_ROUTE',
      'message.OASW_INSUFFICIENT',
      'message.OASW_REQUIREMENT_PASSED',
      'message.ANTI_INSTALLATION_REQUIREMENT_PASSED',
      'message.ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
    ].forEach((key) => assert.equal(typeof catalog[key], 'string', key))
  })
})

test('expedition status safeguards exist in all supported languages', () => {
  const keys = [
    'expedition.syncComplete',
    'expedition.candidateUnlockWarning',
    'expedition.state.returned',
    'expedition.state.returnedAction',
    'expedition.perHourAfterDispatch',
    'expedition.supplyAfterReturn',
  ]
  ;[en, jp, scn, tcn].forEach((catalog) => {
    keys.forEach((key) => assert.equal(typeof catalog[key], 'string', key))
  })
})

test('daily improvement filter applies once per rendered KC3 toggle button', () => {
  let clickCount = 0
  const button = { click: () => clickCount++ }
  const equipmentList = { querySelector: () => ({}) }
  const root = {
    querySelector: (selector) => (selector.includes('disabled_toggle') ? button : equipmentList),
  }
  const filteredButtons = new WeakSet()

  assert.equal(applyDefaultDailyImprovementFilter(root, filteredButtons), true)
  assert.equal(applyDefaultDailyImprovementFilter(root, filteredButtons), false)
  assert.equal(clickCount, 1)
})

test('daily improvement filter waits for KC3 to render filterable equipment', () => {
  let clickCount = 0
  const root = {
    querySelector: (selector) =>
      selector.includes('disabled_toggle')
        ? { click: () => clickCount++ }
        : { querySelector: () => null },
  }

  assert.equal(applyDefaultDailyImprovementFilter(root), false)
  assert.equal(clickCount, 0)
})

test('daily improvement category filter combines with KC3 row visibility classes', () => {
  const createEquipment = (type) => {
    const classes = new Set(['equipment', 'disabled'])
    return {
      classList: {
        contains: (name) => classes.has(name),
        toggle: (name, active) => (active ? classes.add(name) : classes.delete(name)),
      },
      querySelector: () => ({ dataset: { item_type3: type } }),
    }
  }
  const mainGun = createEquipment('1')
  const torpedo = createEquipment('5')

  applyDailyImprovementCategoryFilter([mainGun, torpedo], '1')

  assert.equal(getDailyImprovementEquipmentType(mainGun), '1')
  assert.equal(mainGun.classList.contains('kca-equipment-category-hidden'), false)
  assert.equal(mainGun.classList.contains('disabled'), true)
  assert.equal(torpedo.classList.contains('kca-equipment-category-hidden'), true)

  applyDailyImprovementCategoryFilter([mainGun, torpedo], 'all')
  assert.equal(torpedo.classList.contains('kca-equipment-category-hidden'), false)
})

test('daily improvement category filter ignores rows without a numeric KC3 icon type', () => {
  const equipment = {
    querySelector: () => ({ dataset: { item_type3: 'unknown' } }),
  }

  assert.equal(getDailyImprovementEquipmentType(equipment), null)
})

test('daily improvement categories only include rows KC3 marks as improvable', () => {
  const createEquipment = (type, unavailable = false) => ({
    matches: () => unavailable,
    querySelector: (selector) =>
      selector === '.eq_name'
        ? { dataset: { item_type3: type }, textContent: `Equipment ${type}` }
        : { getAttribute: () => `/items/${type}.png` },
  })
  const categories = collectDailyImprovementCategories([
    createEquipment('1'),
    createEquipment('5', true),
    createEquipment('1'),
    createEquipment('8', true),
  ])

  assert.equal(isDailyImprovementEquipmentAvailable(createEquipment('5', true)), false)
  assert.deepEqual(categories, [{ type: '1', name: 'Equipment 1', icon: '/items/1.png', count: 2 }])
})
