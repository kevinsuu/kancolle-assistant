import { ACCOUNT_CHANNEL, MAP_OPTIONS_CHANNEL, RECOMMEND_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import { escapeHtml, formatLocalizedDate } from './strategy-room-format'
import { panelMarkup, styles } from './views/fleet-recommender-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()
let cachedAccountResult = null
let cachedMapOptionsResult = null

const formatDate = (value) => formatLocalizedDate(value, locale, { hour12: false }, '—')

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

const formatBuildSpeed = (ship) => {
  const base = t(`fleet.speed.${ship.speed}`)
  const final = t(`fleet.speed.${ship.finalSpeed}`)
  return ship.finalSpeed === ship.speed
    ? t('fleet.baseSpeed', { speed: base })
    : t('fleet.speedTransition', { base, final })
}

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
            <span class="dfr-role">${escapeHtml(t(`fleet.role.${build.role}`))} · ${escapeHtml(formatBuildSpeed(build.ship))}</span>
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
        <div><h2>${escapeHtml(`${recommendation.route.name} · ${t('fleet.recommendationTab', { index: planIndex + 1 })}`)}</h2><p>${escapeHtml(`${recommendation.route.phase ? `${recommendation.route.phase} · ` : ''}${recommendation.route.nodes.join(' → ')} · ${t(`fleet.confidence.${recommendation.route.confidence}`)} · ${t('fleet.fleetSpeed', { speed: t(`fleet.speed.${metrics.finalSpeedClass}`) })}`)} · ${sourceMarkup} · ${t('fleet.verifiedAt', { date: escapeHtml(recommendation.route.lastVerified) })}</p></div>
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

const waitForNextPaint = () =>
  new Promise((resolve) => {
    let settled = false
    let timeoutId
    const finish = () => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      resolve()
    }
    timeoutId = window.setTimeout(finish, 100)
    if (typeof window.requestAnimationFrame !== 'function') return
    window.requestAnimationFrame(() => window.requestAnimationFrame(finish))
  })

const mountPanel = (invoke) => {
  const content = document.querySelector('#content')
  const contentHtml = document.querySelector('#contentHtml')
  if (!content || !contentHtml) return

  content.style.display = 'block'
  contentHtml.innerHTML = panelMarkup(t)
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
  let accountSyncing = true
  let mapOptionsReady = false
  let mapOptions = []
  let busyOperationCount = 0

  const updateBusy = () => {
    const busy = busyOperationCount > 0
    syncButton.disabled = busy || accountSyncing
    mapSelect.disabled = busy || !mapOptionsReady
    routeSelect.disabled = busy || !mapOptionsReady
    generateButton.disabled = busy || !accountReady || !mapOptionsReady
    generateButton.querySelector('span').textContent = busy
      ? t('fleet.generating')
      : t('fleet.generate')
  }
  const beginBusy = () => {
    busyOperationCount += 1
    updateBusy()
  }
  const endBusy = () => {
    busyOperationCount = Math.max(0, busyOperationCount - 1)
    updateBusy()
  }

  const showAccountSummary = (account) => {
    cachedAccountResult = { status: 'success', account }
    accountReady = true
    title.textContent = t('fleet.account.synced', {
      ships: account.shipCount,
      equipment: account.equipmentCount,
    })
    detail.textContent = t('fleet.account.snapshot', {
      time: formatDate(account.generatedAt),
    })
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
          `<option value="${escapeHtml(route.id)}">${escapeHtml(route.phase ? `${route.phase}｜${route.name}` : route.name)}${route.stableBoss ? `｜${t('fleet.stable')}` : ''}${route.automaticReady ? '' : `｜${t('fleet.manualSetup')}`}</option>`,
      ),
    ].join('')
    mapSummary.textContent = t('fleet.routeSummary', {
      routeCount: mapOption.routeCount,
      stableCount: mapOption.stableBossRouteCount,
    })
  }

  const loadMapOptions = async () => {
    updateBusy()
    try {
      const result = cachedMapOptionsResult ?? (await invoke(MAP_OPTIONS_CHANNEL))
      if (result.status !== 'success') {
        mapSummary.textContent = translateMessage(result.error, 'fleet.mapUnavailableDetail')
        return
      }
      cachedMapOptionsResult = result
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
    } finally {
      updateBusy()
    }
  }

  const syncAccount = async ({
    invalidateResults = false,
    forceRefresh = false,
    blockControls = true,
  } = {}) => {
    if (forceRefresh) cachedAccountResult = null
    accountSyncing = true
    if (blockControls) beginBusy()
    else updateBusy()
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
    try {
      const result =
        !forceRefresh && cachedAccountResult
          ? cachedAccountResult
          : await invoke(ACCOUNT_CHANNEL, { forceRefresh })
      if (result.status === 'success') {
        showAccountSummary(result.account)
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
    } catch {
      accountReady = false
      title.textContent = t('fleet.account.unavailable')
      detail.textContent = t('fleet.failedFallback')
      if (invalidateResults) {
        renderError(output, t('fleet.resyncIncomplete'), [detail.textContent])
      }
    } finally {
      accountSyncing = false
      if (blockControls) endBusy()
      else updateBusy()
    }
  }

  syncButton.addEventListener('click', () =>
    syncAccount({ invalidateResults: true, forceRefresh: true }),
  )
  mapSelect.addEventListener('change', renderMapObjectives)
  objectiveOptions.addEventListener('change', renderRouteOptions)
  generateButton.addEventListener('click', async () => {
    const objective = contentHtml.querySelector('input[name="dfr-objective"]:checked').value
    const mapId = mapSelect.value
    beginBusy()
    generateButton.classList.add('is-loading')
    generateButton.setAttribute('aria-busy', 'true')
    output.setAttribute('aria-busy', 'true')
    output.innerHTML = `<div class="dfr-idle dfr-loading bscolor3 fcolor2"><strong>${t('fleet.planningTitle')}</strong><span>${t('fleet.planningDetail')}</span></div>`
    try {
      await waitForNextPaint()
      const result = await invoke(RECOMMEND_CHANNEL, {
        mapId,
        objective,
        routeId: routeSelect.value || undefined,
        avoidCurrentFleetEquipment: preserveFleet.checked,
      })
      if (result.account) showAccountSummary(result.account)
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
      generateButton.classList.remove('is-loading')
      generateButton.removeAttribute('aria-busy')
      output.removeAttribute('aria-busy')
      endBusy()
    }
  })

  const loadInitialData = async () => {
    try {
      await loadMapOptions()
    } catch {
      mapSummary.textContent = t('fleet.mapUnavailableDetail')
      mapOptionsReady = false
      updateBusy()
    }

    await waitForNextPaint()
    try {
      await syncAccount({ blockControls: false })
    } catch {
      accountReady = false
      title.textContent = t('fleet.account.unavailable')
      detail.textContent = t('fleet.account.syncFirst')
      updateBusy()
    }
  }

  loadInitialData()
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
