export const styles = `
  .dqr-root { --dqr-line: #d8e1e5; --dqr-muted: #78868d; --dqr-teal: #2b8091; --dqr-gold: #b78300; --dqr-alert: #c65a52; width: 700px; min-height: 720px; font-size: 12px; line-height: 1.45; }
  body.dark .dqr-root { --dqr-line: #3e474c; --dqr-muted: #9ba7ad; --dqr-teal: #62b7c5; --dqr-gold: #fc0; --dqr-alert: #e27a72; }
  .dqr-root *, .dqr-root *::before, .dqr-root *::after { box-sizing: border-box; }
  .dqr-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .dqr-weight { color: #888; }
  .dqr-toolbar-actions { display: flex; flex: 0 0 auto; gap: 6px; }
  .dqr-toolbar-button { min-width: 82px; min-height: 29px; padding: 0 10px; cursor: pointer; font: inherit; }
  .dqr-refresh:disabled { cursor: wait; opacity: .55; }
  .dqr-export:disabled { cursor: not-allowed; opacity: .55; }
  .dqr-toolbar-button:focus-visible { outline: 2px solid #69c; outline-offset: 2px; }
  body.dark .dqr-toolbar-button { border: 1px solid #444; background: #121212; color: #aaa; }
  body:not(.dark) .dqr-toolbar-button { border: 1px solid #abc; border-radius: 7px; background: #edf6fa; color: #467080; }
  .dqr-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 8px 14px; padding-top: 7px; padding-bottom: 7px; border-top: 1px solid #8883; }
  .dqr-chapter-filter-block { display: grid; grid-column: 1 / -1; gap: 4px; padding-bottom: 7px; border-bottom: 1px solid #8883; }
  .dqr-chapter-filter-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .dqr-chapter-filter-note { color: var(--dqr-muted); }
  .dqr-chapter-filter-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .dqr-filter-block { display: grid; gap: 4px; min-width: 0; }
  .dqr-control-label { color: var(--dqr-muted); font-weight: bold; letter-spacing: .05em; }
  .dqr-filter-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .dqr-filter { min-height: 27px; padding: 2px 8px; border: 1px solid #8885; border-radius: 14px; background: transparent; color: inherit; cursor: pointer; font: inherit; }
  .dqr-filter:hover { border-color: #568da3; }
  .dqr-filter.is-active { border-color: #568da3; background: #568da322; color: #356e85; font-weight: bold; }
  .dqr-filter[data-quest-filter="medalBlueprint"].is-active { border-color: #b9942d; background: #d6a40018; color: #9b6d00; }
  .dqr-filter[data-quest-filter="actionReport"].is-active { border-color: #8062ad; background: #8062ad14; color: #72509f; }
  .dqr-filter[data-quest-filter="screws"].is-active { border-color: #39875d; background: #39875d14; color: #28764b; }
  .dqr-filter[data-quest-filter="equipmentMaterials"].is-active { border-color: #a36b22; background: #a36b2212; color: #8a5b21; }
  .dqr-filter[data-quest-chapter].is-active { border-color: #568da3; background: #568da322; color: #356e85; }
  .dqr-filter:disabled { cursor: wait; opacity: .5; }
  .dqr-filter:focus-visible, .dqr-sort:focus-visible { outline: 2px solid #69c; outline-offset: 2px; }
  .dqr-sort-block { display: grid; grid-template-columns: auto auto; align-items: center; gap: 4px 7px; }
  .dqr-sort { min-width: 115px; min-height: 29px; padding: 2px 24px 2px 7px; border: 1px solid #8885; border-radius: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
  .dqr-sort:disabled { cursor: wait; opacity: .5; }
  .dqr-visible-count { grid-column: 1 / -1; color: var(--dqr-muted); text-align: right; }
  body.dark .dqr-filter.is-active { color: #9acbdd; }
  body.dark .dqr-filter[data-quest-filter="medalBlueprint"].is-active { color: #fc0; }
  body.dark .dqr-filter[data-quest-filter="actionReport"].is-active { color: #c89cff; }
  body.dark .dqr-filter[data-quest-filter="screws"].is-active { color: #70cf95; }
  body.dark .dqr-filter[data-quest-filter="equipmentMaterials"].is-active { color: #d7a45f; }
  body.dark .dqr-filter[data-quest-chapter].is-active { color: #9acbdd; }
  body.dark .dqr-sort { background: #161616; }
  .dqr-status { min-height: 18px; margin: 8px 0 3px; color: #888; }
  .dqr-status.error { color: #c55b53; }
  .dqr-output { min-height: 480px; }
  .dqr-eo-strip { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px; margin: 4px 0 10px; padding: 8px 10px; border-left: 3px solid #b9942d; }
  .dqr-eo-strip > div:first-child strong, .dqr-eo-strip > div:first-child span { display: block; }
  .dqr-eo-strip > div:first-child strong { color: #b78300; }
  .dqr-eo-strip > div:first-child span { margin-top: 2px; color: #888; line-height: 1.35; }
  .dqr-eo-list { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .dqr-eo-list > span { display: inline-flex; gap: 4px; padding: 3px 6px; border: 1px solid #8884; border-radius: 11px; color: #888; }
  .dqr-eo-list > span.available { border-color: #b9942d88; background: #d6a40018; color: #b78300; }
  .dqr-eo-list > span.cleared { opacity: .65; }
  body.dark .dqr-eo-strip > div:first-child strong, body.dark .dqr-eo-list > span.available { color: #fc0; }
  .dqr-message { min-height: 170px; padding: 70px 20px; text-align: center; }
  .dqr-message strong { display: block; margin-bottom: 5px; font-size: 14px; }
  .dqr-message span { color: #888; }
  .dqr-list { display: grid; gap: 10px; margin: 0; padding: 4px 0 20px; list-style: none; }
  .dqr-list-entry { min-width: 0; margin: 0; }
  .dqr-group { min-width: 0; overflow: hidden; border: 1px solid var(--dqr-line); border-top: 3px solid #8ca5b3; }
  .dqr-list-entry.combined .dqr-group { border-top-color: #d6a400; }
  body:not(.dark) .dqr-group { border-radius: 3px; box-shadow: 0 2px 5px #24596c16; }
  .dqr-group-heading { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 9px; border-bottom: 1px solid #8883; background: #d6a40010; }
  .dqr-group-heading > div:first-child { display: flex; align-items: baseline; gap: 6px; }
  .dqr-group-heading > div:first-child strong { color: #b78300; font-size: 13px; }
  body.dark .dqr-group-heading > div:first-child strong { color: #fc0; }
  .dqr-group-heading > div:first-child span { color: #888; }
  .dqr-group-relations { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; }
  .dqr-relation { display: inline-flex; align-items: center; min-height: 22px; padding: 1px 7px; border-radius: 11px; color: #fff; font-weight: bold; }
  .dqr-relation.sameSortie { background: #2b8091; }
  .dqr-relation.sameExercise { background: #397ba8; }
  .dqr-relation.sameExpedition { background: #4f8b62; }
  .dqr-relation.sameArsenal { background: #9a633f; }
  .dqr-relation.sequence { background: #a36b22; }
  .dqr-relation.unlock { background: #7b65a5; }
  .dqr-branch { display: grid; gap: 6px; margin: 0; padding: 6px; list-style: none; }
  .dqr-quest-node { min-width: 0; margin: 0; }
  .dqr-quest-node:last-child { margin-bottom: 0; }
  .dqr-quest-row { min-width: 0; overflow: hidden; }
  body:not(.dark) .dqr-quest-row { background: #fff; }
  body.dark .dqr-quest-row { background: #202020; }
  .dqr-quest-header { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 38px; padding: 7px 9px; border-bottom: 1px solid var(--dqr-line); }
  .dqr-quest-icon { width: 49px; min-height: 23px; padding: 3px 2px; border-right: 4px solid #888; background: #1675c1; color: #fff; text-align: center; font: bold 12px/17px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dqr-quest-icon.daily { border-right-color: #58c7d9; }
  .dqr-quest-icon.weekly { border-right-color: #af83de; }
  .dqr-quest-icon.monthly { border-right-color: #3f6; }
  .dqr-quest-icon.quarterly { border-right-color: #f95; }
  .dqr-quest-icon.yearly { border-right-color: #f1c232; }
  .dqr-quest-icon.oneTime { border-right-color: #8ca5b3; }
  .dqr-heading { min-width: 0; }
  .dqr-heading h2 { margin: 0; overflow-wrap: anywhere; font-size: 14px; line-height: 1.4; }
  .dqr-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; }
  .dqr-tag { display: inline-flex; align-items: center; min-height: 22px; padding: 1px 7px; border-radius: 11px; }
  .dqr-tag.period { background: #1675c1; color: #fff; }
  .dqr-tag.period.daily { background: #258b9c; }
  .dqr-tag.period.weekly { background: #76539d; }
  .dqr-tag.period.monthly { background: #287a4a; }
  .dqr-tag.period.quarterly { background: #ad602f; }
  .dqr-tag.period.yearly { background: #9a7610; }
  .dqr-tag.period.oneTime { background: #607987; }
  .dqr-tag.state { background: #8883; color: inherit; }
  .dqr-card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; }
  .dqr-card-cell { min-width: 0; padding: 8px 9px 9px; }
  .dqr-card-cell + .dqr-card-cell { border-left: 1px solid var(--dqr-line); }
  .dqr-cell-label { display: block; color: var(--dqr-muted); font-weight: bold; letter-spacing: .06em; }
  .dqr-rewards { display: grid; gap: 4px; margin-top: 5px; }
  .dqr-reward { display: flex; align-items: center; gap: 6px; min-height: 24px; padding: 3px 5px; border-left: 2px solid #8886; background: #8881; color: #777; font-weight: 600; line-height: 1.3; }
  .dqr-reward img { width: 18px; height: 18px; flex: 0 0 18px; object-fit: contain; }
  .dqr-reward.compact { min-height: 20px; padding: 2px 4px; }
  .dqr-reward.compact img { width: 15px; height: 15px; flex-basis: 15px; }
  .dqr-reward.medalBlueprint { border-left-color: #b9942d; background: #d6a40018; color: #9b6d00; }
  .dqr-reward.actionReport { border-left-color: #8062ad; background: #8062ad14; color: #72509f; }
  .dqr-reward.screws { border-left-color: #39875d; background: #39875d14; color: #28764b; }
  body.dark .dqr-reward { color: #aaa; }
  body.dark .dqr-reward.medalBlueprint { border-color: #fc06; color: #fc0; }
  body.dark .dqr-reward.actionReport { border-color: #c89cff66; color: #c89cff; }
  body.dark .dqr-reward.screws { border-color: #70cf9566; color: #70cf95; }
  .dqr-downstream { display: grid; gap: 4px; margin-top: 8px; padding-top: 7px; border-top: 1px dashed #7b65a566; }
  .dqr-downstream > strong { color: #72509f; }
  body.dark .dqr-downstream > strong { color: #c89cff; }
  .dqr-downstream article { padding: 4px; background: #7b65a50c; }
  .dqr-downstream header { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 4px; line-height: 1.35; }
  .dqr-downstream header b { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dqr-downstream header span { overflow-wrap: anywhere; }
  .dqr-downstream header em { color: var(--dqr-muted); font-style: normal; white-space: nowrap; }
  .dqr-downstream .dqr-rewards { margin-top: 3px; }
  .dqr-guidance-reasons { display: grid; gap: 3px; margin-top: 5px; }
  .dqr-guidance-reasons span { padding: 2px 5px; border-left: 2px solid #a36b22; background: #a36b2212; color: #8a5b21; line-height: 1.35; }
  body.dark .dqr-guidance-reasons span { color: #d7a45f; }
  .dqr-description { margin: 5px 0 0; color: #777; line-height: 1.5; }
  body.dark .dqr-description { color: #aaa; }
  .dqr-deadline { margin-top: 8px; color: var(--dqr-muted); font-weight: 600; line-height: 1.45; }
  .dqr-deadline.urgent { color: var(--dqr-alert); font-weight: bold; }
  .dqr-priority { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-top: 5px; padding-bottom: 6px; border-bottom: 1px solid var(--dqr-line); }
  .dqr-priority span { color: var(--dqr-muted); }
  .dqr-priority strong { font-size: 14px; }
  .dqr-priority.highest strong { color: #b78300; }
  .dqr-priority.priority strong { color: #8b65c2; }
  .dqr-priority.recommended strong { color: #39875d; }
  .dqr-priority.conditional strong { color: #a36b22; }
  .dqr-priority.optional strong { color: #888; }
  .dqr-priority.unavailable strong { color: #c65a52; }
  body.dark .dqr-priority.highest strong { color: #fc0; }
  body.dark .dqr-priority.priority strong { color: #c89cff; }
  body.dark .dqr-priority.recommended strong { color: #70cf95; }
  .dqr-synergy-detail { padding: 7px 9px 8px 24px; border-top: 1px solid #d6a40044; background: #d6a4000d; }
  .dqr-plan-stage { position: relative; margin-top: 6px; padding: 6px 7px 6px 10px; border-left: 2px solid #2b8091; background: #fff8; }
  .dqr-plan-stage:first-child { margin-top: 0; }
  .dqr-plan-stage.sequence { border-left-color: #a36b22; }
  .dqr-plan-stage.unlock { border-left-color: #7b65a5; }
  body.dark .dqr-plan-stage { background: #1118; }
  .dqr-stage-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
  .dqr-stage-heading strong { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dqr-stage-heading > span:last-child { color: #888; }
  .dqr-stage-participants { display: grid; gap: 3px; margin-top: 5px; }
  .dqr-stage-participants > span { padding: 3px 5px; border-left: 2px solid #2b8091; background: #2b80910d; line-height: 1.35; }
  .dqr-stage-participants > span.locked { border-left-color: #7b65a5; opacity: .72; }
  .dqr-stage-participants b { margin-right: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dqr-stage-participants em { margin-left: 5px; padding: 1px 4px; border-radius: 7px; background: #7b65a522; color: #7b65a5; font-style: normal; }
  .dqr-stage-objectives { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 6px; margin-top: 5px; line-height: 1.45; }
  .dqr-stage-objectives > span { color: #888; }
  .dqr-synergy-steps { margin: 4px 0 0; padding-left: 17px; color: #777; line-height: 1.5; }
  body.dark .dqr-synergy-steps { color: #aaa; }
  @media (max-width: 720px) {
    .dqr-root { width: 100%; }
    .dqr-controls { grid-template-columns: 1fr; align-items: stretch; }
    .dqr-sort-block { grid-template-columns: auto minmax(115px, 1fr); }
    .dqr-visible-count { grid-column: auto; text-align: left; }
    .dqr-eo-strip { display: block; }
    .dqr-eo-list { margin-top: 6px; }
    .dqr-group-heading { align-items: flex-start; }
    .dqr-group-relations { justify-content: flex-start; }
    .dqr-card-grid { grid-template-columns: 1fr; }
    .dqr-card-cell + .dqr-card-cell { border-top: 1px solid var(--dqr-line); border-left: 0; }
  }
`

export const panelMarkup = (t) => `
  <div id="damecon-quest-recommendation" class="dqr-root tab_quest_recommendation">
    <div class="page_title">
      <span>${t('quest.title')}</span>
      <div class="page_help_btn hover"><span>?</span> <span>${t('common.help')}</span></div>
    </div>
    <div class="page_help">
      <div class="help_q">${t('quest.help.whatQuestion')}</div>
      <div class="help_a">${t('quest.help.whatAnswer')}</div>
      <div class="help_q">${t('quest.help.priorityQuestion')}</div>
      <div class="help_a">${t('quest.help.priorityAnswer')}</div>
      <div class="help_q">${t('quest.help.scopeQuestion')}</div>
      <div class="help_a">${t('quest.help.scopeAnswer')}</div>
    </div>
    <section class="page_panel bscolor4 dqr-toolbar" aria-label="${t('quest.toolbar')}">
      <div class="dqr-weight">${t('quest.weightSummary')}</div>
      <div class="dqr-toolbar-actions">
        <button class="dqr-toolbar-button dqr-export" type="button" disabled>
          <span>${t('quest.exportMarkdown')}</span>
        </button>
        <button class="dqr-toolbar-button dqr-refresh" type="button">${t('quest.syncLatest')}</button>
      </div>
    </section>
    <section class="page_panel bscolor4 dqr-controls" aria-label="${t('quest.controls')}">
      <div class="dqr-chapter-filter-block">
        <div class="dqr-chapter-filter-heading">
          <span class="dqr-control-label">${t('quest.chapterFilter.label')}</span>
          <span class="dqr-chapter-filter-note">${t('quest.chapterFilter.hint')}</span>
        </div>
        <div class="dqr-chapter-filter-list">
          ${['world1', 'world2', 'world3', 'world4', 'world5', 'world6', 'world7']
            .map(
              (chapterKey) =>
                `<button class="dqr-filter dqr-chapter-filter is-active" type="button" data-quest-chapter="${chapterKey}" aria-pressed="true">${t(`quest.chapter.${chapterKey}`)}</button>`,
            )
            .join('')}
        </div>
      </div>
      <div class="dqr-filter-block">
        <span class="dqr-control-label">${t('quest.filter.label')}</span>
        <div class="dqr-filter-list">
          <button class="dqr-filter is-active" type="button" data-quest-filter="all" aria-pressed="true">${t('quest.filter.all')}</button>
          <button class="dqr-filter" type="button" data-quest-filter="medalBlueprint" aria-pressed="false">${t('quest.filter.medalBlueprint')}</button>
          <button class="dqr-filter" type="button" data-quest-filter="actionReport" aria-pressed="false">${t('quest.filter.actionReport')}</button>
          <button class="dqr-filter" type="button" data-quest-filter="screws" aria-pressed="false">${t('quest.filter.screws')}</button>
          <button class="dqr-filter" type="button" data-quest-filter="equipmentMaterials" aria-pressed="false">${t('quest.filter.equipmentMaterials')}</button>
        </div>
      </div>
      <label class="dqr-sort-block">
        <span class="dqr-control-label">${t('quest.sort.label')}</span>
        <select class="dqr-sort">
          <option value="deadlineAsc">${t('quest.sort.deadlineAsc')}</option>
          <option value="deadlineDesc">${t('quest.sort.deadlineDesc')}</option>
          <option value="stepsAsc">${t('quest.sort.stepsAsc')}</option>
        </select>
        <span class="dqr-visible-count" aria-live="polite"></span>
      </label>
    </section>
    <div class="page_padding">
      <div class="dqr-status" aria-live="polite">${t('quest.preparing')}</div>
      <div class="dqr-output" aria-live="polite">
        <div class="dqr-message bscolor3 fcolor2"><strong>${t('quest.loading')}</strong><span>${t('quest.loadingDetail')}</span></div>
      </div>
    </div>
  </div>
`
