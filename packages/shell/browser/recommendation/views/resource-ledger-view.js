export const styles = `
  .drl-root { position: relative; overflow: hidden; }
  .drl-root *, .drl-root *::before, .drl-root *::after { box-sizing: border-box; }
  .drl-head, .drl-controls, .drl-card-head, .drl-card-value, .drl-status {
    display: flex; align-items: center;
  }
  .drl-head { justify-content: space-between; min-height: 28px; margin-bottom: 8px; }
  .drl-title { display: flex; align-items: baseline; gap: 7px; }
  .drl-title strong { font-size: 13px; }
  .drl-title span, .drl-status { color: #888; font-size: 10px; }
  .drl-refresh { min-width: 64px; height: 24px; cursor: pointer; font-size: 11px; }
  .drl-refresh:disabled { cursor: wait; opacity: .55; }
  .drl-controls { flex-wrap: wrap; gap: 6px 14px; margin-bottom: 9px; }
  .drl-control { display: flex; align-items: center; gap: 3px; }
  .drl-control > span { margin-right: 3px; color: #888; font-size: 10px; }
  .drl-option { min-width: 44px; height: 23px; padding: 0 7px; cursor: pointer; font-size: 10px; }
  .drl-option[aria-pressed='true'] { font-weight: bold; }
  body.dark .drl-refresh, body.dark .drl-option {
    border: 1px solid #444; background: #121212; color: #aaa;
  }
  body.dark .drl-option[aria-pressed='true'] { border-color: #777; background: #000; color: #fc0; }
  body:not(.dark) .drl-refresh, body:not(.dark) .drl-option {
    border: 1px solid #abc; border-radius: 4px; background: #edf6fa; color: #467080;
  }
  body:not(.dark) .drl-option[aria-pressed='true'] {
    border-color: #5b8798; background: #fff; color: #24596c;
  }
  .drl-refresh:focus-visible, .drl-option:focus-visible {
    outline: 2px solid #69c; outline-offset: 1px;
  }
  .drl-cards { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
  .drl-card { --drl-accent: #888; min-width: 0; padding: 7px 7px 6px; }
  body.dark .drl-card { border-top: 2px solid var(--drl-accent); }
  body:not(.dark) .drl-card { border-left: 3px solid var(--drl-accent); border-radius: 5px; }
  .drl-card-head { justify-content: space-between; gap: 4px; }
  .drl-resource { display: flex; align-items: center; min-width: 0; gap: 4px; }
  .drl-resource img { width: 14px; height: 14px; }
  .drl-resource strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .drl-current { color: #888; font: 9px monospace; white-space: nowrap; }
  .drl-card-value { align-items: baseline; justify-content: space-between; gap: 4px; margin: 5px 0 3px; }
  .drl-card-value span { color: #888; font-size: 9px; }
  .drl-card-value strong { overflow: hidden; font: bold 16px/1.1 monospace; text-overflow: ellipsis; }
  .drl-card-value strong.positive { color: #4e9c62; }
  .drl-card-value strong.negative { color: #c55b53; }
  .drl-bars { display: flex; align-items: flex-end; gap: 1px; height: 27px; padding-top: 3px; border-bottom: 1px solid #7776; }
  .drl-bar { display: flex; flex: 1 1 0; align-items: flex-end; height: 23px; min-width: 1px; }
  .drl-bar i { display: block; width: 100%; min-height: 1px; height: var(--drl-size); background: var(--drl-accent); opacity: .72; transform-origin: bottom; }
  .drl-bar.negative i { background: #c55b53; }
  .drl-bar.zero i { opacity: .12; }
  .drl-axis { display: flex; justify-content: space-between; margin-top: 2px; color: #888; font-size: 8px; }
  .drl-status { justify-content: space-between; gap: 8px; min-height: 20px; padding-top: 7px; }
  .drl-status.error { justify-content: flex-start; color: #c55b53; }
  .drl-empty { padding: 13px 8px; text-align: center; }
  .drl-empty strong { display: block; margin-bottom: 3px; font-size: 12px; }
  .drl-empty span { color: #888; font-size: 10px; }
  @media (max-width: 720px) {
    .drl-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .drl-card:last-child { grid-column: span 2; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .drl-bar i { transition: height .18s ease-out, background-color .18s ease-out; }
  }
`

export const markup = (t) => `
  <section class="drl-root page_panel" aria-label="${t('ledger.aria')}">
    <header class="drl-head">
      <div class="drl-title"><strong>${t('ledger.title')}</strong><span>KC3 Ledger／${t('common.jst')}</span></div>
      <button class="drl-refresh" type="button">${t('common.refresh')}</button>
    </header>
    <div class="drl-controls">
      <div class="drl-control drl-ranges" aria-label="${t('resource.range')}">
        <span>${t('common.period')}</span>
        <button class="drl-option" type="button" data-range="today" aria-pressed="true">${t('common.today')}</button>
        <button class="drl-option" type="button" data-range="yesterday" aria-pressed="false">${t('common.yesterday')}</button>
        <button class="drl-option" type="button" data-range="rolling24" aria-pressed="false">24 h</button>
      </div>
      <div class="drl-control drl-metrics" aria-label="${t('ledger.statisticsMode')}">
        <span>${t('common.display')}</span>
        <button class="drl-option" type="button" data-metric="spent" aria-pressed="true">${t('common.spent')}</button>
        <button class="drl-option" type="button" data-metric="gained" aria-pressed="false">${t('common.gained')}</button>
        <button class="drl-option" type="button" data-metric="net" aria-pressed="false">${t('common.net')}</button>
      </div>
    </div>
    <div class="drl-output" aria-live="polite">
      <div class="drl-empty"><strong>${t('ledger.loading')}</strong><span>${t('common.loading')}</span></div>
    </div>
  </section>
`
