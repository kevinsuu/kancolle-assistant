import { EXPEDITION_PLAN_CHANNEL, EXPEDITION_SUMMARY_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const resources = [
  { key: 'fuel', color: '#50a65d', defaultTarget: 50000 },
  { key: 'ammo', color: '#8b6b42', defaultTarget: 50000 },
  { key: 'steel', color: '#6f8795', defaultTarget: 55000 },
  { key: 'bauxite', color: '#c47e37', defaultTarget: 55000 },
]

const weightResources = ['fuel', 'steel', 'ammo', 'bauxite'].map((key) =>
  resources.find((resource) => resource.key === key),
)

const expeditionGroups = [
  [
    [1, '01', '00:15'],
    [2, '02', '00:30'],
    [3, '03', '00:20'],
    [4, '04', '00:50'],
    [5, '05', '01:30'],
    [6, '06', '00:40'],
    [7, '07', '01:00'],
    [8, '08', '03:00'],
    [100, 'A1', '00:25'],
    [101, 'A2', '00:55'],
    [102, 'A3', '02:15'],
  ],
  [
    [9, '09', '04:00'],
    [10, '10', '01:30'],
    [11, '11', '05:00'],
    [12, '12', '08:00'],
    [13, '13', '04:00'],
    [14, '14', '06:00'],
    [15, '15', '12:00'],
    [16, '16', '15:00'],
    [110, 'B1', '00:35'],
  ],
  [
    [17, '17', '00:45'],
    [18, '18', '05:00'],
    [19, '19', '06:00'],
    [20, '20', '02:00'],
    [21, '21', '02:20'],
    [22, '22', '03:00'],
    [23, '23', '04:00'],
    [24, '24', '08:20'],
  ],
  [
    [25, '25', '40:00'],
    [26, '26', '80:00'],
    [27, '27', '20:00'],
    [28, '28', '25:00'],
    [29, '29', '24:00'],
    [30, '30', '48:00'],
    [31, '31', '02:00'],
    [32, '32', '24:00'],
  ],
  [
    [33, '33', '00:15'],
    [34, '34', '00:30'],
    [35, '35', '07:00'],
    [36, '36', '09:00'],
    [37, '37', '02:45'],
    [38, '38', '02:55'],
    [39, '39', '30:00'],
    [40, '40', '06:50'],
  ],
]

const recommendedBlacklist = new Set([22, 29, 30, 31, 33, 34])
const bucketExpeditions = new Set([2, 4, 9, 10, 11, 13, 14, 18, 24, 26, 36, 39, 40, 101, 102, 110])

const resourceLabel = (resource) => t(`common.${resource.key}`)

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatNumber = (value, digits = 0) =>
  Number(value || 0).toLocaleString(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

const formatSigned = (value, digits = 0) => {
  const numericValue = Number(value || 0)
  return `${numericValue > 0 ? '+' : ''}${formatNumber(numericValue, digits)}`
}

const formatDuration = (minutes) => {
  const value = Math.max(0, Math.round(Number(minutes || 0)))
  const hours = Math.floor(value / 60)
  const remainder = value % 60
  if (hours === 0) return t('common.minutes', { value: remainder })
  return remainder === 0
    ? t('common.hours', { value: hours })
    : `${t('common.hours', { value: hours })} ${t('common.minutes', { value: remainder })}`
}

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { hour12: false })
}

const formatShortDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? t('expedition.returned')
    : date.toLocaleString(locale, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
}

const styles = `
  .dep-root { width: 680px; margin: 0 0 24px; font-size: 13px; line-height: 1.5; }
  .dep-root *, .dep-root *::before, .dep-root *::after { box-sizing: border-box; }
  .dep-button { min-height: 36px; padding: 6px 14px; border: 1px solid #555; cursor: pointer; font-size: 14px; font-weight: bold; }
  .dep-button:disabled { cursor: not-allowed; opacity: .5; }
  body.dark .dep-button { background: #111; color: #ddd; }
  body:not(.dark) .dep-button { border-color: #9bbfd5; border-radius: 6px; background: #e6f3fa; color: #28637e; }
  .dep-button-primary { min-width: 168px; }
  body.dark .dep-button-primary { border-color: #b68a00; color: #fc0; }
  body:not(.dark) .dep-button-primary { border-color: #407f9e; background: #d8edf7; color: #174f69; }
  .dep-page-title { min-height: 40px; }
  .dep-title-sync { box-sizing: border-box; float: right; min-width: 126px; min-height: 28px; height: 28px; margin: 3px 8px 0 0; padding: 0 12px; font-size: 12px; line-height: 26px; }
  .dep-lead { margin: 0; padding: 9px 12px; font-size: 12px; }
  .dep-candidate-panel { margin-top: 8px; }
  .dep-candidate-summary { display: flex; min-height: 58px; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; cursor: pointer; list-style: none; }
  .dep-candidate-summary::-webkit-details-marker { display: none; }
  .dep-candidate-summary-title strong { display: block; font-size: 16px; }
  .dep-candidate-summary-title small { display: block; color: #888; font-size: 11px; font-weight: normal; }
  .dep-candidate-summary-status { display: flex; align-items: center; gap: 11px; white-space: nowrap; }
  .dep-candidate-summary-status b { color: #317ca2; font-size: 12px; }
  body.dark .dep-candidate-summary-status b { color: #7fc7ea; }
  .dep-candidate-summary-status span::before { color: #888; font-size: 11px; content: attr(data-collapsed-label); }
  .dep-candidate-panel[open] .dep-candidate-summary-status span::before { content: attr(data-expanded-label); }
  .dep-candidate-body { padding: 0 10px 10px; border-top: 1px solid rgba(128,128,128,.25); }
  .dep-section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  .dep-section-head h3 { margin: 0; font-size: 16px; }
  .dep-section-head p { margin: 0; color: #888; font-size: 11px; }
  .dep-presets { display: flex; justify-content: flex-end; gap: 5px; padding: 9px 0; }
  .dep-preset { min-height: 28px; padding: 3px 10px; border: 1px solid rgba(128,128,128,.45); background: transparent; color: inherit; cursor: pointer; font-size: 11px; font-weight: bold; }
  .dep-candidate-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .dep-candidate-group { min-width: 0; padding: 7px 8px; }
  .dep-candidate-group h4 { margin: -7px -8px 5px; padding: 3px 6px; background: #4d82af; color: #fff; font-size: 12px; text-align: center; }
  .dep-candidate { display: grid; grid-template-columns: 16px 28px minmax(0, 1fr); align-items: center; min-height: 20px; cursor: pointer; font-variant-numeric: tabular-nums; }
  .dep-candidate input { margin: 0; }
  .dep-candidate strong { font-size: 12px; text-align: center; }
  .dep-candidate small { color: #888; font: 10px monospace; text-align: right; }
  .dep-settings-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(220px, 1fr); gap: 8px; margin-top: 8px; }
  .dep-setting-panel { padding: 10px 12px; }
  .dep-weight-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 14px; }
  .dep-weight { display: grid; grid-template-columns: 42px minmax(0, 1fr) 28px; align-items: center; gap: 5px; }
  .dep-weight span { font-size: 12px; font-weight: bold; }
  .dep-weight output { font: bold 13px monospace; text-align: right; }
  .dep-weight input { width: 100%; min-width: 0; }
  .dep-schedule { display: grid; grid-template-columns: 1fr; gap: 9px; }
  .dep-time-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .dep-time-inputs label { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; font-size: 11px; }
  .dep-time-inputs input { width: 100%; height: 29px; padding: 3px 5px; color: inherit; text-align: right; }
  body.dark .dep-time-inputs input { border: 1px solid #444; background: #090909; }
  body:not(.dark) .dep-time-inputs input { border: 1px solid #b7cbd5; background: #fff; }
  .dep-fleet-options { display: flex; justify-content: space-between; gap: 5px; }
  .dep-fleet-options label { display: flex; flex: 1; align-items: center; justify-content: center; gap: 4px; min-height: 31px; border: 1px solid rgba(128,128,128,.35); cursor: pointer; font-size: 12px; }
  .dep-fleet-options label:has(input:checked) { border-color: #3b87aa; background: rgba(70,150,190,.14); }
  .dep-button:focus-visible, .dep-root input:focus-visible, .dep-root select:focus-visible, .dep-candidate-summary:focus-visible, .dep-fold:focus-within { outline: 2px solid #69c; outline-offset: 2px; }
  .dep-targets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 8px; }
  .dep-resource { --dep-resource: #777; position: relative; min-width: 0; padding: 10px 11px 9px; overflow: hidden; }
  .dep-resource::before { position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--dep-resource); content: ''; }
  .dep-resource-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
  .dep-resource-head strong { font-size: 15px; }
  .dep-resource-head span { color: #888; font-size: 12px; }
  .dep-resource-head span b { margin-left: 2px; color: inherit; font-size: 16px; font-variant-numeric: tabular-nums; }
  .dep-resource label { display: grid; grid-template-columns: 38px minmax(0, 1fr); align-items: center; gap: 6px; font-size: 12px; }
  .dep-resource input { width: 100%; height: 31px; padding: 3px 7px; color: inherit; font: 15px monospace; text-align: right; }
  body.dark .dep-resource input { border: 1px solid #444; background: #090909; }
  body:not(.dark) .dep-resource input { border: 1px solid #b7cbd5; background: #fff; }
  .dep-shortfall { height: 6px; margin-top: 9px; overflow: hidden; background: rgba(128,128,128,.18); }
  .dep-shortfall i { display: block; width: 0; height: 100%; background: var(--dep-resource); transition: width .18s ease-out; }
  .dep-deficit { display: flex; justify-content: space-between; margin-top: 5px; color: #bd6678; font: 12px monospace; }
  body.dark .dep-deficit { color: #f0a3b2; }
  .dep-assumptions { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.45fr) minmax(0, 1.15fr) minmax(0, .75fr); gap: 12px; align-items: stretch; margin-top: 8px; padding: 13px; }
  .dep-assumption-intro h3 { margin: 0 0 3px; font-size: 17px; }
  .dep-assumption-intro p { margin: 0; color: #888; font-size: 12px; line-height: 1.55; }
  .dep-assumption-group { min-width: 0; margin: 0; padding: 0; border: 0; }
  .dep-assumption-group legend, .dep-assumption-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: bold; }
  .dep-success-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .dep-success-option { display: flex; min-width: 0; min-height: 45px; align-items: center; gap: 7px; padding: 7px 9px; border: 1px solid rgba(128,128,128,.35); cursor: pointer; }
  .dep-success-option span { min-width: 0; }
  .dep-success-option:has(input:checked) { border-color: #3b87aa; background: rgba(70,150,190,.14); }
  .dep-success-option input { margin: 0; }
  .dep-success-option strong { display: block; font-size: 13px; }
  .dep-success-option small { display: block; color: #888; font-size: 11px; }
  .dep-daihatsu-select { width: 100%; min-width: 0; max-width: 100%; min-height: 45px; padding: 5px 9px; border: 1px solid rgba(128,128,128,.45); color: inherit; font: bold 14px sans-serif; }
  body.dark .dep-daihatsu-select { background: #090909; }
  body:not(.dark) .dep-daihatsu-select { background: #fff; }
  .dep-factor { display: flex; min-width: 0; flex-direction: column; justify-content: center; padding: 8px 11px; overflow-wrap: anywhere; border-left: 4px solid #3b87aa; }
  .dep-factor span { color: #888; font-size: 11px; }
  .dep-factor strong { font-size: 20px; font-variant-numeric: tabular-nums; }
  .dep-factor small { font-size: 11px; }
  .dep-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 10px 13px; }
  .dep-actions p { margin: 0; font-size: 13px; line-height: 1.5; }
  .dep-actions b { color: #c98f00; }
  .dep-output { margin-top: 10px; }
  .dep-idle, .dep-error { min-height: 64px; padding: 14px; text-align: center; }
  .dep-idle strong, .dep-error strong { display: block; margin-bottom: 4px; font-size: 16px; }
  .dep-idle span, .dep-error span { font-size: 13px; }
  .dep-error strong { color: #c44; }
  .dep-dispatch-board { margin-bottom: 9px; padding: 11px 12px 12px; }
  .dep-dispatch-title { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .dep-dispatch-title h3 { margin: 0; font-size: 18px; }
  .dep-dispatch-title span { color: #888; font-size: 12px; }
  .dep-dispatch-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 7px; }
  .dep-dispatch-step { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 8px; min-width: 0; padding: 9px; border-left: 4px solid #777; }
  .dep-step-number { display: grid; width: 30px; height: 30px; place-items: center; border: 2px solid currentColor; border-radius: 50%; font: bold 15px monospace; }
  .dep-step-route { font-size: 12px; }
  .dep-step-route strong { display: block; overflow: hidden; font-size: 16px; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
  .dep-step-route b { color: #317ca2; }
  body.dark .dep-step-route b { color: #fc0; }
  .dep-step-action { display: block; margin-top: 4px; font-size: 12px; font-weight: bold; }
  .dep-state-ready { border-left-color: #3e9b59; }
  .dep-state-ready .dep-step-number, .dep-state-ready .dep-readiness, .dep-state-ready .dep-step-action { color: #3e9b59; }
  .dep-state-waiting { border-left-color: #317ca2; }
  .dep-state-waiting .dep-step-number, .dep-state-waiting .dep-readiness, .dep-state-waiting .dep-step-action { color: #317ca2; }
  body.dark .dep-state-waiting .dep-step-number, body.dark .dep-state-waiting .dep-readiness, body.dark .dep-state-waiting .dep-step-action { color: #7fc7ea; }
  .dep-state-supply, .dep-state-composition { border-left-color: #c98f00; }
  .dep-state-supply .dep-step-number, .dep-state-supply .dep-readiness, .dep-state-supply .dep-step-action,
  .dep-state-composition .dep-step-number, .dep-state-composition .dep-readiness, .dep-state-composition .dep-step-action { color: #c98f00; }
  .dep-pairing-list { display: grid; gap: 9px; }
  .dep-pairing { padding: 0 11px 11px; border-left: 4px solid #777; }
  .dep-pairing-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; min-height: 50px; }
  .dep-pairing-head h3 { margin: 0; font-size: 17px; line-height: 1.35; }
  .dep-pairing-head h3 span { color: #888; font-size: 13px; font-weight: normal; }
  .dep-readiness { padding: 4px 8px; border: 1px solid currentColor; font-size: 12px; font-weight: bold; white-space: nowrap; }
  .dep-next-action { margin: 0 0 9px; padding: 8px 10px; font-size: 14px; font-weight: bold; }
  body.dark .dep-next-action { background: rgba(255,255,255,.05); }
  body:not(.dark) .dep-next-action { background: rgba(255,255,255,.7); }
  .dep-income { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-bottom: 9px; }
  .dep-income span { padding: 5px 7px; border-left: 3px solid var(--dep-resource); font: 12px monospace; }
  .dep-income strong { display: block; margin-bottom: 1px; font: bold 13px sans-serif; }
  .dep-fold { margin-top: 6px; padding: 0; }
  .dep-fold summary { padding: 8px 10px; cursor: pointer; font-size: 13px; font-weight: bold; list-style-position: inside; }
  .dep-fold[open] summary { border-bottom: 1px solid rgba(128,128,128,.25); }
  .dep-fold-body { padding: 9px 11px; }
  .dep-fold-summary-ok { color: #3e9b59; }
  .dep-fold-summary-warn { color: #c98f00; }
  .dep-conditions { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 12px; margin: 0; padding: 0; list-style: none; }
  .dep-conditions li { position: relative; padding-left: 17px; font-size: 12px; line-height: 1.5; }
  .dep-conditions li::before { position: absolute; left: 0; font-weight: bold; content: '—'; }
  .dep-conditions li.pass::before { color: #3e9b59; content: '✓'; }
  .dep-conditions li.fail { color: #c98f00; }
  .dep-conditions li.fail::before { content: '!'; }
  .dep-notes { margin: 0; padding-left: 19px; }
  .dep-notes li { margin: 4px 0; font-size: 12px; line-height: 1.5; }
  @media (max-width: 1100px) {
    .dep-assumptions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 680px) {
    .dep-root { width: 100%; }
    .dep-candidate-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dep-settings-grid { grid-template-columns: 1fr; }
    .dep-weight-grid { grid-template-columns: 1fr; }
    .dep-targets { grid-template-columns: repeat(2, 1fr); }
    .dep-assumptions { grid-template-columns: minmax(0, 1fr); }
    .dep-dispatch-steps { grid-template-columns: 1fr; }
    .dep-conditions { grid-template-columns: 1fr; }
    .dep-actions { align-items: stretch; flex-direction: column; }
    .dep-income { grid-template-columns: repeat(2, 1fr); }
  }
  @media (prefers-reduced-motion: reduce) { .dep-shortfall i { transition: none; } }
`

const plannerMarkup = () => `
  <section class="dep-root" aria-label="${t('expedition.title')}">
    <div class="page_title dep-page-title">
      ${t('expedition.title')}
      <button id="dep-sync" class="dep-button dep-title-sync" type="button">${t('expedition.syncResources')}</button>
    </div>
    <p class="dep-lead page_panel bscolor4 fcolor2">${t('expedition.lead')}</p>
    <div id="dep-targets" class="dep-targets">
      ${resources
        .map(
          (resource) => `
            <section class="dep-resource bscolor3 fcolor2" style="--dep-resource:${resource.color}">
              <div class="dep-resource-head">
                <strong>${resourceLabel(resource)}</strong>
                <span>${t('common.current')} <b id="dep-current-${resource.key}">—</b></span>
              </div>
              <label for="dep-target-${resource.key}">
                <span>${t('expedition.target')}</span>
                <input id="dep-target-${resource.key}" inputmode="numeric" min="0" max="350000" step="1000" type="number" disabled>
              </label>
              <div class="dep-shortfall" aria-hidden="true"><i id="dep-bar-${resource.key}"></i></div>
              <div class="dep-deficit"><span>${t('expedition.shortfall')}</span><strong id="dep-deficit-${resource.key}">—</strong></div>
            </section>
          `,
        )
        .join('')}
    </div>
    <details class="dep-candidate-panel page_panel bscolor4 fcolor2">
      <summary class="dep-candidate-summary">
        <span class="dep-candidate-summary-title"><strong>${t('expedition.candidates')}</strong><small>${t('expedition.candidateHint')}</small></span>
        <span class="dep-candidate-summary-status"><b id="dep-candidate-count">${t('expedition.selectAll')}</b><span aria-hidden="true" data-collapsed-label="${t('expedition.expand')}" data-expanded-label="${t('expedition.collapse')}"></span></span>
      </summary>
      <div class="dep-candidate-body">
        <div class="dep-presets" aria-label="${t('expedition.candidatePresets')}">
          <button class="dep-preset" data-preset="all" type="button">${t('expedition.selectAll')}</button>
          <button class="dep-preset" data-preset="recommended" type="button">${t('expedition.recommended')}</button>
          <button class="dep-preset" data-preset="buckets" type="button">${t('expedition.buckets')}</button>
          <button class="dep-preset" data-preset="none" type="button">${t('expedition.clear')}</button>
        </div>
        <div class="dep-candidate-grid">
          ${expeditionGroups
            .map(
              (group, index) => `
                <section class="dep-candidate-group bscolor3 fcolor2">
                  <h4>${t('expedition.area', { index: index + 1 })}</h4>
                  ${group
                    .map(
                      ([id, displayNo, duration]) => `
                        <label class="dep-candidate">
                          <input data-expedition-id="${id}" type="checkbox" checked>
                          <strong>${displayNo}</strong>
                          <small>${duration}</small>
                        </label>
                      `,
                    )
                    .join('')}
                </section>
              `,
            )
            .join('')}
        </div>
      </div>
    </details>
    <div class="dep-settings-grid">
      <section class="dep-setting-panel page_panel bscolor4 fcolor2" aria-labelledby="dep-weight-title">
        <div class="dep-section-head"><div><h3 id="dep-weight-title">${t('expedition.resourceWeights')}</h3><p>${t('expedition.weightHint')}</p></div></div>
        <div class="dep-weight-grid">
          ${weightResources
            .map(
              (resource) => `
                <label class="dep-weight" style="--dep-resource:${resource.color}">
                  <span>${resourceLabel(resource)}</span>
                  <input data-resource-weight="${resource.key}" min="-5" max="20" step="1" type="range" value="5">
                  <output data-resource-weight-value="${resource.key}">5</output>
                </label>
              `,
            )
            .join('')}
        </div>
      </section>
      <section class="dep-setting-panel page_panel bscolor4 fcolor2" aria-labelledby="dep-schedule-title">
        <div class="dep-section-head"><div><h3 id="dep-schedule-title">${t('expedition.schedule')}</h3><p>${t('expedition.scheduleHint')}</p></div></div>
        <div class="dep-schedule">
          <div class="dep-time-inputs">
            <label><input id="dep-afk-hours" min="0" max="48" type="number" value="0">${t('common.hours', { value: '' }).trim()}</label>
            <label><input id="dep-afk-minutes" min="0" max="59" type="number" value="0">${t('common.minutes', { value: '' }).trim()}</label>
          </div>
          <div class="dep-fleet-options" aria-label="${t('expedition.availableFleets')}">
            ${[1, 2, 3]
              .map(
                (count) =>
                  `<label><input name="dep-fleet-count" type="radio" value="${count}"${count === 3 ? ' checked' : ''}>${t('expedition.fleets', { count })}</label>`,
              )
              .join('')}
          </div>
        </div>
      </section>
    </div>
    <section class="dep-assumptions page_panel bscolor4 fcolor2" aria-labelledby="dep-assumption-title">
      <div class="dep-assumption-intro">
        <h3 id="dep-assumption-title">${t('expedition.assumptions')}</h3>
        <p>${t('expedition.assumptionHint')}</p>
      </div>
      <fieldset class="dep-assumption-group">
        <legend>${t('expedition.successMode')}</legend>
        <div class="dep-success-options">
          <label class="dep-success-option">
            <input name="dep-success-mode" type="radio" value="normal" checked>
            <span><strong>${t('expedition.normalSuccess')}</strong><small>${t('expedition.rewardMultiplier', { value: '1.00' })}</small></span>
          </label>
          <label class="dep-success-option">
            <input name="dep-success-mode" type="radio" value="great">
            <span><strong>${t('expedition.greatSuccess')}</strong><small>${t('expedition.rewardMultiplier', { value: '1.50' })}</small></span>
          </label>
        </div>
      </fieldset>
      <label class="dep-assumption-group" for="dep-daihatsu-count">
        <span class="dep-assumption-label">${t('expedition.daihatsu')}</span>
        <select id="dep-daihatsu-count" class="dep-daihatsu-select">
          ${[0, 1, 2, 3, 4].map((count) => `<option value="${count}">${t('expedition.daihatsuOption', { count, percent: count * 5 })}${count === 4 ? ` (${t('expedition.maximum')})` : ''}</option>`).join('')}
        </select>
      </label>
      <output class="dep-factor bscolor3 fcolor2" aria-live="polite">
        <span>${t('expedition.totalMultiplier')}</span>
        <strong id="dep-factor-total">×1.000</strong>
        <small id="dep-factor-formula">1.00 × 1.00</small>
      </output>
    </section>
    <div class="dep-actions page_panel bscolor4 fcolor2">
      <p>${t('expedition.actionHint')}</p>
      <button id="dep-generate" class="dep-button dep-button-primary" type="button" disabled>${t('expedition.generate')}</button>
    </div>
    <div id="dep-output" class="dep-output" aria-live="polite">
      <div class="dep-idle bscolor3 fcolor2"><strong>${t('expedition.idle')}</strong><span>${t('expedition.idleHint')}</span></div>
    </div>
  </section>
`

const targetValues = (root) =>
  Object.fromEntries(
    resources.map(({ key }) => [key, Number(root.querySelector(`#dep-target-${key}`)?.value)]),
  )

const updateDeficits = (root, current) => {
  const target = targetValues(root)
  const deficits = Object.fromEntries(
    resources.map(({ key }) => [key, Math.max(0, target[key] - Number(current[key] || 0))]),
  )
  const maxDeficit = Math.max(1, ...Object.values(deficits))
  resources.forEach(({ key }) => {
    root.querySelector(`#dep-current-${key}`).textContent = formatNumber(current[key])
    root.querySelector(`#dep-deficit-${key}`).textContent = formatNumber(deficits[key])
    root.querySelector(`#dep-bar-${key}`).style.width = `${(deficits[key] / maxDeficit) * 100}%`
  })
}

const selectedCandidateIds = (root) =>
  [...root.querySelectorAll('[data-expedition-id]:checked')].map((input) =>
    Number(input.dataset.expeditionId),
  )

const scorerSettings = (root) => {
  const hours = Number(root.querySelector('#dep-afk-hours')?.value || 0)
  const minutes = Number(root.querySelector('#dep-afk-minutes')?.value || 0)
  const fleetCount = Number(root.querySelector('input[name="dep-fleet-count"]:checked')?.value || 3)
  const resourceWeights = Object.fromEntries(
    resources.map(({ key }) => [
      key,
      Number(root.querySelector(`[data-resource-weight="${key}"]`)?.value),
    ]),
  )
  return {
    afkMinutes: Math.max(0, Math.round(hours * 60 + minutes)),
    fleetCount,
    candidateIds: selectedCandidateIds(root),
    resourceWeights,
  }
}

const incomeAssumption = (root) => ({
  greatSuccess: root.querySelector('input[name="dep-success-mode"]:checked')?.value === 'great',
  daihatsuCount: Number(root.querySelector('#dep-daihatsu-count')?.value || 0),
})

const updateIncomeAssumption = (root) => {
  const assumption = incomeAssumption(root)
  const successFactor = assumption.greatSuccess ? 1.5 : 1
  const daihatsuFactor = 1 + assumption.daihatsuCount * 0.05
  root.querySelector('#dep-factor-total').textContent = `×${formatNumber(
    successFactor * daihatsuFactor,
    3,
  )}`
  root.querySelector('#dep-factor-formula').textContent = `${formatNumber(
    successFactor,
    2,
  )} × ${formatNumber(daihatsuFactor, 2)}`
}

const typeLabel = (value) => {
  const translated = t(`expedition.shipType.${value}`)
  return translated === `expedition.shipType.${value}` ? value : translated
}

const conditionRows = (requirements, fleet) => {
  const result = fleet.result
  const actual = fleet.actual
  const rows = [
    {
      label: t('expedition.require.flagshipLevel', { value: requirements.flagShipLevel }),
      actual: t('expedition.actual.level', { value: actual.flagShipLevel }),
      passed: result.flagShipLevel,
    },
    {
      label: t('expedition.require.shipCount', { value: requirements.shipCount }),
      actual: t('expedition.actual.ships', { value: actual.shipCount }),
      passed: result.shipCount,
    },
  ]
  const optional = [
    [
      'flagShipTypeOf',
      requirements.flagShipTypeOf,
      () => ({
        label: t('expedition.require.flagshipType', {
          value: requirements.flagShipTypeOf.map(typeLabel).join(' / '),
        }),
        actual: t('expedition.actual.value', { value: typeLabel(actual.flagShipType) }),
      }),
    ],
    [
      'levelCount',
      requirements.levelCount,
      () => ({
        label: t('expedition.require.totalLevel', { value: requirements.levelCount }),
        actual: t('expedition.actual.value', { value: actual.levelCount }),
      }),
    ],
    [
      'totalAsw',
      requirements.totalAsw,
      () => ({
        label: t('expedition.require.totalAsw', { value: requirements.totalAsw }),
        actual: t('expedition.actual.value', { value: actual.totalAsw }),
      }),
    ],
    [
      'totalLos',
      requirements.totalLos,
      () => ({
        label: t('expedition.require.totalLos', { value: requirements.totalLos }),
        actual: t('expedition.actual.value', { value: actual.totalLos }),
      }),
    ],
    [
      'totalAa',
      requirements.totalAa,
      () => ({
        label: t('expedition.require.totalAa', { value: requirements.totalAa }),
        actual: t('expedition.actual.value', { value: actual.totalAa }),
      }),
    ],
    [
      'totalFp',
      requirements.totalFp,
      () => ({
        label: t('expedition.require.totalFp', { value: requirements.totalFp }),
        actual: t('expedition.actual.value', { value: actual.totalFp }),
      }),
    ],
    [
      'totalTorp',
      requirements.totalTorp,
      () => ({
        label: t('expedition.require.totalTorp', { value: requirements.totalTorp }),
        actual: t('expedition.actual.value', { value: actual.totalTorp }),
      }),
    ],
    [
      'drumCount',
      requirements.drumCount,
      () => ({
        label: t('expedition.require.drumCount', { value: requirements.drumCount }),
        actual: t('expedition.actual.value', { value: actual.drumCount }),
      }),
    ],
    [
      'drumCarrierCount',
      requirements.drumCarrierCount,
      () => ({
        label: t('expedition.require.drumCarriers', {
          value: requirements.drumCarrierCount,
        }),
        actual: t('expedition.actual.ships', { value: actual.drumCarrierCount }),
      }),
    ],
  ]
  optional.forEach(([key, requirement, describe]) => {
    if (requirement !== null) rows.push({ ...describe(), passed: result[key] })
  })
  requirements.fleetSType.forEach((requirement, index) => {
    const actualCount = actual.types.filter((type) => requirement.oneOf.includes(type)).length
    rows.push({
      label: t('expedition.require.shipTypes', {
        types: requirement.oneOf.map(typeLabel).join(' / '),
        value: requirement.count,
      }),
      actual: t('expedition.actual.ships', { value: actualCount }),
      passed: result.fleetSType[index],
    })
  })
  return rows
}

const greatSuccessText = (condition, fleet) => {
  if (condition.type === 'drums') {
    return t('expedition.greatSuccess.drums', {
      required: condition.count,
      actual: fleet.actual.drumCount,
    })
  }
  if (condition.type === 'flagship-level') {
    return t('expedition.greatSuccess.flagship', {
      level: fleet.actual.flagShipLevel,
      sparkled: fleet.actual.sparkledCount,
      ships: fleet.actual.shipCount,
    })
  }
  if (condition.type === 'all-sparkle') {
    return t('expedition.greatSuccess.allSparkle', {
      sparkled: fleet.actual.sparkledCount,
      ships: fleet.actual.shipCount,
    })
  }
  return t('expedition.greatSuccess.unknown', {
    sparkled: fleet.actual.sparkledCount,
    ships: fleet.actual.shipCount,
  })
}

const modifierText = (modifier) => {
  if (modifier.type === 'custom') {
    return t('expedition.modifier.custom', { factor: formatNumber(modifier.factor, 2) })
  }
  return t('expedition.modifier.estimate', {
    mode: t(`expedition.modifier.${modifier.greatSuccess ? 'great' : 'normal'}`),
    count: modifier.daihatsuCount,
    factor: formatNumber(modifier.factor, 3),
    cost: modifier.type === 'kancepts-account' ? t('expedition.modifier.cost') : '',
  })
}

const pairingState = (fleet) => {
  if (fleet.busy) {
    const afterReturn = [
      !fleet.meetsRequirements ? t('expedition.recompose') : '',
      !fleet.isSupplied ? t('expedition.resupply') : '',
    ].filter(Boolean)
    return {
      key: 'waiting',
      label: t('expedition.state.waiting'),
      action: t('expedition.state.waitingAction', {
        time: formatShortDate(fleet.currentMission?.completesAt),
        actions: afterReturn.length > 0 ? `${afterReturn.join(t('common.listSeparator'))} ` : '',
      }),
    }
  }
  if (!fleet.meetsRequirements) {
    return {
      key: 'composition',
      label: t('expedition.state.composition'),
      action: t('expedition.state.compositionAction'),
    }
  }
  if (!fleet.isSupplied) {
    return {
      key: 'supply',
      label: t('expedition.state.supply'),
      action: t('expedition.state.supplyAction'),
    }
  }
  return {
    key: 'ready',
    label: t('expedition.state.ready'),
    action: t('expedition.state.readyAction'),
  }
}

const renderDispatchStep = ({ expedition, fleet }, index) => {
  const state = pairingState(fleet)
  return `
    <article class="dep-dispatch-step dep-state-${state.key} bscolor3 fcolor2">
      <span class="dep-step-number">${index + 1}</span>
      <div class="dep-step-route">
        <span>${t('expedition.dispatchFleet', { number: fleet.fleetNumber })}</span>
        <strong><b>${escapeHtml(expedition.displayNo)}</b> ${escapeHtml(expedition.name)}</strong>
        <span>${formatDuration(expedition.durationMinutes)}</span>
        <span class="dep-step-action">${escapeHtml(state.action)}</span>
      </div>
    </article>
  `
}

const renderPairing = ({ expedition, fleet }) => {
  const state = pairingState(fleet)
  const conditionItems = conditionRows(expedition.requirements, fleet)
  const failedConditions = conditionItems.filter((condition) => !condition.passed)
  const conditions = conditionItems
    .map(
      (condition) => `
        <li class="${condition.passed ? 'pass' : 'fail'}">
          ${escapeHtml(condition.label)} <small>(${escapeHtml(condition.actual)})</small>
        </li>
      `,
    )
    .join('')
  const busyText = fleet.currentMission
    ? t('expedition.busy', {
        number: fleet.currentMission.displayNo,
        name: fleet.currentMission.name,
        time: formatDate(fleet.currentMission.completesAt),
      })
    : ''
  const sampleFleet =
    expedition.requirements.sampleFleet.length > 0
      ? t('expedition.sampleFleet', {
          ships: expedition.requirements.sampleFleet.join(t('common.listSeparator')),
        })
      : ''
  const compositionSummary =
    failedConditions.length === 0
      ? t('expedition.compositionPassed', { count: conditionItems.length })
      : t('expedition.compositionFailed', { count: failedConditions.length })
  return `
    <article class="dep-pairing dep-state-${state.key} bscolor3 fcolor2">
      <header class="dep-pairing-head">
        <h3>${t('expedition.pairingTitle', { number: fleet.fleetNumber, expedition: `${escapeHtml(expedition.displayNo)} ${escapeHtml(expedition.name)}` })} <span>· ${formatDuration(expedition.durationMinutes)}</span></h3>
        <span class="dep-readiness">${state.label}</span>
      </header>
      <p class="dep-next-action">${t('expedition.nextAction', { action: escapeHtml(state.action) })}</p>
      <div class="dep-income">
        ${resources
          .map(
            (resource) =>
              `<span style="--dep-resource:${resource.color}"><strong>${resourceLabel(resource)}</strong>${formatSigned(expedition.netIncome[resource.key])}${t('expedition.perTrip')} · ${formatSigned(expedition.hourlyIncome[resource.key], 1)}${t('common.perHour')}</span>`,
          )
          .join('')}
      </div>
      <details class="dep-fold page_panel bscolor4 fcolor2" ${failedConditions.length > 0 ? 'open' : ''}>
        <summary class="${failedConditions.length === 0 ? 'dep-fold-summary-ok' : 'dep-fold-summary-warn'}">${t('expedition.compositionCheck', { summary: compositionSummary })}</summary>
        <div class="dep-fold-body">
          <ul class="dep-conditions">${conditions}</ul>
        </div>
      </details>
      <details class="dep-fold page_panel bscolor4 fcolor2">
        <summary>${t('expedition.calculationDetails')}</summary>
        <div class="dep-fold-body">
          <ul class="dep-notes">
            ${busyText ? `<li class="dep-busy">${escapeHtml(busyText)}</li>` : ''}
            <li>${fleet.isSupplied ? t('expedition.supplyReady') : t('expedition.supplyNeeded')}</li>
            <li>${escapeHtml(modifierText(expedition.modifier))}</li>
            <li>${escapeHtml(greatSuccessText(expedition.greatSuccessCondition, fleet))}</li>
            <li>${t('expedition.daihatsuWarning')}</li>
            <li>${t('expedition.resupplyEstimate', { fuel: formatNumber(expedition.estimatedResupplyCost.fuel), ammo: formatNumber(expedition.estimatedResupplyCost.ammo) })}</li>
            ${sampleFleet ? `<li>${escapeHtml(sampleFleet)}</li>` : ''}
          </ul>
        </div>
      </details>
    </article>
  `
}

const renderPlan = (plan) => {
  return `
    <section class="dep-plan">
      <section class="dep-dispatch-board page_panel bscolor4 fcolor2">
        <div class="dep-dispatch-title">
          <h3>${t('expedition.bestPlan')}</h3>
          <span>${escapeHtml(modifierText(plan.pairings[0].expedition.modifier))}</span>
        </div>
        <div class="dep-dispatch-steps">${plan.pairings.map(renderDispatchStep).join('')}</div>
      </section>
      <div class="dep-pairing-list">${plan.pairings.map(renderPairing).join('')}</div>
    </section>
  `
}

const renderPlans = (root, result) => {
  const output = root.querySelector('#dep-output')
  if (result?.status !== 'success' || !Array.isArray(result.plans) || result.plans.length === 0) {
    const message = result?.reasonCode
      ? t(`expedition.reason.${result.reasonCode}`, result.reasonValues)
      : translateMessage(result?.error, 'expedition.noPlanFallback')
    output.innerHTML = `<div class="dep-error bscolor3 fcolor2"><strong>${t('expedition.noPlan')}</strong><span>${escapeHtml(message)}</span></div>`
    return
  }
  output.innerHTML = `<div class="dep-plan-slot">${renderPlan(result.plans[0])}</div>`
}

const updateCandidateSummary = (root) => {
  const candidates = [...root.querySelectorAll('[data-expedition-id]')]
  const selectedCount = candidates.filter((input) => input.checked).length
  root.querySelector('#dep-candidate-count').textContent =
    selectedCount === candidates.length
      ? t('common.allSelectedCount', { total: candidates.length })
      : t('common.selectedCount', { selected: selectedCount, total: candidates.length })
}

const applyCandidatePreset = (root, preset) => {
  root.querySelectorAll('[data-expedition-id]').forEach((input) => {
    const id = Number(input.dataset.expeditionId)
    input.checked =
      preset === 'all' ||
      (preset === 'recommended' && !recommendedBlacklist.has(id)) ||
      (preset === 'buckets' && bucketExpeditions.has(id))
  })
  updateCandidateSummary(root)
}

const mountPanel = (invoke) => {
  const content = document.querySelector('#content')
  const contentHtml = document.querySelector('#contentHtml')
  if (!content || !contentHtml) return

  content.style.display = 'block'
  contentHtml.innerHTML = plannerMarkup()
  contentHtml.style.display = 'block'
  window.scrollTo(0, 0)

  const root = contentHtml.querySelector('.dep-root')
  const syncButton = root.querySelector('#dep-sync')
  const generateButton = root.querySelector('#dep-generate')
  let current = null
  let initializedTargets = false

  const sync = async () => {
    syncButton.disabled = true
    syncButton.textContent = t('common.syncing')
    syncButton.title = t('expedition.syncingTitle')
    let result
    try {
      result = await invoke(EXPEDITION_SUMMARY_CHANNEL)
    } catch {
      result = { status: 'error', error: { code: 'EXPEDITION_SYNC_CONNECTION_FAILED' } }
    } finally {
      syncButton.disabled = false
    }
    if (result?.status !== 'success') {
      syncButton.textContent = t('expedition.syncFailed')
      syncButton.title = translateMessage(result?.error, 'expedition.syncUnavailable')
      generateButton.disabled = true
      return
    }
    current = result.current
    resources.forEach(({ key, defaultTarget }) => {
      const input = root.querySelector(`#dep-target-${key}`)
      input.disabled = false
      input.max = String(result.maxResource)
      if (!initializedTargets) {
        input.value = String(Math.min(result.maxResource, defaultTarget))
      }
    })
    initializedTargets = true
    updateDeficits(root, current)
    generateButton.disabled = false
    syncButton.textContent = t('expedition.syncResources')
    syncButton.title = t('expedition.syncStatus', {
      time: formatDate(result.generatedAt),
      maximum: formatNumber(result.maxResource),
    })
  }

  root.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyCandidatePreset(root, button.dataset.preset))
  })
  root.querySelectorAll('[data-expedition-id]').forEach((input) => {
    input.addEventListener('change', () => updateCandidateSummary(root))
  })
  updateCandidateSummary(root)
  root.querySelectorAll('[data-resource-weight]').forEach((input) => {
    input.addEventListener('input', () => {
      root.querySelector(
        `[data-resource-weight-value="${input.dataset.resourceWeight}"]`,
      ).textContent = input.value
    })
  })
  resources.forEach(({ key }) => {
    root.querySelector(`#dep-target-${key}`).addEventListener('input', () => {
      if (current) updateDeficits(root, current)
    })
  })
  root
    .querySelectorAll('input[name="dep-success-mode"], #dep-daihatsu-count')
    .forEach((control) => control.addEventListener('change', () => updateIncomeAssumption(root)))
  updateIncomeAssumption(root)
  syncButton.addEventListener('click', sync)
  generateButton.addEventListener('click', async () => {
    const target = targetValues(root)
    const maxTarget = Math.max(
      ...resources.map(({ key }) => Number(root.querySelector(`#dep-target-${key}`).max || 350000)),
    )
    if (
      Object.values(target).some(
        (value) => !Number.isInteger(value) || value < 0 || value > maxTarget,
      )
    ) {
      renderPlans(root, {
        status: 'error',
        error: { code: 'EXPEDITION_TARGET_INVALID', values: { maximum: formatNumber(maxTarget) } },
      })
      return
    }
    const settings = scorerSettings(root)
    const incomeModifier = incomeAssumption(root)
    if (!Number.isInteger(settings.afkMinutes) || settings.afkMinutes > 2880) {
      renderPlans(root, { status: 'error', error: { code: 'EXPEDITION_AFK_INVALID' } })
      return
    }
    if (
      Object.values(settings.resourceWeights).some(
        (value) => !Number.isInteger(value) || value < -5 || value > 20,
      )
    ) {
      renderPlans(root, {
        status: 'error',
        error: { code: 'EXPEDITION_WEIGHTS_INVALID' },
      })
      return
    }
    if (settings.candidateIds.length < settings.fleetCount) {
      renderPlans(root, {
        status: 'error',
        error: { code: 'EXPEDITION_CANDIDATES_INVALID' },
      })
      return
    }
    generateButton.disabled = true
    generateButton.textContent = t('expedition.generating')
    let result
    try {
      result = await invoke(EXPEDITION_PLAN_CHANNEL, { target, ...settings, incomeModifier })
    } catch {
      result = { status: 'error', error: { code: 'EXPEDITION_PLAN_CONNECTION_FAILED' } }
    }
    renderPlans(root, result)
    generateButton.disabled = false
    generateButton.textContent = t('expedition.generate')
  })
  sync()
}

export const injectExpeditionGoalPlanner = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  if (!document.querySelector('#damecon-expedition-goal-styles')) {
    const style = document.createElement('style')
    style.id = 'damecon-expedition-goal-styles'
    style.textContent = styles
    document.head.appendChild(style)
  }

  const scorerMenuItem = document.querySelector('#menu [data-id="expedscorer"]')
  const menuList = scorerMenuItem?.closest('ul.menulist')
  if (!menuList || document.querySelector('[data-id="damecon-expedition-recommendation"]')) return

  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-expedition-recommendation'
  menuItem.textContent = t('expedition.menu')
  menuItem.title = t('expedition.menuTitle')
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
  scorerMenuItem.insertAdjacentElement('afterend', menuItem)
}
