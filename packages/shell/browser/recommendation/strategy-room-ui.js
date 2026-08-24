import { ACCOUNT_CHANNEL, MAP_OPTIONS_CHANNEL, RECOMMEND_CHANNEL } from './channels'

const roleLabels = {
  'main-battleship': '主力戰艦',
  'carrier-air-superiority': '制空空母',
  'utility-cruiser': '索敵巡洋艦',
  'escort-destroyer': '護衛艦',
  'anti-submarine': '先制對潛',
  submarine: '潛水艦',
  'resource-carrier': '資源運輸',
  wildcard: '自由枠',
}

const objectiveLabels = {
  balanced: '均衡',
  'boss-clear': '斬殺',
  'low-cost': '節約',
  leveling: '練船',
  'resource-fuel': '撈油',
  'resource-ammo': '撈彈',
  'resource-steel': '撈鋼',
  'resource-bauxite': '撈鋁',
  'resource-bucket': '撈水桶',
  'resource-devmat': '撈開發資材',
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-TW', { hour12: false })
}

const formatEquipment = (gear) => {
  if (!gear) return '<span class="dfr-empty-gear">— 空槽 —</span>'
  const improvement = gear.improvement > 0 ? ` <b>★+${gear.improvement}</b>` : ''
  const proficiency = gear.proficiency > 0 ? ` <span>熟練 ${gear.proficiency}</span>` : ''
  return `${escapeHtml(gear.name)}${improvement}${proficiency} <small>#${gear.id}</small>`
}

const panelMarkup = () => `
  <div id="damecon-fleet-recommender" class="dfr-root tab_fleet">
    <div class="page_title">
      <span>關卡艦隊推薦</span>
      <div class="page_help_btn hover"><span>?</span> <span>說明</span></div>
    </div>

    <div class="page_help">
      <div class="help_q">這個頁面會做什麼？</div>
      <div class="help_a">依 KC3 已同步的艦娘與裝備，產生目前通常海域可實際組成的艦隊與配裝。</div>
      <div class="help_q">會自動操作遊戲嗎？</div>
      <div class="help_a">不會。推薦結果只供閱讀，不會自動換裝或出擊。</div>
      <div class="help_q">包含哪些用途？</div>
      <div class="help_a">進王攻略、練船、燃料、彈藥、鋼材、鋁土、水桶與開發資材回收。</div>
    </div>

    <section class="page_panel bscolor4 dfr-account" aria-live="polite">
      <div>
        <strong id="dfr-account-title">正在讀取 KC3 帳號</strong>
        <span id="dfr-account-detail">請稍候…</span>
      </div>
      <button id="dfr-sync" class="dfr-button dfr-button-quiet" type="button">重新同步</button>
    </section>

    <div class="page_padding">
      <div class="page_section">推薦條件</div>
      <section class="section_body dfr-controls">
        <div class="dfr-control-row">
          <label class="dfr-field">
            <span>關卡</span>
            <select id="dfr-map" class="control_input" disabled></select>
          </label>
          <label class="dfr-field">
            <span>路線／階段</span>
            <select id="dfr-route-select" class="control_input" disabled></select>
          </label>
          <fieldset class="dfr-objectives">
            <legend>攻略目的</legend>
            <div id="dfr-objective-options"></div>
          </fieldset>
        </div>
        <div class="dfr-route-row bscolor3 fcolor2">
          <span class="dfr-field-label">資料狀態</span>
          <strong id="dfr-map-summary" class="dfr-route">載入中</strong>
        </div>
        <div class="dfr-action-row">
          <label class="dfr-check">
            <input id="dfr-preserve-fleet" type="checkbox">
            保留目前艦隊的裝備
          </label>
          <button id="dfr-generate" class="dfr-button" type="button" disabled>
            <span>產生推薦</span>
          </button>
        </div>
      </section>

      <div class="page_section">推薦結果</div>
      <div id="dfr-output" class="dfr-output" aria-live="polite">
        <div class="dfr-idle bscolor3 fcolor2">
          <strong>尚未產生推薦</strong>
          <span>同步完成後，按「產生推薦」查看最多三組合法方案。</span>
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

const renderRecommendation = (recommendation) => {
  const metrics = recommendation.metrics
  const shipMarkup = recommendation.ships
    .map(
      (build) => `
        <article class="dfr-ship bscolor3 fcolor2">
          <div class="dfr-ship-head">
            <h3>${escapeHtml(build.ship.name)} <span>Lv.${build.ship.level}</span></h3>
            <span class="dfr-role">${escapeHtml(roleLabels[build.role] || build.role)}</span>
          </div>
          <ol class="dfr-gear-list">
            ${build.equipment
              .map(
                (gear, slotIndex) => `
                  <li><span>SLOT ${slotIndex + 1}<br>${build.ship.slotSizes[slotIndex] || 0} 機</span><span>${formatEquipment(gear)}</span></li>
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
    .map((reason) => `<li>${escapeHtml(reason.message)}</li>`)
    .join('')
  const warnings = recommendation.warnings
    .map((warning) => `<li>${escapeHtml(warning.message)}</li>`)
    .join('')

  return `
    <article class="dfr-plan">
      <header class="dfr-plan-head">
        <div><h2>${escapeHtml(recommendation.title)}</h2><p>${escapeHtml(`${recommendation.route.phase ? `${recommendation.route.phase} · ` : ''}${recommendation.route.nodes.join(' → ')} · ${recommendation.route.confidence}`)}</p></div>
        <div class="dfr-score bscolor3 fcolor2">${recommendation.score.total.toFixed(1)} <small>/ 100</small></div>
      </header>
      <div class="dfr-metrics">
        <div class="dfr-metric bscolor3 fcolor2"><span>制空值</span><strong>${metrics.airPower}</strong><small>${metrics.airPowerRequired ? `最低 ${metrics.airPowerMinimum}` : '未設硬門檻'}</small></div>
        <div class="dfr-metric bscolor3 fcolor2"><span>33 式索敵</span><strong>${metrics.los33.toFixed(1)}</strong><small>${metrics.losRequired ? `最低 ${metrics.losMinimum}` : '未設硬門檻'}</small></div>
        <div class="dfr-metric bscolor3 fcolor2"><span>估計燃料</span><strong>${metrics.estimatedFuelCost}</strong><small>單次出擊</small></div>
        <div class="dfr-metric bscolor3 fcolor2"><span>估計彈藥</span><strong>${metrics.estimatedAmmoCost}</strong><small>單次出擊</small></div>
      </div>
      <div class="dfr-ship-grid">${shipMarkup}</div>
      <footer class="dfr-notes">
        <section class="dfr-note-group bscolor3 fcolor2"><h4>推薦依據</h4><ul>${reasons}</ul></section>
        <section class="dfr-note-group warning bscolor3 fcolor2"><h4>執行前確認</h4><ul>${warnings}</ul></section>
      </footer>
    </article>
  `
}

const renderResults = (output, result) => {
  let activeIndex = 0
  const renderActivePlan = () => {
    const recommendation = result.recommendations[activeIndex]
    output.innerHTML = `
      <nav class="dfr-plan-tabs" aria-label="推薦方案">
        ${result.recommendations
          .map(
            (item, index) => `
              <button class="dfr-plan-tab${index === activeIndex ? ' active' : ''}" data-plan-index="${index}" type="button">
                <span>${escapeHtml(item.title)}</span><strong>${item.score.total.toFixed(1)}</strong>
              </button>
            `,
          )
          .join('')}
      </nav>
      ${renderRecommendation(recommendation)}
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
    generateButton.querySelector('span').textContent = busy ? '計算中…' : '產生推薦'
  }

  const renderMapObjectives = () => {
    const mapOption = mapOptions.find((item) => item.id === mapSelect.value)
    if (!mapOption) return
    objectiveOptions.innerHTML = mapOption.objectives
      .map(
        (objective, index) => `
          <label><input type="radio" name="dfr-objective" value="${escapeHtml(objective)}"${index === 0 ? ' checked' : ''}> ${escapeHtml(objectiveLabels[objective] || objective)}</label>
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
      '<option value="">自動比較可用路線（Top 3）</option>',
      ...routes.map(
        (route) =>
          `<option value="${escapeHtml(route.id)}">${escapeHtml(route.phase ? `${route.phase}｜${route.name}` : route.name)}${route.stableBoss ? '｜穩定' : ''}</option>`,
      ),
    ].join('')
    mapSummary.textContent = `${mapOption.routeCount} 個攻略模板｜${mapOption.stableBossRouteCount} 個穩定進王模板`
  }

  const loadMapOptions = async () => {
    const result = await invoke(MAP_OPTIONS_CHANNEL)
    if (result.status !== 'success') {
      mapSummary.textContent = result.error?.message || '關卡資料載入失敗'
      return
    }
    mapOptions = result.maps
    mapSelect.innerHTML = mapOptions
      .map(
        (item) =>
          `<option value="${escapeHtml(item.id)}">${escapeHtml(item.id)}｜${escapeHtml(item.name)}</option>`,
      )
      .join('')
    if (mapOptions.some((item) => item.id === '5-5')) mapSelect.value = '5-5'
    mapOptionsReady = true
    renderMapObjectives()
    setBusy(false)
  }

  const syncAccount = async () => {
    setBusy(true)
    title.textContent = '正在讀取 KC3 帳號'
    detail.textContent = '驗證艦娘、裝備與 master data…'
    const result = await invoke(ACCOUNT_CHANNEL)
    if (result.status === 'success') {
      accountReady = true
      title.textContent = `KC3 已同步｜艦娘 ${result.account.shipCount}・裝備 ${result.account.equipmentCount}`
      detail.textContent = `快照 ${formatDate(result.account.generatedAt)} · schema v1`
    } else {
      accountReady = false
      title.textContent = '尚未取得 KC3 帳號資料'
      detail.textContent = result.error?.message || '請先讓 KC3 完成母港資料同步。'
    }
    setBusy(false)
  }

  syncButton.addEventListener('click', syncAccount)
  mapSelect.addEventListener('change', renderMapObjectives)
  objectiveOptions.addEventListener('change', renderRouteOptions)
  generateButton.addEventListener('click', async () => {
    const objective = contentHtml.querySelector('input[name="dfr-objective"]:checked').value
    const mapId = mapSelect.value
    setBusy(true)
    output.innerHTML =
      '<div class="dfr-idle bscolor3 fcolor2"><strong>正在規劃艦隊</strong><span>比對候選艦、裝備 instance、制空與索敵限制…</span></div>'
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
          `目前帳號無法組成 ${mapId}「${objectiveLabels[objective]}」方案`,
          result.analysis.reasons.map((reason) => reason.message),
        )
      } else {
        renderError(output, '推薦未完成', [result.error?.message || '未知錯誤'])
      }
    } catch (error) {
      renderError(output, '推薦服務無法回應', [String(error)])
    } finally {
      setBusy(false)
    }
  })

  syncAccount().catch((error) => {
    accountReady = false
    title.textContent = '尚未取得 KC3 帳號資料'
    detail.textContent = String(error)
    setBusy(false)
  })
  loadMapOptions().catch((error) => {
    mapSummary.textContent = String(error)
    mapOptionsReady = false
    setBusy(false)
  })
}

export const injectFleetRecommender = (invoke) => {
  const style = document.createElement('style')
  style.id = 'damecon-fleet-recommender-style'
  style.textContent = styles
  document.head.appendChild(style)

  const fleetMenuItem = document.querySelector('#menu [data-id="fleet"]')
  const menuList = fleetMenuItem?.closest('ul.menulist')
  if (!menuList || document.querySelector('[data-id="damecon-recommendation"]')) return

  const menuItem = document.createElement('li')
  menuItem.dataset.id = 'damecon-recommendation'
  menuItem.textContent = '關卡推薦'
  menuItem.title = '依 KC3 帳號產生關卡艦隊與配裝推薦'
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
