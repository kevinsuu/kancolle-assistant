import { SHIP_RECOMMENDATIONS_CHANNEL } from './channels'
import { createStrategyRoomI18n } from './i18n'
import { escapeHtml, formatLocalizedDate } from './strategy-room-format'
import { panelMarkup, styles } from './views/ship-recommendation-view'

let { locale, t, translateMessage } = createStrategyRoomI18n()

const formatTime = (value) =>
  formatLocalizedDate(value, locale, {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

const shipIconUrl = (masterId) => {
  const numericMasterId = Number(masterId)
  return Number.isInteger(numericMasterId) && numericMasterId > 0
    ? `/assets/img/ships/${numericMasterId}.png`
    : ''
}

const USAGE_BY_FEATURE = {
  specialAttack: 'specialAttack',
  antiInstallation: 'antiInstallation',
  fiveSlots: 'loadoutFlexibility',
  carrierFighter: 'airPower',
  openingTorpedo: 'openingTorpedo',
  fourSlots: 'loadoutFlexibility',
  seaplaneFighter: 'airPower',
  pseudoFiveSlots: 'loadoutFlexibility',
  pseudoFourSlots: 'loadoutFlexibility',
  highModifier: 'eventBonus',
  highFirepower: 'surfaceCombat',
  nightCarrier: 'nightCarrier',
  armoredCarrier: 'carrierDurability',
  dedicatedAaci: 'antiAir',
  gunSpecialist: 'gunCombat',
  rotaryAsw: 'asw',
  cve: 'escortCarrier',
  highArmor: 'durability',
  fastPlus: 'fastPlus',
  highLuck: 'cutin',
  versatile: 'flexibleRoles',
  aviationCruiser: 'seaplaneOperations',
  openingAsw: 'openingAsw',
  efficientSupport: 'support',
  supportCarrier: 'carrierSupport',
  aswSupport: 'support',
  fastYamatoPartner: 'specialAttack',
  cvl: 'carrierSupport',
  antiPt: 'antiPt',
}

const ratingBand = (rating) => {
  if (rating >= 8) return 'highest'
  if (rating >= 5) return 'priority'
  return 'optional'
}

const unique = (values) => [...new Set(values)]

export const shipRecommendationCardMarkup = (recommendation, translator = t) => {
  const features = Array.isArray(recommendation.features) ? recommendation.features : []
  const featureLabels = features.map((feature) => translator(`ship.feature.${feature}`))
  const featureMarkup = featureLabels.map((feature) => `<li>${escapeHtml(feature)}</li>`).join('')
  const imageUrl = shipIconUrl(recommendation.ship.masterId)
  const usageMarkup = unique(features.map((feature) => USAGE_BY_FEATURE[feature]).filter(Boolean))
    .map((usage) => `<li>${escapeHtml(translator(`ship.usage.${usage}`))}</li>`)
    .join('')
  const priorityReason = featureLabels.length
    ? translator('ship.priorityReason.features', {
        rating: recommendation.rating,
        features: featureLabels.join(translator('common.listSeparator')),
      })
    : translator('ship.priorityReason.scoreOnly', { rating: recommendation.rating })

  return `
    <article class="dsr-card dsr-card--${ratingBand(recommendation.rating)} fcolor2">
      <header class="dsr-card-head">
        <span class="dsr-ship-icon">${
          imageUrl ? `<img src="${imageUrl}" alt="" loading="lazy">` : ''
        }</span>
        <span class="dsr-rating" title="${escapeHtml(translator('ship.ratingValue', { rating: recommendation.rating }))}">${recommendation.rating}</span>
        <div class="dsr-name">
          <strong>${escapeHtml(recommendation.ship.name)}</strong>
          <span>${escapeHtml(translator('ship.level', { level: recommendation.ship.level }))}</span>
        </div>
        <div class="dsr-card-meta">
          <span class="dsr-state">${escapeHtml(translator('ship.state.training'))}</span>
          <span>${escapeHtml(translator('ship.heldCount', { count: recommendation.heldCount }))}</span>
        </div>
      </header>
      <div class="dsr-card-body">
        <section class="dsr-card-section dsr-priority-reason">
          <h3>${escapeHtml(translator('ship.section.priorityReason'))}</h3>
          <p>${escapeHtml(priorityReason)}</p>
          ${featureMarkup ? `<ul class="dsr-feature-list">${featureMarkup}</ul>` : ''}
        </section>
        <section class="dsr-card-section dsr-usage">
          <h3>${escapeHtml(translator('ship.section.usage'))}</h3>
          ${usageMarkup ? `<ul class="dsr-usage-list">${usageMarkup}</ul>` : `<p>${escapeHtml(translator('ship.usage.unlisted'))}</p>`}
        </section>
      </div>
    </article>
  `
}

const render = (root, result, minimumRating) => {
  const status = root.querySelector('.dsr-status')
  const output = root.querySelector('.dsr-output')
  if (!result || result.status === 'error') {
    status.classList.add('error')
    status.textContent = translateMessage(result?.error, 'ship.unavailable')
    output.innerHTML = `<div class="dsr-empty bscolor3 fcolor2"><strong>${t('ship.notReady')}</strong><span>${t('ship.syncFirst')}</span></div>`
    return
  }

  status.classList.remove('error')
  status.textContent = t('ship.status', {
    matched: result.matchedFamilyCount,
    total: result.shipCount,
    training: result.trainingCandidateCount,
    ready: result.guideFormReachedCount,
    updated: formatTime(result.generatedAt),
  })
  const recommendations = result.recommendations.filter(
    (recommendation) => recommendation.rating >= minimumRating,
  )
  const source = result.source || {}
  output.innerHTML = recommendations.length
    ? `
      <div class="dsr-summary">
        <h2>${t('ship.results')}</h2>
        <span>${t('ship.visibleCount', { count: recommendations.length })}</span>
      </div>
      <div class="dsr-list">${recommendations.map((recommendation) => shipRecommendationCardMarkup(recommendation)).join('')}</div>
      <p class="dsr-source">${t('ship.source', { date: source.updatedAt || '—' })} <a class="dsr-source-link" href="${escapeHtml(source.url || '#')}" target="_blank" rel="noreferrer">NGA #29107384</a></p>
    `
    : `<div class="dsr-empty bscolor3 fcolor2"><strong>${t('ship.emptyTitle')}</strong><span>${t('ship.emptyDetail')}</span></div>`
}

const mountPanel = (invoke) => {
  const content = document.querySelector('#content')
  const contentHtml = document.querySelector('#contentHtml')
  if (!content || !contentHtml) return
  content.style.display = 'block'
  contentHtml.innerHTML = panelMarkup(t)
  contentHtml.style.display = 'block'
  window.scrollTo(0, 0)

  const root = contentHtml.querySelector('.dsr-root')
  const refresh = root.querySelector('.dsr-refresh')
  const minimumRatingSelect = root.querySelector('[data-minimum-rating]')
  let result = null
  let loadSequence = 0

  const load = async ({ forceRefresh = false } = {}) => {
    const sequence = ++loadSequence
    refresh.disabled = true
    refresh.textContent = t('common.syncing')
    root.querySelector('.dsr-status').textContent = t('ship.syncing')
    root.querySelector('.dsr-output').innerHTML =
      `<div class="dsr-loading bscolor3 fcolor2"><strong>${t('ship.loading')}</strong><span>${t('ship.loadingDetail')}</span></div>`
    try {
      result = await invoke(SHIP_RECOMMENDATIONS_CHANNEL, { forceRefresh })
    } catch {
      result = { status: 'error', error: { code: 'SHIP_RECOMMENDATION_DATA_UNAVAILABLE' } }
    }
    if (sequence !== loadSequence) return
    render(root, result, Number(minimumRatingSelect.value))
    refresh.disabled = false
    refresh.textContent = t('ship.sync')
  }

  minimumRatingSelect.addEventListener('change', () => {
    if (result) render(root, result, Number(minimumRatingSelect.value))
  })
  refresh.addEventListener('click', () => void load({ forceRefresh: true }))
  void load()
}

export const injectShipRecommendations = (invoke) => {
  ;({ locale, t, translateMessage } = createStrategyRoomI18n())
  if (!document.querySelector('#damecon-ship-recommendation-style')) {
    const style = document.createElement('style')
    style.id = 'damecon-ship-recommendation-style'
    style.textContent = styles
    document.head.appendChild(style)
  }

  const shipMenuItem = document.querySelector(
    '#menu [data-id="ships"], #menu [data-id="shiplist"], #menu [data-id="mstship"]',
  )
  const fallbackMenuItem = document.querySelector('#menu [data-id="fleet"]')
  const menuList = (shipMenuItem || fallbackMenuItem)?.closest('ul.menulist')
  if (!menuList || document.querySelector('[data-id="damecon-ship-recommendation"]')) return

  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-ship-recommendation'
  menuItem.textContent = t('ship.menu')
  menuItem.title = t('ship.menuTitle')
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
  if (shipMenuItem) shipMenuItem.insertAdjacentElement('afterend', menuItem)
  else menuList.appendChild(menuItem)
}
