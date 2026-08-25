import { RESOURCE_LEDGER_SUMMARY_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const resources = [
  { key: 'fuel', color: '#50a65d', icon: 'fuel.png', group: 'material' },
  { key: 'ammo', color: '#9a7449', icon: 'ammo.png', group: 'material' },
  { key: 'steel', color: '#718a99', icon: 'steel.png', group: 'material' },
  { key: 'bauxite', color: '#c77d36', icon: 'bauxite.png', group: 'material' },
  {
    key: 'bucket',
    color: '#3b9d91',
    icon: 'bucket.png',
    group: 'consumable',
  },
  { key: 'devmat', color: '#288b8b', icon: 'devmat.png', group: 'consumable' },
  { key: 'screws', color: '#8d8d8d', icon: 'screws.png', group: 'consumable' },
  { key: 'torch', color: '#d3a343', icon: 'ibuild.png', group: 'consumable' },
]

const resourceLabel = (resource, short = false) =>
  t(`common.${resource.key === 'bucket' && !short ? 'bucketFull' : resource.key}`)

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatNumber = (value) => Number(value || 0).toLocaleString(locale)
const formatSigned = (value) => {
  const number = Number(value || 0)
  if (number === 0) return '0'
  return `${number > 0 ? '+' : '−'}${formatNumber(Math.abs(number))}`
}
const formatTime = (value) =>
  new Date(value).toLocaleString(locale, {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const styles = `
  .drc-root { width: 700px; min-height: 760px; --drc-gain: #3f9d67; --drc-spend: #c65a52; }
  .drc-root *, .drc-root *::before, .drc-root *::after { box-sizing: border-box; }
  .drc-root button { font-family: inherit; }
  .drc-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .drc-range { display: flex; align-items: center; gap: 4px; }
  .drc-range-label { margin-right: 4px; color: #888; font-size: 10px; }
  .drc-option, .drc-refresh, .drc-native-link {
    min-height: 25px; padding: 0 9px; cursor: pointer; font-size: 11px;
  }
  .drc-refresh { min-width: 76px; }
  .drc-option:focus-visible, .drc-refresh:focus-visible, .drc-resource-card:focus-visible,
  .drc-consumable-card:focus-visible, .drc-native-link:focus-visible {
    outline: 2px solid #69c; outline-offset: 2px;
  }
  .drc-refresh:disabled { cursor: wait; opacity: .55; }
  body.dark .drc-option, body.dark .drc-refresh, body.dark .drc-native-link {
    border: 1px solid #444; background: #121212; color: #aaa;
  }
  body.dark .drc-option[aria-pressed='true'] { border-color: #777; background: #000; color: #fc0; }
  body:not(.dark) .drc-option, body:not(.dark) .drc-refresh, body:not(.dark) .drc-native-link {
    border: 1px solid #abc; border-radius: 7px; background: #edf6fa; color: #467080;
  }
  body:not(.dark) .drc-option[aria-pressed='true'] {
    border-color: #5b8798; background: #fff; color: #24596c; font-weight: bold;
  }
  .drc-status { min-height: 18px; margin: 7px 0 1px; color: #888; font-size: 10px; }
  .drc-status.error { color: #c55b53; }
  .drc-output { min-height: 560px; }
  .drc-loading { min-height: 170px; padding: 70px 20px; text-align: center; }
  .drc-loading strong { display: block; margin-bottom: 5px; font-size: 14px; }
  .drc-loading span { color: #888; font-size: 11px; }
  .drc-section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .drc-section-head h2 { margin: 0; font-size: 14px; }
  .drc-section-head span { color: #888; font-size: 10px; }
  .drc-resource-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 7px; }
  .drc-resource-card {
    --drc-accent: #888; position: relative; min-width: 0; min-height: 112px; overflow: hidden;
    padding: 8px 9px 7px; border: 0; cursor: pointer; color: inherit; text-align: left;
  }
  body.dark .drc-resource-card { border-top: 3px solid var(--drc-accent); }
  body:not(.dark) .drc-resource-card {
    border: 1px solid #d8e1e5; border-top: 3px solid var(--drc-accent); border-radius: 9px;
  }
  body.dark .drc-resource-card[aria-pressed='true'] { background: #050505; box-shadow: inset 0 0 0 1px #777; }
  body:not(.dark) .drc-resource-card[aria-pressed='true'] {
    border-color: var(--drc-accent); background: #fff; box-shadow: 0 2px 7px #24596c22;
  }
  .drc-card-head { display: flex; align-items: center; justify-content: space-between; gap: 5px; }
  .drc-card-name { display: flex; align-items: center; min-width: 0; gap: 5px; font-size: 11px; }
  .drc-card-name img { width: 17px; height: 17px; }
  .drc-card-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drc-current { display: block; margin-top: 5px; font: bold 21px/1.05 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .drc-current-label { display: block; color: #888; font-size: 9px; }
  .drc-card-flow { display: flex; justify-content: space-between; gap: 4px; margin-top: 5px; font-size: 9px; }
  .drc-gained { color: var(--drc-gain); }
  .drc-spent { color: var(--drc-spend); }
  .drc-card-net { font-weight: bold; }
  .drc-card-spark { position: absolute; right: 0; bottom: 0; left: 0; height: 25px; opacity: .28; pointer-events: none; }
  .drc-card-spark svg { display: block; width: 100%; height: 100%; }
  .drc-chart-panel { margin-top: 8px; padding: 9px 10px 7px; }
  body:not(.dark) .drc-chart-panel, body:not(.dark) .drc-source-panel,
  body:not(.dark) .drc-consumable-card { border-radius: 9px; }
  .drc-chart-legend { display: flex; align-items: center; gap: 10px; font-size: 9px; }
  .drc-chart-legend i { display: inline-block; width: 8px; height: 8px; margin-right: 3px; }
  .drc-flow-chart { display: block; width: 100%; height: 216px; margin-top: 4px; overflow: visible; }
  .drc-chart-grid { stroke: #8884; stroke-width: 1; }
  .drc-chart-zero { stroke: #777; stroke-width: 1.5; }
  .drc-chart-label { fill: #888; font: 9px Tahoma, sans-serif; }
  .drc-chart-zero-label { fill: #888; font: 8px Tahoma, sans-serif; }
  .drc-chart-gain { fill: var(--drc-accent); opacity: .78; }
  .drc-chart-spend { fill: var(--drc-spend); opacity: .82; }
  .drc-chart-empty { fill: #888; font: 11px Tahoma, sans-serif; text-anchor: middle; }
  .drc-lower-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 8px; margin-top: 8px; }
  .drc-source-panel { min-width: 0; padding: 9px 10px; }
  .drc-source-list { margin-top: 7px; }
  .drc-source-row { display: grid; grid-template-columns: 74px minmax(0, 1fr) 62px; align-items: center; gap: 6px; min-height: 25px; }
  .drc-source-name { overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .drc-source-track { display: grid; grid-template-columns: 1fr 1fr; height: 9px; }
  .drc-source-half { position: relative; overflow: hidden; background: #8882; }
  .drc-source-half:first-child { border-right: 1px solid #777; }
  .drc-source-bar { position: absolute; top: 0; bottom: 0; }
  .drc-source-bar.spend { right: 0; background: var(--drc-spend); }
  .drc-source-bar.gain { left: 0; background: var(--drc-gain); }
  .drc-source-value { font: 9px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; white-space: nowrap; }
  .drc-source-empty { min-height: 76px; padding: 27px 6px; color: #888; font-size: 10px; text-align: center; }
  .drc-consumable-list { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-top: 7px; }
  .drc-consumable-card {
    --drc-accent: #888; min-width: 0; min-height: 60px; padding: 6px 7px; border: 0;
    border-left: 3px solid var(--drc-accent); cursor: pointer; color: inherit; text-align: left;
  }
  body:not(.dark) .drc-consumable-card { border-top: 1px solid #d8e1e5; border-right: 1px solid #d8e1e5; border-bottom: 1px solid #d8e1e5; }
  body.dark .drc-consumable-card[aria-pressed='true'] { background: #050505; box-shadow: inset 0 0 0 1px #777; }
  body:not(.dark) .drc-consumable-card[aria-pressed='true'] { background: #fff; box-shadow: inset 0 0 0 1px var(--drc-accent); }
  .drc-consumable-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
  .drc-consumable-head span { display: flex; align-items: center; min-width: 0; gap: 4px; font-size: 9px; }
  .drc-consumable-head img { width: 15px; height: 15px; }
  .drc-consumable-head strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .drc-consumable-current { font: bold 14px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .drc-consumable-flow { display: flex; justify-content: flex-end; gap: 7px; margin-top: 6px; font-size: 8px; }
  .drc-native { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; padding-top: 8px; border-top: 1px solid #8884; }
  .drc-native span { color: #888; font-size: 9px; }
  .drc-native-actions { display: flex; gap: 4px; }
  @media (max-width: 720px) {
    .drc-root { width: 100%; }
    .drc-toolbar { align-items: flex-start; flex-direction: column; }
    .drc-resource-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .drc-lower-grid { grid-template-columns: 1fr; }
    .drc-native { align-items: flex-start; flex-direction: column; }
    .drc-native-actions { flex-wrap: wrap; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .drc-resource-card, .drc-consumable-card { transition: background-color .15s ease, box-shadow .15s ease; }
  }
`

const panelMarkup = () => `
  <div id="damecon-resource-center" class="drc-root tab_resource_center">
    <div class="page_title">
      <span>${t('resource.title')}</span>
      <div class="page_help_btn hover"><span>?</span> <span>${t('common.help')}</span></div>
    </div>
    <div class="page_help">
      <div class="help_q">${t('resource.help.flowQuestion')}</div>
      <div class="help_a">${t('resource.help.flowAnswer')}</div>
      <div class="help_q">${t('resource.help.chartQuestion')}</div>
      <div class="help_a">${t('resource.help.chartAnswer')}</div>
      <div class="help_q">${t('resource.help.timeQuestion')}</div>
      <div class="help_a">${t('resource.help.timeAnswer')}</div>
    </div>
    <section class="page_panel bscolor4 drc-toolbar" aria-label="${t('resource.toolbar')}">
      <div class="drc-range" aria-label="${t('resource.range')}">
        <span class="drc-range-label">${t('common.period')}</span>
        <button class="drc-option" type="button" data-range="today" aria-pressed="true">${t('common.today')}</button>
        <button class="drc-option" type="button" data-range="yesterday" aria-pressed="false">${t('common.yesterday')}</button>
        <button class="drc-option" type="button" data-range="rolling24" aria-pressed="false">24 h</button>
      </div>
      <button class="drc-refresh" type="button">${t('common.refresh')}</button>
    </section>
    <div class="page_padding">
      <div class="drc-status" aria-live="polite">${t('resource.preparing')}</div>
      <div class="drc-output" aria-live="polite">
        <div class="drc-loading bscolor3 fcolor2"><strong>${t('resource.organizing')}</strong><span>${t('resource.organizingDetail')}</span></div>
      </div>
    </div>
  </div>
`

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
  contentHtml.innerHTML = panelMarkup()
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
