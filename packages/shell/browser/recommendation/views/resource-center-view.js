export const styles = `
  .drc-root { width: 700px; min-height: 760px; --drc-gain: #3f9d67; --drc-spend: #c65a52; }
  .drc-root *, .drc-root *::before, .drc-root *::after { box-sizing: border-box; }
  .drc-root button { font-family: inherit; }
  .drc-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .drc-controls { display: flex; align-items: center; flex-wrap: wrap; gap: 7px 10px; min-width: 0; }
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
    .drc-controls { align-items: flex-start; flex-direction: column; }
    .drc-resource-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .drc-lower-grid { grid-template-columns: 1fr; }
    .drc-native { align-items: flex-start; flex-direction: column; }
    .drc-native-actions { flex-wrap: wrap; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .drc-resource-card, .drc-consumable-card { transition: background-color .15s ease, box-shadow .15s ease; }
  }
`

export const panelMarkup = (t) => `
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
      <div class="drc-controls">
        <div class="drc-range" aria-label="${t('resource.range')}">
          <span class="drc-range-label">${t('common.period')}</span>
          <button class="drc-option" type="button" data-range="today" aria-pressed="true">${t('common.today')}</button>
          <button class="drc-option" type="button" data-range="yesterday" aria-pressed="false">${t('common.yesterday')}</button>
          <button class="drc-option" type="button" data-range="rolling24" aria-pressed="false">24 h</button>
        </div>
        <div class="drc-range" aria-label="${t('resource.granularity')}">
          <span class="drc-range-label">${t('resource.granularity')}</span>
          <button class="drc-option" type="button" data-granularity="minute" aria-pressed="false">${t('resource.granularity.minute')}</button>
          <button class="drc-option" type="button" data-granularity="fiveMinute" aria-pressed="false">${t('resource.granularity.fiveMinute')}</button>
          <button class="drc-option" type="button" data-granularity="thirtyMinute" aria-pressed="false">${t('resource.granularity.thirtyMinute')}</button>
          <button class="drc-option" type="button" data-granularity="hourly" aria-pressed="true">${t('resource.granularity.hourly')}</button>
        </div>
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
