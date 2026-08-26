import { RESOURCE_LEDGER_SUMMARY_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import { RESOURCE_CENTER_RESOURCES } from './resource-metadata'
import { escapeHtml, formatLocalizedDate, formatLocalizedNumber } from './strategy-room-format'
import { panelMarkup, styles } from './views/resource-center-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const resources = RESOURCE_CENTER_RESOURCES

const resourceLabel = (resource, short = false) =>
  t(`common.${resource.key === 'bucket' && !short ? 'bucketFull' : resource.key}`)

const formatNumber = (value) => formatLocalizedNumber(value, locale)
const formatSigned = (value) => {
  const number = Number(value || 0)
  if (number === 0) return '0'
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

const sparkline = (data, resource) => {
  const points = (data.inventoryHours || [])
    .map((hour, index) => ({ index, value: hour.values?.[resource.key] }))
    .filter((point) => Number.isFinite(point.value))
  if (points.length < 2) return ''
  const values = points.map((point) => point.value)
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const spread = Math.max(1, maximum - minimum)
  const coordinates = points.map((point) => {
    const x = points.length === 1 ? 50 : (point.index / (data.inventoryHours.length - 1)) * 100
    const y = 23 - ((point.value - minimum) / spread) * 19
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const polygon = `0,25 ${coordinates.join(' ')} 100,25`
  return `
    <svg viewBox="0 0 100 25" preserveAspectRatio="none" aria-hidden="true">
      <polygon points="${polygon}" fill="${resource.color}" opacity=".18"></polygon>
      <polyline points="${coordinates.join(' ')}" fill="none" stroke="${resource.color}" stroke-width="1.6" vector-effect="non-scaling-stroke"></polyline>
    </svg>
  `
}

const flowChart = (data, resource) => {
  const hours = data.hours || []
  const width = 650
  const height = 216
  const left = 31
  const right = 8
  const plotWidth = width - left - right
  const baseline = 103
  const halfHeight = 77
  const maximum = Math.max(
    1,
    ...hours.flatMap((hour) => [hour.gained?.[resource.key] || 0, hour.spent?.[resource.key] || 0]),
  )
  const step = hours.length > 0 ? plotWidth / hours.length : plotWidth
  const barWidth = Math.max(2, Math.min(9, step * 0.3))
  const labelEvery = Math.max(1, Math.ceil(hours.length / 6))
  const grid = [0.5, 1]
    .map((ratio) => {
      const offset = halfHeight * ratio
      return `<line class="drc-chart-grid" x1="${left}" y1="${baseline - offset}" x2="${width - right}" y2="${baseline - offset}"></line><line class="drc-chart-grid" x1="${left}" y1="${baseline + offset}" x2="${width - right}" y2="${baseline + offset}"></line>`
    })
    .join('')
  const bars = hours
    .map((hour, index) => {
      const center = left + step * index + step / 2
      const gained = Number(hour.gained?.[resource.key]) || 0
      const spent = Number(hour.spent?.[resource.key]) || 0
      const gainedHeight = (gained / maximum) * halfHeight
      const spentHeight = (spent / maximum) * halfHeight
      const label =
        index % labelEvery === 0 || index === hours.length - 1
          ? `<text class="drc-chart-label" x="${center}" y="${height - 8}" text-anchor="middle">${escapeHtml(hour.label)}</text>`
          : ''
      return `
        <g>
          <rect class="drc-chart-gain" x="${center - barWidth - 1}" y="${baseline - gainedHeight}" width="${barWidth}" height="${Math.max(gained > 0 ? 1 : 0, gainedHeight)}" rx="1"><title>${t('resource.hourGain', { hour: escapeHtml(hour.label), value: formatNumber(gained) })}</title></rect>
          <rect class="drc-chart-spend" x="${center + 1}" y="${baseline}" width="${barWidth}" height="${Math.max(spent > 0 ? 1 : 0, spentHeight)}" rx="1"><title>${t('resource.hourSpend', { hour: escapeHtml(hour.label), value: formatNumber(spent) })}</title></rect>
          ${label}
        </g>
      `
    })
    .join('')
  const empty = hours.every(
    (hour) => !(Number(hour.gained?.[resource.key]) || Number(hour.spent?.[resource.key])),
  )
    ? `<text class="drc-chart-empty" x="${left + plotWidth / 2}" y="${baseline + 4}">${t('resource.noFlow', { resource: escapeHtml(resourceLabel(resource)) })}</text>`
    : ''
  return `
    <svg class="drc-flow-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${t('resource.hourlyChart', { resource: escapeHtml(resourceLabel(resource)) })}">
      ${grid}
      <line class="drc-chart-zero" x1="${left}" y1="${baseline}" x2="${width - right}" y2="${baseline}"></line>
      <text class="drc-chart-zero-label" x="2" y="${baseline - halfHeight + 3}">+${formatNumber(maximum)}</text>
      <text class="drc-chart-zero-label" x="14" y="${baseline + 3}">0</text>
      <text class="drc-chart-zero-label" x="2" y="${baseline + halfHeight + 3}">−${formatNumber(maximum)}</text>
      ${bars}
      ${empty}
    </svg>
  `
}

const resourceCard = (data, resource, selectedResource) => {
  const values = data.summary[resource.key]
  const netClass = values.net > 0 ? 'drc-gained' : values.net < 0 ? 'drc-spent' : ''
  return `
    <button class="drc-resource-card bscolor3 fcolor2" style="--drc-accent:${resource.color}" type="button" data-resource="${resource.key}" aria-pressed="${resource.key === selectedResource}">
      <span class="drc-card-head">
        <span class="drc-card-name"><img src="../../assets/img/client/${resource.icon}" alt=""><strong>${resourceLabel(resource)}</strong></span>
        <span class="drc-card-net ${netClass}" title="${t('common.net')}">${formatSigned(values.net)}</span>
      </span>
      <span class="drc-current">${formatNumber(values.current)}</span>
      <span class="drc-current-label">${t('resource.currentInventory')}</span>
      <span class="drc-card-flow"><span class="drc-gained">↑ ${formatNumber(values.gained)}</span><span class="drc-spent">↓ ${formatNumber(values.spent)}</span></span>
      <span class="drc-card-spark">${sparkline(data, resource)}</span>
    </button>
  `
}

const sourceBreakdown = (data, resource) => {
  const sources = (data.sources || [])
    .map((source) => ({
      ...source,
      resourceGained: Number(source.gained?.[resource.key]) || 0,
      resourceSpent: Number(source.spent?.[resource.key]) || 0,
    }))
    .filter((source) => source.resourceGained > 0 || source.resourceSpent > 0)
    .sort(
      (left, right) =>
        right.resourceGained + right.resourceSpent - (left.resourceGained + left.resourceSpent),
    )
    .slice(0, 6)
  if (sources.length === 0) {
    return `<div class="drc-source-empty">${t('resource.noSources')}</div>`
  }
  const maximum = Math.max(
    1,
    ...sources.flatMap((source) => [source.resourceGained, source.resourceSpent]),
  )
  return `
    <div class="drc-source-list">
      ${sources
        .map((source) => {
          const spentWidth = (source.resourceSpent / maximum) * 100
          const gainedWidth = (source.resourceGained / maximum) * 100
          const net = source.resourceGained - source.resourceSpent
          return `
            <div class="drc-source-row" title="${t('resource.sourceTooltip', { gained: formatNumber(source.resourceGained), spent: formatNumber(source.resourceSpent) })}">
              <span class="drc-source-name">${t(`resource.source.${source.key}`)}</span>
              <span class="drc-source-track" aria-hidden="true">
                <span class="drc-source-half"><i class="drc-source-bar spend" style="width:${spentWidth}%"></i></span>
                <span class="drc-source-half"><i class="drc-source-bar gain" style="width:${gainedWidth}%"></i></span>
              </span>
              <span class="drc-source-value">${formatSigned(net)}</span>
            </div>
          `
        })
        .join('')}
    </div>
  `
}

const consumableCard = (data, resource, selectedResource) => {
  const values = data.summary[resource.key]
  return `
    <button class="drc-consumable-card bscolor3 fcolor2" style="--drc-accent:${resource.color}" type="button" data-resource="${resource.key}" aria-pressed="${resource.key === selectedResource}">
      <span class="drc-consumable-head">
        <span><img src="../../assets/img/client/${resource.icon}" alt=""><strong>${resourceLabel(resource, true)}</strong></span>
        <span class="drc-consumable-current">${formatNumber(values.current)}</span>
      </span>
      <span class="drc-consumable-flow"><span class="drc-gained">↑ ${formatNumber(values.gained)}</span><span class="drc-spent">↓ ${formatNumber(values.spent)}</span><strong>${formatSigned(values.net)}</strong></span>
    </button>
  `
}

const render = (root, data, selectedResource) => {
  const output = root.querySelector('.drc-output')
  const status = root.querySelector('.drc-status')
  if (!data || data.status === 'error') {
    status.classList.add('error')
    status.textContent = translateMessage(data?.error, 'resource.unavailable')
    output.innerHTML = `<div class="drc-loading bscolor3 fcolor2"><strong>${t('resource.notReady')}</strong><span>${t('resource.syncFirst')}</span></div>`
    return
  }
  status.classList.remove('error')
  status.textContent = t('resource.status', {
    range: t(`common.${data.range.key}`),
    count: formatNumber(data.entryCount),
    updated: formatTime(data.generatedAt),
    timezone: t('common.jst'),
  })
  const selected = resources.find((resource) => resource.key === selectedResource) || resources[0]
  const selectedValues = data.summary[selected.key]
  const materials = resources.filter((resource) => resource.group === 'material')
  const consumables = resources.filter((resource) => resource.group === 'consumable')
  output.innerHTML = `
    <section aria-labelledby="drc-material-title">
      <div class="drc-section-head"><h2 id="drc-material-title">${t('resource.mainResources')}</h2><span>${t('resource.mainResourcesHint')}</span></div>
      <div class="drc-resource-grid">${materials.map((resource) => resourceCard(data, resource, selected.key)).join('')}</div>
    </section>
    <section class="drc-chart-panel bscolor3 fcolor2" style="--drc-accent:${selected.color}" aria-labelledby="drc-chart-title">
      <div class="drc-section-head">
        <h2 id="drc-chart-title">${t('resource.hourlyFlow', { resource: resourceLabel(selected) })}</h2>
        <div class="drc-chart-legend"><span><i style="background:${selected.color}"></i>${t('common.gained')} ${formatNumber(selectedValues.gained)}</span><span><i style="background:var(--drc-spend)"></i>${t('common.spent')} ${formatNumber(selectedValues.spent)}</span><strong>${t('common.net')} ${formatSigned(selectedValues.net)}</strong></div>
      </div>
      ${flowChart(data, selected)}
    </section>
    <div class="drc-lower-grid">
      <section class="drc-source-panel bscolor3 fcolor2" aria-labelledby="drc-source-title">
        <div class="drc-section-head"><h2 id="drc-source-title">${t('resource.sourceTitle', { resource: resourceLabel(selected) })}</h2><span>${t('resource.sourceHint')}</span></div>
        ${sourceBreakdown(data, selected)}
      </section>
      <section class="drc-source-panel bscolor3 fcolor2" aria-labelledby="drc-consumable-title">
        <div class="drc-section-head"><h2 id="drc-consumable-title">${t('common.consumables')}</h2><span>${t('resource.consumableHint')}</span></div>
        <div class="drc-consumable-list">${consumables.map((resource) => consumableCard(data, resource, selected.key)).join('')}</div>
      </section>
    </div>
    <nav class="drc-native" aria-label="${t('resource.nativeAria')}">
      <span>${t('resource.nativeHint')}</span>
      <div class="drc-native-actions">
        <button class="drc-native-link" type="button" data-native-tab="resources">${t('resource.nativeResources')}</button>
        <button class="drc-native-link" type="button" data-native-tab="consumables">${t('resource.nativeItems')}</button>
        <button class="drc-native-link" type="button" data-native-tab="overlodger">Ledger</button>
      </div>
    </nav>
  `
}

const mountPanel = (invoke) => {
  const content = document.querySelector('#content')
  const contentHtml = document.querySelector('#contentHtml')
  if (!content || !contentHtml) return
  content.style.display = 'block'
  contentHtml.innerHTML = panelMarkup(t)
  contentHtml.style.display = 'block'
  window.scrollTo(0, 0)

  const root = contentHtml.querySelector('.drc-root')
  const refresh = root.querySelector('.drc-refresh')
  let range = 'today'
  let selectedResource = 'fuel'
  let data = null
  let loadSequence = 0

  const bindDashboardActions = () => {
    root.querySelectorAll('[data-resource]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedResource = button.dataset.resource
        render(root, data, selectedResource)
        bindDashboardActions()
      })
    })
    root.querySelectorAll('[data-native-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelector(`#menu .menulist li[data-id="${button.dataset.nativeTab}"]`)?.click()
      })
    })
  }

  const load = async () => {
    const sequence = ++loadSequence
    refresh.disabled = true
    refresh.textContent = t('common.refreshing')
    root.querySelector('.drc-status').textContent = t('resource.collecting')
    root.querySelector('.drc-output').innerHTML =
      `<div class="drc-loading bscolor3 fcolor2"><strong>${t('resource.organizing')}</strong><span>${t('resource.organizingDetail')}</span></div>`
    try {
      const result = await invoke(RESOURCE_LEDGER_SUMMARY_CHANNEL, { range })
      if (sequence !== loadSequence) return
      data = result
    } catch {
      if (sequence !== loadSequence) return
      data = { status: 'error', error: { code: 'RESOURCE_CONNECTION_FAILED' } }
    }
    render(root, data, selectedResource)
    bindDashboardActions()
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
  refresh.addEventListener('click', () => void load())
  void load()
}

export const injectResourceCenter = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  if (!document.querySelector('#damecon-resource-center-style')) {
    const style = document.createElement('style')
    style.id = 'damecon-resource-center-style'
    style.textContent = styles
    document.head.appendChild(style)
  }

  const resourcesMenuItem = document.querySelector('#menu [data-id="resources"]')
  if (!resourcesMenuItem || document.querySelector('[data-id="damecon-resource-center"]')) return
  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-resource-center'
  menuItem.textContent = t('resource.menu')
  menuItem.title = t('resource.menuTitle')
  menuItem.addEventListener(
    'click',
    (event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      document.querySelectorAll('#menu .menulist li.active').forEach((item) => {
        item.classList.remove('active')
      })
      menuItem.classList.add('active')
      mountPanel(invoke)
    },
    true,
  )
  resourcesMenuItem.insertAdjacentElement('beforebegin', menuItem)
}
