import { RESOURCE_LEDGER_SUMMARY_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import { LEDGER_RESOURCES } from './resource-metadata'
import { formatLocalizedDate, formatLocalizedNumber } from './strategy-room-format'
import { markup, styles } from './views/resource-ledger-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const resources = LEDGER_RESOURCES

const resourceLabel = (resource) => t(`common.${resource.key}`)
const metricLabel = (metric) => t(`common.${metric}`)
const formatNumber = (value) => formatLocalizedNumber(value, locale)
const formatMetric = (value, metric) => {
  const number = Number(value || 0)
  if (metric !== 'net' || number === 0) return formatNumber(number)
  return `${number > 0 ? '+' : '−'}${formatNumber(Math.abs(number))}`
}
const formatTime = (value) =>
  formatLocalizedDate(value, locale, {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const hourlyBars = (resource, data, metric) => {
  const values = data.hours.map((hour) => Number(hour[metric]?.[resource.key]) || 0)
  const maximum = Math.max(1, ...values.map(Math.abs))
  return values
    .map((value, index) => {
      const size = value === 0 ? 1 : Math.max(8, Math.round((Math.abs(value) / maximum) * 100))
      const sign = value < 0 ? 'negative' : value === 0 ? 'zero' : 'positive'
      const title = t('ledger.hourTooltip', {
        hour: data.hours[index].label,
        metric: metricLabel(metric),
        value: formatMetric(value, metric),
      })
      return `<span class="drl-bar ${sign}" title="${title}"><i style="--drl-size:${size}%"></i></span>`
    })
    .join('')
}

const render = (root, data, metric) => {
  const output = root.querySelector('.drl-output')
  if (!data || data.status === 'error') {
    output.innerHTML = `<div class="drl-status error">${translateMessage(data?.error, 'resource.unavailable')}</div>`
    return
  }

  const cards = resources
    .map((resource) => {
      const values = data.summary[resource.key]
      const selected = Number(values[metric]) || 0
      const valueClass =
        metric === 'net' ? (selected > 0 ? 'positive' : selected < 0 ? 'negative' : '') : ''
      const firstHour = data.hours[0]?.label || '—'
      const lastHour = data.hours[data.hours.length - 1]?.label || '—'
      return `
        <article class="drl-card bscolor3 fcolor2" style="--drl-accent:${resource.color}">
          <div class="drl-card-head">
            <div class="drl-resource">
              <img src="../../assets/img/client/${resource.icon}" alt="">
              <strong>${resourceLabel(resource)}</strong>
            </div>
            <span class="drl-current" title="${t('ledger.currentTitle')}">${formatNumber(values.current)}</span>
          </div>
          <div class="drl-card-value">
            <span>${metricLabel(metric)}</span>
            <strong class="${valueClass}">${formatMetric(selected, metric)}</strong>
          </div>
          <div class="drl-bars" data-metric="${metric}" aria-label="${t('ledger.hourlyAria', { resource: resourceLabel(resource), metric: metricLabel(metric) })}">
            ${hourlyBars(resource, data, metric)}
          </div>
          <div class="drl-axis"><span>${firstHour}</span><span>${lastHour}</span></div>
        </article>
      `
    })
    .join('')

  output.innerHTML = `
    <div class="drl-cards">${cards}</div>
    <div class="drl-status">
      <span>${t('ledger.status', { range: t(`common.${data.range.key}`), count: formatNumber(data.entryCount) })}</span>
      <span>${t('common.updatedAt', { time: formatTime(data.generatedAt) })}</span>
    </div>
  `
}

const mount = (tab, invoke) => {
  if (tab.querySelector('.drl-root')) return
  const graphOptions = tab.querySelector('.graph_options')
  if (!graphOptions) return

  if (!document.querySelector('#damecon-resource-ledger-styles')) {
    const style = document.createElement('style')
    style.id = 'damecon-resource-ledger-styles'
    style.textContent = styles
    document.head.appendChild(style)
  }
  graphOptions.insertAdjacentHTML('beforebegin', markup(t))

  const root = tab.querySelector('.drl-root')
  const refresh = root.querySelector('.drl-refresh')
  let range = 'today'
  let metric = 'spent'
  let data = null
  let loadSequence = 0

  const load = async ({ forceRefresh = false } = {}) => {
    const sequence = ++loadSequence
    refresh.disabled = true
    refresh.textContent = t('common.refreshing')
    root.querySelector('.drl-output').innerHTML =
      `<div class="drl-empty"><strong>${t('ledger.organizing')}</strong><span>${t('ledger.organizingDetail')}</span></div>`
    try {
      const result = await invoke(RESOURCE_LEDGER_SUMMARY_CHANNEL, { range, forceRefresh })
      if (sequence !== loadSequence) return
      data = result
    } catch {
      if (sequence !== loadSequence) return
      data = { status: 'error', error: { code: 'RESOURCE_CONNECTION_FAILED' } }
    }
    render(root, data, metric)
    if (sequence === loadSequence) {
      refresh.disabled = false
      refresh.textContent = t('common.refresh')
    }
  }

  root.querySelectorAll('[data-range]').forEach((button) => {
    button.addEventListener('click', () => {
      range = button.dataset.range
      root.querySelectorAll('[data-range]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button))
      })
      void load()
    })
  })
  root.querySelectorAll('[data-metric]').forEach((button) => {
    button.addEventListener('click', () => {
      metric = button.dataset.metric
      root.querySelectorAll('[data-metric]').forEach((item) => {
        item.setAttribute('aria-pressed', String(item === button))
      })
      render(root, data, metric)
    })
  })
  refresh.addEventListener('click', () => void load({ forceRefresh: true }))
  void load()
}

export const injectResourceLedgerSummary = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  const mountResourceTabs = (root) => {
    if (root.matches?.('.tab_resources')) mount(root, invoke)
    root.querySelectorAll?.('.tab_resources').forEach((tab) => mount(tab, invoke))
  }
  mountResourceTabs(document)
  new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach(mountResourceTabs))
  }).observe(document.body, { childList: true, subtree: true })
}
