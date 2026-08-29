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
  movePriorityResourceOrder,
  plannerMarkup,
  styles as expeditionStyles,
} from '../browser/recommendation/views/expedition-goal-view.js'
import {
  panelMarkup as fleetMarkup,
  styles as fleetStyles,
} from '../browser/recommendation/views/fleet-recommender-view.js'
import { localizedRouteDescription } from '../browser/recommendation/strategy-room-ui.js'
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
  const weightResources = [
    { key: 'bucket', color: '#3b9d91' },
    ...['fuel', 'bauxite', 'ammo', 'steel'].map((key) =>
      EXPEDITION_RESOURCES.find((resource) => resource.key === key),
    ),
  ]
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
      en: 'daf3412d9b2009ea4863ba742e39d9ff79e73b4e684912ae01bdb8f927f62690',
      jp: '4d7f94bd0d5e61e99b4811f7eebf55bdd3ccd42006a85521ccd290e5c1929fb9',
      scn: 'c0e2b5af8bc8e39d52bab40595eddb722565bc89a6c23bd7af73ed9be7c9a0d8',
      tcn: 'ad27a5ea665a566a5a52b0dfd66110dbffb82684f26ffbb28d6f3db3e63a8fde',
    },
  )
})

test('expedition preference view uses unique priority controls', () => {
  const weightResources = [
    { key: 'bucket', color: '#3b9d91' },
    ...['fuel', 'bauxite', 'ammo', 'steel'].map((key) =>
      EXPEDITION_RESOURCES.find((resource) => resource.key === key),
    ),
  ]
  const markup = plannerMarkup(translator('tcn'), EXPEDITION_RESOURCES, weightResources, [
    [[1, '01', '00:15']],
  ])

  assert.match(markup, /data-resource-mode="fuel"/)
  assert.match(markup, /data-resource-priority="fuel"/)
  assert.match(markup, /<option value="constraint">至少不虧<\/option>/)
  assert.match(markup, /<option value="ignore">不考慮<\/option>/)
  assert.doesNotMatch(markup, /data-resource-weight/)
})

test('priority order movement keeps ranks unique and continuous', () => {
  const moved = movePriorityResourceOrder(
    ['bucket', 'fuel', 'bauxite', 'ammo', 'steel'],
    'steel',
    0,
  )

  assert.deepEqual(moved, ['steel', 'bucket', 'fuel', 'bauxite', 'ammo'])
})

test('fleet recommender view uses guide selection without an objective control', () => {
  const markup = fleetMarkup(translator('tcn'))
  assert.match(markup, /id="dfr-route-select"/)
  assert.doesNotMatch(markup, /dfr-objective/)
})

test('fleet route descriptions use localized copy with source fallback', () => {
  assert.equal(
    localizedRouteDescription(
      { id: '5-5-south-dd', description: '軽巡1、雷巡1、駆逐4。' },
      translator('tcn'),
    ).startsWith('輕巡1、雷巡1、驅逐4。'),
    true,
  )
  assert.match(
    localizedRouteDescription(
      { id: '4-5-kcwiki-fast-plus-special-attack', description: 'source description' },
      translator('tcn'),
    ),
    /Nelson.*1／3／5.*H 點選複縱陣/,
  )
  assert.equal(
    localizedRouteDescription(
      { id: 'fixture-missing', description: 'source description' },
      translator('tcn'),
    ),
    'source description',
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
  assert.match(fleetStyles, /\.dfr-source-list/)
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

test('fleet recommendation labels exist in all supported languages', () => {
  Object.values(catalogs).forEach((catalog) => {
    ;[
      'fleet.baseSpeed',
      'fleet.speedTransition',
      'fleet.fleetSpeed',
      'fleet.speed.slow',
      'fleet.speed.fast',
      'fleet.speed.fast+',
      'fleet.speed.fastest',
      'fleet.sourceCount',
      'fleet.noSources',
      'fleet.strategyGuide',
      'fleet.strategyShips',
      'fleet.strategyEquipment',
      'fleet.strategyNotes',
      'fleet.strategyRoute',
      'fleet.strategySpeed',
      'fleet.strategyAirPower',
      'fleet.strategyLos',
      'fleet.strategyOpeningAsw',
      'fleet.strategyResourceGain',
      'fleet.strategyMinimumValue',
      'fleet.strategyResourceValue',
      'fleet.strategyNoDescription',
      'fleet.routeUnknown',
      'fleet.role.torpedo-cruiser',
      'fleet.noSolutionForRoute',
      'fleet.objective.resource-burner',
      'fleet.manualSetup',
      'message.NO_AUTOMATED_ROUTE',
      'message.NO_STABLE_ROUTE',
      'message.OASW_INSUFFICIENT',
      'message.OASW_REQUIREMENT_PASSED',
      'message.ANTI_INSTALLATION_REQUIREMENT_PASSED',
      'message.ANTI_INSTALLATION_EQUIPMENT_INSUFFICIENT',
      'message.ANTI_INSTALLATION_CARRIER_READY',
      'message.ANTI_INSTALLATION_CARRIER_AIRCRAFT_INSUFFICIENT',
      'message.DRUM_CANISTER_REQUIREMENT_PASSED',
      'message.DRUM_CANISTER_EQUIPMENT_INSUFFICIENT',
      'message.KC3_COMBAT_EVALUATION_APPLIED',
      'message.SPECIAL_ATTACK_READY',
      'message.SPECIAL_ATTACK_SORTIE_CHECK',
      'message.SPECIAL_ATTACK_UNAVAILABLE',
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
    'expedition.weightTooltip',
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
