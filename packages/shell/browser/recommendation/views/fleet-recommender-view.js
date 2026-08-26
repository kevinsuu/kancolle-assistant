export const styles = `
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

export const panelMarkup = (t) => `
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
