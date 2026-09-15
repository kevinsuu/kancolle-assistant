export const styles = `
  .dsr-root { --dsr-line: #d8e1e5; --dsr-muted: #78868d; width: 700px; min-height: 760px; font-size: 12px; line-height: 1.45; }
  body.dark .dsr-root { --dsr-line: #3e474c; --dsr-muted: #9ba7ad; }
  .dsr-root *, .dsr-root *::before, .dsr-root *::after { box-sizing: border-box; }
  .dsr-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .dsr-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
  .dsr-controls label { color: #888; font-size: 10px; }
  .dsr-controls select, .dsr-refresh { min-height: 26px; padding: 0 8px; font: inherit; font-size: 11px; }
  .dsr-refresh { min-width: 82px; cursor: pointer; }
  .dsr-refresh:disabled { cursor: wait; opacity: .55; }
  body.dark .dsr-controls select, body.dark .dsr-refresh { border: 1px solid #444; background: #121212; color: #aaa; }
  body:not(.dark) .dsr-controls select, body:not(.dark) .dsr-refresh { border: 1px solid #abc; border-radius: 7px; background: #edf6fa; color: #467080; }
  .dsr-controls select:focus-visible, .dsr-refresh:focus-visible, .dsr-source-link:focus-visible { outline: 2px solid #69c; outline-offset: 2px; }
  .dsr-status { min-height: 18px; margin: 7px 0 2px; color: var(--dsr-muted); font-size: 10px; }
  .dsr-status.error { color: #c55b53; }
  .dsr-loading { min-height: 175px; padding: 70px 20px; text-align: center; }
  .dsr-loading strong { display: block; margin-bottom: 5px; font-size: 14px; }
  .dsr-loading span { color: #888; font-size: 11px; }
  .dsr-summary { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 8px 0 6px; }
  .dsr-summary h2 { margin: 0; font-size: 14px; }
  .dsr-summary span { color: var(--dsr-muted); font-size: 10px; }
  .dsr-list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 9px; margin: 0; padding: 4px 0 20px; }
  .dsr-card { --dsr-accent: #6a8797; min-width: 0; overflow: hidden; border: 1px solid var(--dsr-line); border-left: 4px solid var(--dsr-accent); }
  .dsr-card--highest { --dsr-accent: #2b8091; }
  .dsr-card--priority { --dsr-accent: #57805d; }
  .dsr-card--optional { --dsr-accent: #8a7654; }
  body:not(.dark) .dsr-card { border-radius: 4px; background: #fff; box-shadow: 0 2px 5px #24596c16; }
  body.dark .dsr-card { background: #202020; }
  .dsr-card-head { display: grid; grid-template-columns: 58px 39px minmax(0, 1fr) auto; gap: 9px; align-items: center; min-height: 73px; padding: 8px 10px 8px 8px; }
  .dsr-ship-icon { display: grid; width: 58px; height: 58px; place-items: center; overflow: hidden; border-radius: 4px; background: rgba(79, 118, 144, .12); }
  .dsr-ship-icon img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
  .dsr-rating { display: grid; width: 39px; height: 39px; place-items: center; border-radius: 50%; background: var(--dsr-accent); color: #fff; font-size: 17px; font-weight: bold; }
  .dsr-name { min-width: 0; }
  .dsr-name strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
  .dsr-name span { display: block; margin-top: 1px; color: var(--dsr-muted); font-size: 11px; }
  .dsr-card-meta { display: grid; justify-items: end; gap: 4px; color: var(--dsr-muted); font-size: 10px; text-align: right; }
  .dsr-state { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 7px; border-radius: 11px; background: color-mix(in srgb, var(--dsr-accent) 15%, transparent); color: var(--dsr-accent); font-weight: bold; }
  body.dark .dsr-state { color: #9acbdd; }
  .dsr-card-body { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr); border-top: 1px solid var(--dsr-line); }
  .dsr-card-section { min-width: 0; padding: 8px 10px 9px; }
  .dsr-card-section + .dsr-card-section { border-left: 1px solid var(--dsr-line); }
  .dsr-card-section h3 { margin: 0; color: var(--dsr-muted); font-size: 10px; font-weight: bold; letter-spacing: .06em; }
  .dsr-card-section p { margin: 5px 0 0; color: #66757c; line-height: 1.5; }
  body.dark .dsr-card-section p { color: #b2bdc1; }
  .dsr-feature-list { display: flex; flex-wrap: wrap; gap: 4px; margin: 7px 0 0; padding: 0; list-style: none; }
  .dsr-feature-list li { padding: 2px 6px; border: 1px solid color-mix(in srgb, var(--dsr-accent) 35%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--dsr-accent) 8%, transparent); color: var(--dsr-accent); font-size: 10px; line-height: 1.3; }
  body.dark .dsr-feature-list li { color: #9acbdd; }
  .dsr-usage-list { display: grid; gap: 4px; margin: 5px 0 0; padding: 0; list-style: none; }
  .dsr-usage-list li { padding-left: 8px; border-left: 2px solid var(--dsr-accent); color: #66757c; line-height: 1.45; }
  body.dark .dsr-usage-list li { color: #b2bdc1; }
  .dsr-empty { min-height: 170px; padding: 60px 20px; text-align: center; }
  .dsr-empty strong { display: block; margin-bottom: 4px; font-size: 14px; }
  .dsr-empty span { color: #888; font-size: 11px; }
  .dsr-source { margin: 10px 0 18px; color: #888; font-size: 10px; line-height: 1.45; }
  .dsr-source-link { color: inherit; overflow-wrap: anywhere; }
  @media (max-width: 720px) {
    .dsr-root { width: 100%; }
    .dsr-toolbar { align-items: flex-start; flex-direction: column; }
    .dsr-card-head { grid-template-columns: 52px 36px minmax(0, 1fr); gap: 7px; }
    .dsr-ship-icon { width: 52px; height: 52px; }
    .dsr-rating { width: 36px; height: 36px; font-size: 15px; }
    .dsr-card-meta { grid-column: 2 / -1; justify-items: start; grid-template-columns: auto auto; justify-content: start; text-align: left; }
    .dsr-card-body { grid-template-columns: 1fr; }
    .dsr-card-section + .dsr-card-section { border-top: 1px solid var(--dsr-line); border-left: 0; }
  }
`

export const panelMarkup = (t) => `
  <div id="damecon-ship-recommendation" class="dsr-root tab_ship_recommendation">
    <div class="page_title">
      <span>${t('ship.menu')}</span>
      <div class="page_help_btn hover"><span>?</span> <span>${t('common.help')}</span></div>
    </div>
    <div class="page_help">
      <div class="help_q">${t('ship.help.whatQuestion')}</div>
      <div class="help_a">${t('ship.help.whatAnswer')}</div>
      <div class="help_q">${t('ship.help.matchQuestion')}</div>
      <div class="help_a">${t('ship.help.matchAnswer')}</div>
      <div class="help_q">${t('ship.help.automaticQuestion')}</div>
      <div class="help_a">${t('ship.help.automaticAnswer')}</div>
    </div>
    <section class="page_panel bscolor4 dsr-toolbar" aria-label="${t('ship.toolbar')}">
      <div class="dsr-controls">
        <label>${t('ship.minimumRating')}
          <select data-minimum-rating>
            <option value="1">${t('ship.rating.all')}</option>
            <option value="5">${t('ship.rating.five')}</option>
            <option value="8">${t('ship.rating.eight')}</option>
            <option value="10">${t('ship.rating.ten')}</option>
          </select>
        </label>
      </div>
      <button class="dsr-refresh" type="button">${t('ship.sync')}</button>
    </section>
    <div class="page_padding">
      <div class="dsr-status" aria-live="polite">${t('ship.preparing')}</div>
      <div class="dsr-output" aria-live="polite">
        <div class="dsr-loading bscolor3 fcolor2"><strong>${t('ship.loading')}</strong><span>${t('ship.loadingDetail')}</span></div>
      </div>
    </div>
  </div>
`
