import { ACCOUNT_CHANNEL, MAP_OPTIONS_CHANNEL, RECOMMEND_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { hour12: false })
}

const formatEquipment = (gear) => {
  if (!gear) return `<span class="dfr-empty-gear">${t('fleet.emptySlot')}</span>`
  const improvement = gear.improvement > 0 ? ` <b>★+${gear.improvement}</b>` : ''
  const proficiency =
    gear.proficiency > 0
      ? ` <span>${t('fleet.proficiency', { value: gear.proficiency })}</span>`
      : ''
  const iconTypeId = Number(gear.iconTypeId)
  const icon =
    Number.isInteger(iconTypeId) && iconTypeId >= 0
      ? `<img class="dfr-gear-icon" src="../../assets/img/items_p2/${iconTypeId}.png" alt="" aria-hidden="true">`
      : ''
  return `<span class="dfr-gear">${icon}<span class="dfr-gear-copy">${escapeHtml(gear.name)}${improvement}${proficiency} <small>#${gear.id}</small></span></span>`
}

const panelMarkup = () => `
  <div id="damecon-fleet-recommender" class="dfr-root tab_fleet">
    <div class="page_title">
      <span>${t('fleet.title')}</span>
      <div class="page_help_btn hover"><span>?</span> <span>${t('common.help')}</span></div>
    </div>

    <div class="page_help">
      <div class="help_q">${t('fleet.help.whatQuestion')}</div>
      <div class="help_a">${t('fleet.help.whatAnswer')}</div>
      <div class="help_q">${t('fleet.help.automaticQuestion')}</div>
      <div class="help_a">${t('fleet.help.automaticAnswer')}</div>
      <div class="help_q">${t('fleet.help.scopeQuestion')}</div>
      <div class="help_a">${t('fleet.help.scopeAnswer')}</div>
    </div>

    <section class="page_panel bscolor4 dfr-account" aria-live="polite">
      <div>
        <strong id="dfr-account-title">${t('fleet.account.loading')}</strong>
        <span id="dfr-account-detail">${t('common.loading')}</span>
      </div>
      <button id="dfr-sync" class="dfr-button dfr-button-quiet" type="button">${t('fleet.sync')}</button>
    </section>

    <div class="page_padding">
      <div class="page_section">${t('fleet.conditions')}</div>
      <section class="section_body dfr-controls">
        <div class="dfr-control-row">
          <label class="dfr-field">
            <span>${t('fleet.map')}</span>
            <select id="dfr-map" class="control_input" disabled></select>
          </label>
          <label class="dfr-field">
            <span>${t('fleet.route')}</span>
            <select id="dfr-route-select" class="control_input" disabled></select>
          </label>
          <fieldset class="dfr-objectives">
            <legend>${t('fleet.objective')}</legend>
            <div id="dfr-objective-options"></div>
          </fieldset>
        </div>
        <div class="dfr-route-row bscolor3 fcolor2">
          <span class="dfr-field-label">${t('fleet.dataStatus')}</span>
          <strong id="dfr-map-summary" class="dfr-route">${t('fleet.loading')}</strong>
        </div>
        <div class="dfr-action-row">
          <label class="dfr-check">
            <input id="dfr-preserve-fleet" type="checkbox">
            ${t('fleet.keepEquipment')}
          </label>
          <button id="dfr-generate" class="dfr-button" type="button" disabled>
            <span>${t('fleet.generate')}</span>
          </button>
        </div>
      </section>

      <div class="page_section">${t('fleet.results')}</div>
      <div id="dfr-output" class="dfr-output" aria-live="polite">
        <div class="dfr-idle bscolor3 fcolor2">
          <strong>${t('fleet.idleTitle')}</strong>
          <span>${t('fleet.idleDetail')}</span>
        </div>
      </div>
    </div>
  </div>
`

const styles = `
  .dfr-root {
    width: 700px;
    min-height: 760px;
  }
  .dfr-root *, .dfr-root *::before, .dfr-root *::after { box-sizing: border-box; }
  .dfr-account {
    display: flex; justify-content: space-between; align-items: center;
    min-height: 42px; font-size: 12px;
  }
  .dfr-account strong { margin-right: 8px; }
  .dfr-account span { font-size: 11px; }
  .dfr-button {
    min-width: 90px; height: 26px; padding: 0 10px; cursor: pointer;
  }
  .dfr-button:disabled { cursor: not-allowed; opacity: .5; }
  body.dark .dfr-button { border: 1px solid #444; background: #121212; color: #ccc; }
  body:not(.dark) .dfr-button { border: 1px solid #ace; border-radius: 8px; background: #def; color: #369; }
  .dfr-button:focus-visible, .dfr-root input:focus-visible, .dfr-root select:focus-visible,
  .dfr-plan-tab:focus-visible { outline: 2px solid #69c; outline-offset: 1px; }
  .dfr-controls { margin-bottom: 16px; }
  .dfr-control-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; margin-bottom: 8px; }
  .dfr-field > span, .dfr-objectives legend, .dfr-field-label { display: block; font-weight: bold; font-size: 12px; }
  .dfr-field select { width: 218px; height: 26px; margin-top: 4px; }
  .dfr-objectives { margin: 0; padding: 0; border: 0; }
  .dfr-objectives legend { margin-bottom: 5px; }
  .dfr-objectives label { margin-right: 12px; font-size: 12px; font-weight: normal; cursor: pointer; }
  .dfr-route-row { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 6px 10px; font-size: 11px; }
  .dfr-route { min-width: 105px; font-size: 13px; white-space: nowrap; }
  body.dark .dfr-route { color: #fc0; }
  body:not(.dark) .dfr-route { color: #069; }
  .dfr-action-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .dfr-check { font-size: 12px; cursor: pointer; }
  .dfr-output { padding-bottom: 20px; }
  .dfr-idle { min-height: 52px; padding: 10px; font-size: 11px; text-align: center; }
  .dfr-idle strong { display: block; margin-bottom: 3px; font-size: 12px; }
  .dfr-plan-tabs { display: flex; gap: 5px; margin-bottom: 8px; }
  .dfr-plan-tab { flex: 1; min-height: 34px; padding: 4px 8px; cursor: pointer; text-align: left; }
  .dfr-plan-tab span { font-size: 11px; }
  .dfr-plan-tab strong { float: right; font-size: 14px; }
  body.dark .dfr-plan-tab { border: 1px solid #444; background: #121212; color: #aaa; }
  body.dark .dfr-plan-tab.active { border-color: #777; color: #fc0; background: #000; }
  body:not(.dark) .dfr-plan-tab { border: 1px solid #ace; border-radius: 8px; background: #def; color: #79b; }
  body:not(.dark) .dfr-plan-tab.active { border-color: #369; color: #000; background: #fff; }
  .dfr-plan { width: 680px; }
  body.dark .dfr-plan { border-bottom: 1px solid #777; padding-bottom: 10px; }
  body:not(.dark) .dfr-plan { padding: 0 5px 5px; border-radius: 12px; background: #def; }
  .dfr-plan-head { display: flex; justify-content: space-between; align-items: center; min-height: 35px; padding: 5px; }
  .dfr-plan-head h2 { display: inline; margin: 0 8px 0 0; font-size: 14px; }
  .dfr-plan-head p { display: inline; margin: 0; font-size: 11px; }
  .dfr-score { min-width: 82px; height: 25px; padding: 4px 6px; font-size: 14px; font-weight: bold; text-align: center; }
  .dfr-score small { font-size: 9px; font-weight: normal; }
  .dfr-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 0 4px 6px; }
  .dfr-metric { min-height: 43px; padding: 5px 7px; }
  .dfr-metric span { display: block; font-size: 10px; }
  .dfr-metric strong { margin-right: 4px; font-size: 15px; }
  .dfr-metric small { font-size: 9px; }
  .dfr-ship-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; margin: 0 4px; }
  .dfr-ship { min-width: 0; padding: 6px 8px; }
  body:not(.dark) .dfr-ship { border-radius: 8px; }
  .dfr-ship-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; min-height: 22px; }
  .dfr-ship h3 { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .dfr-ship h3 span { font-size: 10px; }
  body.dark .dfr-ship h3 span, body.dark .dfr-role { color: #fc0; }
  body:not(.dark) .dfr-ship h3 span, body:not(.dark) .dfr-role { color: #069; }
  .dfr-role { font-size: 9px; white-space: nowrap; }
  .dfr-gear-list { list-style: none; margin: 0; padding: 0; }
  .dfr-gear-list li { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 4px; min-height: 19px; padding: 2px 0; font-size: 10px; line-height: 1.4; }
  body.dark .dfr-gear-list li { border-top: 1px solid #303030; }
  body:not(.dark) .dfr-gear-list li { border-top: 1px solid #ddd; }
  .dfr-gear-list li > span:first-child { color: #777; font-size: 9px; }
  .dfr-gear { display: flex; align-items: center; min-width: 0; }
  .dfr-gear-icon { flex: 0 0 18px; width: 18px; height: 18px; margin-right: 5px; object-fit: contain; }
  .dfr-gear-copy { min-width: 0; }
  .dfr-gear-list b { color: #f90; font-weight: normal; }
  .dfr-gear-list small { color: #777; font-size: 8px; }
  .dfr-empty-gear { color: #c44; }
  .dfr-notes { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin: 6px 4px 0; }
  .dfr-note-group { min-height: 58px; padding: 6px 8px; }
  body:not(.dark) .dfr-note-group { border-radius: 8px; }
  .dfr-note-group h4 { margin: 0 0 3px; font-size: 11px; }
  .dfr-note-group ul { margin: 0; padding-left: 16px; }
  .dfr-note-group li { margin: 2px 0; font-size: 10px; line-height: 1.4; }
  body.dark .dfr-note-group.warning li { color: #fc0; }
  body:not(.dark) .dfr-note-group.warning li { color: #960; }
  .dfr-error { padding: 10px; }
  body.dark .dfr-error { border: 1px solid #744; background: #211; }
  body:not(.dark) .dfr-error { border: 1px solid #c88; border-radius: 8px; background: #fee; }
  .dfr-error h2 { margin: 0 0 5px; color: #c44; font-size: 14px; }
  .dfr-error li { font-size: 11px; line-height: 1.5; }
  @media (max-width: 720px) {
    .dfr-root, .dfr-plan { width: 100%; }
    .dfr-control-row { display: block; }
    .dfr-objectives { margin-top: 8px; }
    .dfr-route-row { align-items: flex-start; flex-direction: column; gap: 2px; }
    .dfr-plan-tabs { flex-direction: column; }
    .dfr-metrics { grid-template-columns: repeat(2, 1fr); }
    .dfr-ship-grid { grid-template-columns: 1fr; }
    .dfr-notes { grid-template-columns: 1fr; }
  }
`

const renderRecommendation = (recommendation, planIndex) => {
  const metrics = recommendation.metrics
  const sourceMarkup = recommendation.route.sources
    .map(
      (source, index) =>
        `<a href="${escapeHtml(source)}" target="_blank" rel="noreferrer">${t('fleet.source', { index: index + 1 })}</a>`,
    )
    .join(' · ')
  const resourceMetricMarkup =
    metrics.estimatedResourceGain === null
      ? `
        <div class="dfr-metric bscolor3 fcolor2"><span>${t('fleet.estimatedFuel')}</span><strong>${metrics.estimatedFuelCost}</strong><small>${t('fleet.singleSortie')}</small></div>
        <div class="dfr-metric bscolor3 fcolor2"><span>${t('fleet.estimatedAmmo')}</span><strong>${metrics.estimatedAmmoCost}</strong><small>${t('fleet.singleSortie')}</small></div>
      `
      : `
        <div class="dfr-metric bscolor3 fcolor2"><span>${t('fleet.expectedResource', { resource: t(`common.${metrics.resourceTarget}`) || t('fleet.resourceFallback') })}</span><strong>${metrics.estimatedResourceGain}</strong><small>${t('fleet.includingArrivalRate')}</small></div>
        <div class="dfr-metric bscolor3 fcolor2"><span>${t('fleet.expectedNetResource', { resource: t(`common.${metrics.resourceTarget}`) || t('fleet.resourceFallback') })}</span><strong>${metrics.estimatedNetResourceGain}</strong><small>${t('fleet.afterSortieCost')}</small></div>
      `
  const shipMarkup = recommendation.ships
    .map(
      (build) => `
        <article class="dfr-ship bscolor3 fcolor2">
          <div class="dfr-ship-head">
            <h3>${escapeHtml(build.ship.name)} <span>Lv.${build.ship.level}</span></h3>
            <span class="dfr-role">${escapeHtml(t(`fleet.role.${build.role}`))}</span>
          </div>
          <ol class="dfr-gear-list">
            ${build.equipment
              .map(
                (gear, slotIndex) => `
                  <li><span>${t('fleet.slot', { index: slotIndex + 1 })}<br>${t('fleet.slotAircraft', { count: build.ship.slotSizes[slotIndex] || 0 })}</span><span>${formatEquipment(gear)}</span></li>
                `,
              )
              .join('')}
            <li><span>EX</span><span>${formatEquipment(build.expansionSlot)}</span></li>
          </ol>
        </article>
      `,
    )
    .join('')
  const reasons = recommendation.reasons
    .map((reason) => `<li>${escapeHtml(translateMessage(reason))}</li>`)
    .join('')
  const warnings = recommendation.warnings
    .map((warning) => `<li>${escapeHtml(translateMessage(warning))}</li>`)
    .join('')

  return `
    <article class="dfr-plan">
      <header class="dfr-plan-head">
        <div><h2>${escapeHtml(`${recommendation.route.name} · ${t('fleet.recommendationTab', { index: planIndex + 1 })}`)}</h2><p>${escapeHtml(`${recommendation.route.phase ? `${recommendation.route.phase} · ` : ''}${recommendation.route.nodes.join(' → ')} · ${t(`fleet.confidence.${recommendation.route.confidence}`)}`)} · ${sourceMarkup} · ${t('fleet.verifiedAt', { date: escapeHtml(recommendation.route.lastVerified) })}</p></div>
        <div class="dfr-score bscolor3 fcolor2">${recommendation.score.total.toFixed(1)} <small>${t('fleet.score')} / 100</small></div>
      </header>
      <div class="dfr-metrics">
        <div class="dfr-metric bscolor3 fcolor2"><span>${t('fleet.airPower')}</span><strong>${metrics.airPower}</strong><small>${metrics.airPowerRequired ? t('common.minimum', { value: metrics.airPowerMinimum }) : t('common.noMinimum')}</small></div>
        <div class="dfr-metric bscolor3 fcolor2"><span>${t('fleet.los')}</span><strong>${metrics.los33.toFixed(1)}</strong><small>${metrics.losRequired ? t('common.minimum', { value: metrics.losMinimum }) : t('common.noMinimum')}</small></div>
        ${resourceMetricMarkup}
      </div>
      <div class="dfr-ship-grid">${shipMarkup}</div>
      <footer class="dfr-notes">
        <section class="dfr-note-group bscolor3 fcolor2"><h4>${t('fleet.reasons')}</h4><ul>${reasons}</ul></section>
        <section class="dfr-note-group warning bscolor3 fcolor2"><h4>${t('fleet.warnings')}</h4><ul>${warnings}</ul></section>
      </footer>
    </article>
  `
}

const renderResults = (output, result) => {
  let activeIndex = 0
  const renderActivePlan = () => {
    const recommendation = result.recommendations[activeIndex]
    output.innerHTML = `
      <nav class="dfr-plan-tabs" aria-label="${t('fleet.planNavigation')}">
        ${result.recommendations
          .map(
            (item, index) => `
              <button class="dfr-plan-tab${index === activeIndex ? ' active' : ''}" data-plan-index="${index}" type="button">
                <span>${escapeHtml(t('fleet.recommendationTab', { index: index + 1 }))}</span><strong>${item.score.total.toFixed(1)}</strong>
              </button>
            `,
          )
          .join('')}
      </nav>
      ${renderRecommendation(recommendation, activeIndex)}
    `
    output.querySelectorAll('[data-plan-index]').forEach((button) => {
      button.addEventListener('click', () => {
        activeIndex = Number(button.dataset.planIndex)
        renderActivePlan()
      })
    })
  }
  renderActivePlan()
}

const renderError = (output, title, messages) => {
  output.innerHTML = `
    <section class="dfr-error fcolor2">
      <h2>${escapeHtml(title)}</h2>
      <ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul>
    </section>
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

  const title = contentHtml.querySelector('#dfr-account-title')
  const detail = contentHtml.querySelector('#dfr-account-detail')
  const syncButton = contentHtml.querySelector('#dfr-sync')
  const generateButton = contentHtml.querySelector('#dfr-generate')
  const preserveFleet = contentHtml.querySelector('#dfr-preserve-fleet')
  const mapSelect = contentHtml.querySelector('#dfr-map')
  const routeSelect = contentHtml.querySelector('#dfr-route-select')
  const objectiveOptions = contentHtml.querySelector('#dfr-objective-options')
  const mapSummary = contentHtml.querySelector('#dfr-map-summary')
  const output = contentHtml.querySelector('#dfr-output')
  let accountReady = false
  let mapOptionsReady = false
  let mapOptions = []

  const setBusy = (busy) => {
    syncButton.disabled = busy
    mapSelect.disabled = busy || !mapOptionsReady
    routeSelect.disabled = busy || !mapOptionsReady
    generateButton.disabled = busy || !accountReady || !mapOptionsReady
    generateButton.querySelector('span').textContent = busy
      ? t('fleet.generating')
      : t('fleet.generate')
  }

  const renderMapObjectives = () => {
    const mapOption = mapOptions.find((item) => item.id === mapSelect.value)
    if (!mapOption) return
    objectiveOptions.innerHTML = mapOption.objectives
      .map(
        (objective, index) => `
          <label><input type="radio" name="dfr-objective" value="${escapeHtml(objective)}"${index === 0 ? ' checked' : ''}> ${escapeHtml(t(`fleet.objective.${objective}`))}</label>
        `,
      )
      .join('')
    renderRouteOptions()
  }

  const renderRouteOptions = () => {
    const mapOption = mapOptions.find((item) => item.id === mapSelect.value)
    const objective = contentHtml.querySelector('input[name="dfr-objective"]:checked')?.value
    if (!mapOption || !objective) return
    const routes = mapOption.routes.filter((route) => route.objectives.includes(objective))
    routeSelect.innerHTML = [
      `<option value="">${t('fleet.autoRoutes')}</option>`,
      ...routes.map(
        (route) =>
          `<option value="${escapeHtml(route.id)}">${escapeHtml(route.phase ? `${route.phase}｜${route.name}` : route.name)}${route.stableBoss ? `｜${t('fleet.stable')}` : ''}</option>`,
      ),
    ].join('')
    mapSummary.textContent = t('fleet.routeSummary', {
      routeCount: mapOption.routeCount,
      stableCount: mapOption.stableBossRouteCount,
    })
  }

  const loadMapOptions = async () => {
    const result = await invoke(MAP_OPTIONS_CHANNEL)
    if (result.status !== 'success') {
      mapSummary.textContent = translateMessage(result.error, 'fleet.mapUnavailableDetail')
      return
    }
    mapOptions = result.maps
    mapSelect.innerHTML = mapOptions
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)}｜${escapeHtml(item.name)}</option>`,
      )
      .join('')
    if (mapOptions.some((item) => item.id === '1-1')) mapSelect.value = '1-1'
    mapOptionsReady = true
    renderMapObjectives()
    setBusy(false)
  }

  const syncAccount = async ({ invalidateResults = false } = {}) => {
    setBusy(true)
    title.textContent = t('fleet.account.loading')
    detail.textContent = t('fleet.account.validating')
    if (invalidateResults) {
      output.innerHTML = `
        <div class="dfr-idle bscolor3 fcolor2">
          <strong>${t('fleet.resyncingTitle')}</strong>
          <span>${t('fleet.resyncingDetail')}</span>
        </div>
      `
    }
    const result = await invoke(ACCOUNT_CHANNEL)
    if (result.status === 'success') {
      accountReady = true
      title.textContent = t('fleet.account.synced', {
        ships: result.account.shipCount,
        equipment: result.account.equipmentCount,
      })
      detail.textContent = t('fleet.account.snapshot', {
        time: formatDate(result.account.generatedAt),
      })
      if (invalidateResults) {
        output.innerHTML = `
          <div class="dfr-idle bscolor3 fcolor2">
            <strong>${t('fleet.updatedTitle')}</strong>
            <span>${t('fleet.updatedDetail')}</span>
          </div>
        `
      }
    } else {
      accountReady = false
      title.textContent = t('fleet.account.unavailable')
      detail.textContent = translateMessage(result.error, 'fleet.account.syncFirst')
      if (invalidateResults) {
        renderError(output, t('fleet.resyncIncomplete'), [detail.textContent])
      }
    }
    setBusy(false)
  }

  syncButton.addEventListener('click', () => syncAccount({ invalidateResults: true }))
  mapSelect.addEventListener('change', renderMapObjectives)
  objectiveOptions.addEventListener('change', renderRouteOptions)
  generateButton.addEventListener('click', async () => {
    const objective = contentHtml.querySelector('input[name="dfr-objective"]:checked').value
    const mapId = mapSelect.value
    setBusy(true)
    output.innerHTML = `<div class="dfr-idle bscolor3 fcolor2"><strong>${t('fleet.planningTitle')}</strong><span>${t('fleet.planningDetail')}</span></div>`
    try {
      const result = await invoke(RECOMMEND_CHANNEL, {
        mapId,
        objective,
        routeId: routeSelect.value || undefined,
        avoidCurrentFleetEquipment: preserveFleet.checked,
      })
      if (result.status === 'success') {
        renderResults(output, result)
      } else if (result.status === 'no-solution') {
        renderError(
          output,
          t('fleet.noSolutionForObjective', {
            mapId,
            objective: t(`fleet.objective.${objective}`),
          }),
          result.analysis.reasons.map((reason) => translateMessage(reason)),
        )
      } else {
        renderError(output, t('fleet.incomplete'), [translateMessage(result.error)])
      }
    } catch {
      renderError(output, t('fleet.serviceUnavailable'), [t('fleet.failedFallback')])
    } finally {
      setBusy(false)
    }
  })

  syncAccount().catch(() => {
    accountReady = false
    title.textContent = t('fleet.account.unavailable')
    detail.textContent = t('fleet.account.syncFirst')
    setBusy(false)
  })
  loadMapOptions().catch(() => {
    mapSummary.textContent = t('fleet.mapUnavailableDetail')
    mapOptionsReady = false
    setBusy(false)
  })
}

export const injectFleetRecommender = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  const style = document.createElement('style')
  style.id = 'damecon-fleet-recommender-style'
  style.textContent = styles
  document.head.appendChild(style)

  const fleetMenuItem = document.querySelector('#menu [data-id="fleet"]')
  const menuList = fleetMenuItem?.closest('ul.menulist')
  if (!menuList || document.querySelector('[data-id="damecon-recommendation"]')) return

  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-recommendation'
  menuItem.textContent = t('fleet.menu')
  menuItem.title = t('fleet.menuTitle')
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
  menuList.appendChild(menuItem)
}
