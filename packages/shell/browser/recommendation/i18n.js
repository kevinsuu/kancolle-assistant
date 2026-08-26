import { en } from './i18n/en'
import { jp } from './i18n/jp'
import { scn } from './i18n/scn'
import { tcn } from './i18n/tcn'

const DEFAULT_LANGUAGE = 'en'

const languageAliases = {
  en: 'en',
  jp: 'jp',
  ja: 'jp',
  scn: 'scn',
  'zh-cn': 'scn',
  'zh-hans': 'scn',
  tcn: 'tcn',
  'tcn-yue': 'tcn',
  'zh-tw': 'tcn',
  'zh-hant': 'tcn',
  'zh-hk': 'tcn',
}

const catalogs = { en, tcn: { ...en, ...tcn }, scn: { ...en, ...scn }, jp: { ...en, ...jp } }

const readConfiguredLanguage = () => {
  try {
    const key = window.ConfigManager?.keyName?.() || 'config'
    const stored = JSON.parse(window.localStorage.getItem(key) || '{}')
    if (typeof stored.language === 'string') return stored.language
  } catch {
    // Fall through to KC3's in-memory configuration and document locale.
  }
  return window.ConfigManager?.language || document.documentElement?.lang || DEFAULT_LANGUAGE
}

export const getStrategyRoomLanguage = () => {
  const configured = String(readConfiguredLanguage()).toLowerCase()
  return languageAliases[configured] || DEFAULT_LANGUAGE
}

export const getStrategyRoomLocale = () => {
  const configured = String(readConfiguredLanguage())
  if (typeof window.KC3Translation?.getLocale === 'function') {
    return window.KC3Translation.getLocale(configured)
  }
  return { en: 'en', tcn: 'zh-Hant', scn: 'zh-Hans-CN', jp: 'ja' }[getStrategyRoomLanguage()]
}

const interpolate = (message, values) =>
  String(message).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  )

export const createStrategyRoomI18n = () => {
  const language = getStrategyRoomLanguage()
  const messages = catalogs[language]
  const t = (key, values = {}) => interpolate(messages[key] ?? en[key] ?? key, values)
  return {
    language,
    locale: getStrategyRoomLocale(),
    t,
    translateMessage: (item, fallbackKey) => {
      const key = item?.code ? `message.${item.code}` : fallbackKey
      const translated = key ? (messages[key] ?? en[key]) : undefined
      const values = { ...(item?.values || {}) }
      if (typeof values.resource === 'string') {
        const resourceKey = `common.${values.resource}`
        if (messages[resourceKey] || en[resourceKey]) values.resourceLabel = t(resourceKey)
      }
      if (item?.code === 'EXTERNAL_COMBAT_SETUP_REQUIRED' && typeof values.tags === 'string') {
        values.tags = values.tags
          .split(/,\s*/)
          .map((tag) => t(`fleet.tag.${tag}`))
          .join(t('common.listSeparator'))
      }
      return translated
        ? interpolate(translated, values)
        : item?.message || (fallbackKey ? t(fallbackKey) : '')
    },
  }
}
