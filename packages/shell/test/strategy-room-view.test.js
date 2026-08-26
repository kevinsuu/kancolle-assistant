import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { en } from '../browser/recommendation/i18n/en.js'
import { jp } from '../browser/recommendation/i18n/jp.js'
import { scn } from '../browser/recommendation/i18n/scn.js'
import { tcn } from '../browser/recommendation/i18n/tcn.js'
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
      en: '52c764c6e061314be1c4710478104fdd9dd6cbf6f914ef4a86ed2832ebb68b25',
      jp: '92b29e67f5b59b26c3f495c206fe2b9ca20a22454635586625efd9562a95f8d6',
      scn: '18b183240591a63427c12ba5587a719394939fc905defcf961231f8a8e493fac',
      tcn: 'e61ce3fc1a30eb3754f21219a2ad05fd25306ec5c06c3a52d04611e70627e049',
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
    ].forEach((key) => assert.equal(typeof catalog[key], 'string', key))
  })
})
