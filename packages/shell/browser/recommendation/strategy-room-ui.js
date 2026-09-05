import { ACCOUNT_CHANNEL, MAP_OPTIONS_CHANNEL, RECOMMEND_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import { escapeHtml, formatLocalizedDate } from './strategy-room-format'
import { panelMarkup, styles } from './views/fleet-recommender-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()
let cachedAccountResult = null
let cachedMapOptionsResult = null

const formatDate = (value) => formatLocalizedDate(value, locale, { hour12: false }, '—')
const HIDDEN_RESULT_MESSAGE_CODES = new Set([
  'EQUIPMENT_INSTANCES_UNIQUE',
  'HEURISTIC_COMBAT_SCORE',
  'KC3_COMBAT_EVALUATION_APPLIED',
])

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

const factMarkup = (label, value) => `
  <li class="bscolor4">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
  </li>
`

const sourceLinks = (sources) =>
  sources
    .map(
      (source, index) =>
        `<li><a href="${escapeHtml(source)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(t('fleet.source', { index: index + 1 }))}">${escapeHtml(source)}</a></li>`,
    )
    .join('')

const uniqueRouteSources = (routes) =>
  Array.from(
    new Set(routes.flatMap((route) => (Array.isArray(route.sources) ? route.sources : []))),
  )

const sourceSiteLabels = new Map([
  ['zekamashi.net', 'ぜかまし'],
  ['zh.kcwiki.cn', 'KCWiki'],
  ['m.kcwiki.cn', 'KCWiki'],
  ['forum.gamer.com.tw', '巴哈姆特'],
  ['bbs.nga.cn', 'NGA'],
  ['yuikancolle.blog.fc2.com', 'Yui'],
  ['en.kancollewiki.net', 'Kancolle Wiki'],
  ['wikiwiki.jp', 'Wikiwiki'],
  ['kankorekore.2-d.jp', '艦これこれ'],
])

const sourceHost = (source) => {
  try {
    return new URL(source).hostname.replace(/^www\./, '')
  } catch {
    return String(source)
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .replace(/^www\./, '')
  }
}

const sourceSiteLabel = (source) => {
  const host = sourceHost(source)
  return sourceSiteLabels.get(host) ?? host
}

const routeSourceLabel = (route) => {
  const sources = Array.isArray(route.sources) ? route.sources : []
  const labels = Array.from(new Set(sources.map(sourceSiteLabel).filter(Boolean)))
  return labels.length > 0 ? labels.join(' + ') : ''
}

const routeDisplayName = (route) =>
  route.name.replace(
    /^(?:(?:攻略網|KCWiki|艦娘百科|Kancolle Wiki|Wikiwiki|ぜかまし|Yui|NGA|巴哈姆特|艦これこれ)(?:\s*\+\s*|[・｜|:：\s]+))+/,
    '',
  )

export const routeOptionLabel = (route) => {
  const guide = routeSourceLabel(route)
  const name = route.phase ? `${route.phase}｜${routeDisplayName(route)}` : routeDisplayName(route)
  return [name, guide].filter(Boolean).join('｜') || route.name
}

const GUIDE_OBJECTIVE_PRIORITY = [
  'balanced',
  'boss-clear',
  'low-cost',
  'leveling',
  'resource-fuel',
  'resource-bauxite',
  'resource-burner',
  'resource-ammo',
  'resource-steel',
  'resource-bucket',
  'resource-devmat',
]

const routeObjective = (route) =>
  GUIDE_OBJECTIVE_PRIORITY.find((objective) => route.objectives?.includes(objective)) ??
  route.objectives?.[0] ??
  'balanced'

export const localizedRouteDescription = (route, translate = t) => {
  const key = route?.id ? `fleet.routeDescription.${route.id}` : ''
  const translated = key ? translate(key) : ''
  return translated && translated !== key ? translated : route?.description || ''
}

const strategyFacts = (recommendation) => {
  const metrics = recommendation.metrics
  const route = recommendation.route
  const facts = [
    factMarkup(
      t('fleet.strategyRoute'),
      route.nodes.length ? route.nodes.join(' → ') : t('fleet.routeUnknown'),
    ),
    factMarkup(t('fleet.strategySpeed'), t(`fleet.speed.${metrics.finalSpeedClass}`)),
  ]
  if (metrics.airPowerRequired) {
    facts.push(
      factMarkup(
        t('fleet.strategyAirPower'),
        t('fleet.strategyMinimumValue', {
          value: metrics.airPower,
          minimum: metrics.airPowerMinimum,
        }),
      ),
    )
  }
  if (metrics.losRequired) {
    facts.push(
      factMarkup(
        t('fleet.strategyLos'),
        t('fleet.strategyMinimumValue', {
          value: metrics.los33.toFixed(1),
          minimum: metrics.losMinimum,
        }),
      ),
    )
  }
  if (metrics.openingAswRequired) {
    facts.push(
      factMarkup(
        t('fleet.strategyOpeningAsw'),
        t('fleet.strategyMinimumValue', {
          value: metrics.openingAswCount,
          minimum: metrics.openingAswMinimum,
        }),
      ),
    )
  }
  if (metrics.estimatedResourceGain !== null) {
    const resourceLabel = t(`common.${metrics.resourceTarget}`) || t('fleet.resourceFallback')
    facts.push(
      factMarkup(
        t('fleet.strategyResourceGain', { resource: resourceLabel }),
        t('fleet.strategyResourceValue', {
          gain: metrics.estimatedResourceGain,
          net: metrics.estimatedNetResourceGain,
        }),
      ),
    )
  }
  return facts.join('')
}

const messageList = (messages) =>
  messages
    .filter((message) => !HIDDEN_RESULT_MESSAGE_CODES.has(message.code))
    .map((message) => `<li>${escapeHtml(translateMessage(message))}</li>`)
    .join('')

const renderRecommendation = (recommendation, planIndex) => {
  const route = recommendation.route
  const routeTitle = routeOptionLabel(route)
  const phase = route.phase ? `${route.phase} · ` : ''
  const notes = messageList(recommendation.reasons)
  const warnings = messageList(recommendation.warnings)
  const notesMarkup = notes
    ? `<section class="dfr-note-group bscolor3 fcolor2"><h4>${t('fleet.strategyNotes')}</h4><ul>${notes}</ul></section>`
    : ''
  const warningsMarkup = warnings
    ? `<section class="dfr-note-group warning bscolor3 fcolor2"><h4>${t('fleet.warnings')}</h4><ul>${warnings}</ul></section>`
    : ''
  const rosterMarkup = recommendation.ships
    .map(
      (build, index) => `
        <li class="bscolor3 fcolor2">
          <span>${index + 1}</span>
          <strong>${escapeHtml(build.ship.name)}</strong>
          <small>Lv.${build.ship.level} · ${escapeHtml(t(`fleet.role.${build.role}`))} · ${escapeHtml(formatBuildSpeed(build.ship))}</small>
        </li>
      `,
    )
    .join('')
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

  return `
    <article class="dfr-plan">
      <header class="dfr-plan-head">
        <div>
          <h2>${escapeHtml(`${routeTitle} · ${t('fleet.recommendationTab', { index: planIndex + 1 })}`)}</h2>
          <p>${escapeHtml(`${phase}${t(`fleet.confidence.${route.confidence}`)} · ${t('fleet.verifiedAt', { date: route.lastVerified })}`)}</p>
        </div>
      </header>
      <section class="dfr-guide bscolor3 fcolor2">
        <h3>${t('fleet.strategyGuide')}</h3>
        <p>${escapeHtml(localizedRouteDescription(route) || t('fleet.strategyNoDescription'))}</p>
        <ul class="dfr-facts">${strategyFacts(recommendation)}</ul>
      </section>
      <section class="dfr-roster-section">
        <h3>${t('fleet.strategyShips')}</h3>
        <ol class="dfr-roster">${rosterMarkup}</ol>
      </section>
      <section class="dfr-loadout-section">
        <h3>${t('fleet.strategyEquipment')}</h3>
        <div class="dfr-ship-grid">${shipMarkup}</div>
      </section>
      ${notesMarkup || warningsMarkup ? `<footer class="dfr-notes">${notesMarkup}${warningsMarkup}</footer>` : ''}
    </article>
  `
}

const renderResults = (output, result, onActivePlanChange = () => {}) => {
  let activeIndex = 0
  const renderActivePlan = () => {
    const recommendation = result.recommendations[activeIndex]
    onActivePlanChange(recommendation.route.sources || [])
    output.innerHTML = `
      <nav class="dfr-plan-tabs" aria-label="${t('fleet.planNavigation')}">
        ${result.recommendations
          .map(
            (item, index) => `
              <button class="dfr-plan-tab${index === activeIndex ? ' active' : ''}" data-plan-index="${index}" type="button">
                <span>${escapeHtml(t('fleet.recommendationTab', { index: index + 1 }))}</span><strong>${escapeHtml(routeOptionLabel(item.route))}</strong>
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

let disposePanelSubscription = () => {}
const mountPanel = (invoke, onSnapshotChanged) => {
  disposePanelSubscription()
  let viewGeneration = 0
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
  const mapSelect = contentHtml.querySelector('#dfr-map')
  const routeSelect = contentHtml.querySelector('#dfr-route-select')
  const mapSummary = contentHtml.querySelector('#dfr-map-summary')
  const mapSourceList = contentHtml.querySelector('#dfr-map-sources')
  const output = contentHtml.querySelector('#dfr-output')
  let activePlanSources = null
  let accountReady = false
  let accountSyncing = true
  let mapOptionsReady = false
  let mapOptions = []
  let busyOperationCount = 0
  const updateBusy = () => {
    const busy = busyOperationCount > 0
    const selectedOption = routeSelect.selectedOptions?.[0]
    const routeReady = routeSelect.value.length > 0 && selectedOption?.disabled !== true
    syncButton.disabled = busy || accountSyncing
    mapSelect.disabled = busy || !mapOptionsReady
    routeSelect.disabled = busy || !mapOptionsReady
    generateButton.disabled = busy || !mapOptionsReady || !routeReady
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

  const renderMapRoutes = () => {
    const mapOption = mapOptions.find((item) => item.id === mapSelect.value)
    if (!mapOption) return
    activePlanSources = null
    renderRouteOptions()
  }

  const renderRouteOptions = () => {
    const mapOption = mapOptions.find((item) => item.id === mapSelect.value)
    if (!mapOption) return
    const previousRouteId = routeSelect.value
    const routes = mapOption.routes
    routeSelect.innerHTML = routes
      .map(
        (route) =>
          `<option value="${escapeHtml(route.id)}" title="${escapeHtml(routeOptionLabel(route))}">${escapeHtml(routeOptionLabel(route))}</option>`,
      )
      .join('')
    routeSelect.value = routes.some((route) => route.id === previousRouteId)
      ? previousRouteId
      : routes[0]?.id || ''
    renderSourceStatus()
    updateBusy()
  }

  const renderSourceStatus = () => {
    const mapOption = mapOptions.find((item) => item.id === mapSelect.value)
    if (!mapOption) {
      mapSummary.textContent = t('fleet.loading')
      mapSourceList.innerHTML = ''
      return
    }
    const selectedRouteId = routeSelect.value
    const selectedRoute = mapOption.routes.find((route) => route.id === selectedRouteId)
    const routes = selectedRoute ? [selectedRoute] : []
    const sources = activePlanSources ?? uniqueRouteSources(routes)
    mapSummary.textContent = t('fleet.sourceCount', { count: sources.length })
    mapSourceList.innerHTML = sources.length
      ? sourceLinks(sources)
      : `<li>${escapeHtml(t('fleet.noSources'))}</li>`
  }

  const loadMapOptions = async () => {
    updateBusy()
    try {
      const result = cachedMapOptionsResult ?? (await invoke(MAP_OPTIONS_CHANNEL))
      if (result.status !== 'success') {
        mapSummary.textContent = translateMessage(result.error, 'fleet.mapUnavailableDetail')
        mapSourceList.innerHTML = ''
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
      renderMapRoutes()
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
    const generation = viewGeneration
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
      if (generation !== viewGeneration) return
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
      if (typeof generation !== 'undefined' && generation !== viewGeneration) return
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

  const unsubscribe = onSnapshotChanged(({ phase }) => {
    if (!title.isConnected) {
      disposePanelSubscription()
      return
    }
    if (phase === 'invalidated') {
      viewGeneration++
      cachedAccountResult = null
      accountReady = false
      output.textContent = t('fleet.resyncingTitle')
      updateBusy()
    } else if (phase === 'completed') {
      void syncAccount({ invalidateResults: true, blockControls: false })
    } else {
      title.textContent = t('fleet.account.unavailable')
      detail.textContent = t('fleet.account.syncFirst')
    }
  })
  disposePanelSubscription = () => {
    unsubscribe()
    window.removeEventListener('pagehide', disposePanelSubscription)
    viewGeneration++
  }
  window.addEventListener('pagehide', disposePanelSubscription, { once: true })

  syncButton.addEventListener('click', () =>
    syncAccount({ invalidateResults: true, forceRefresh: true }),
  )
  mapSelect.addEventListener('change', () => {
    renderMapRoutes()
  })
  routeSelect.addEventListener('change', () => {
    activePlanSources = null
    renderSourceStatus()
  })
  generateButton.addEventListener('click', async () => {
    const generation = viewGeneration
    const mapId = mapSelect.value
    const mapOption = mapOptions.find((item) => item.id === mapId)
    const routeId = routeSelect.value
    const route = mapOption?.routes.find((item) => item.id === routeId)
    if (!route) return
    const objective = routeObjective(route)
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
        routeId,
      })
      if (generation !== viewGeneration) return
      if (result.account) showAccountSummary(result.account)
      if (result.status === 'success') {
        renderResults(output, result, (sources) => {
          activePlanSources = sources
          renderSourceStatus()
        })
      } else if (result.status === 'no-solution') {
        activePlanSources = null
        renderSourceStatus()
        renderError(
          output,
          t('fleet.noSolutionForRoute', {
            mapId,
            route: routeOptionLabel(route),
          }),
          result.analysis.reasons.map((reason) => translateMessage(reason)),
        )
      } else {
        activePlanSources = null
        renderSourceStatus()
        renderError(output, t('fleet.incomplete'), [translateMessage(result.error)])
      }
    } catch {
      if (generation !== viewGeneration) return
      activePlanSources = null
      renderSourceStatus()
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
      mapSourceList.innerHTML = ''
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

export const injectFleetRecommender = (invoke, onSnapshotChanged = () => () => {}) => {
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
      mountPanel(invoke, onSnapshotChanged)
    },
    true,
  )
  menuList.appendChild(menuItem)
}
