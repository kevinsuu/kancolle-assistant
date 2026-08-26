export const styles = `
  #menu .damecon-recent-tabs {
    margin-bottom: 12px;
  }
  #menu .damecon-recent-tabs .title::before {
    content: '★';
    margin-right: 4px;
    font-size: 10px;
    vertical-align: 1px;
  }
  #menu .damecon-recent-tabs li {
    overflow: hidden;
    padding-right: 4px;
    text-overflow: ellipsis;
  }
  #menu .damecon-recent-tabs li:focus-visible {
    outline: 2px solid #69c;
    outline-offset: 1px;
  }
  #menu .submenu:not(.damecon-recent-tabs) .menulist li.damecon-pin-enabled {
    position: relative;
    padding-right: 28px;
  }
  #menu .damecon-pin-button {
    position: absolute;
    z-index: 1;
    top: 50%;
    right: 3px;
    width: 20px;
    height: 20px;
    padding: 0;
    transform: translateY(-50%);
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font: inherit;
    line-height: 20px;
    opacity: 0;
    transition: background-color .12s ease, opacity .12s ease;
  }
  #menu .damecon-pin-button svg {
    width: 13px;
    height: 13px;
    margin-top: 3px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }
  #menu li:hover > .damecon-pin-button,
  #menu li:focus-within > .damecon-pin-button {
    opacity: .68;
  }
  #menu .damecon-pin-button[aria-pressed='true'] {
    background: #1675c1;
    color: #fff;
    opacity: 1;
  }
  #menu .damecon-pin-button[aria-pressed='true'] svg {
    fill: currentColor;
  }
  #menu .damecon-pin-button:hover,
  #menu .damecon-pin-button:focus-visible {
    background: rgba(128, 128, 128, .22);
    outline: none;
    opacity: 1;
  }
  #menu .damecon-pin-button[aria-pressed='true']:hover,
  #menu .damecon-pin-button[aria-pressed='true']:focus-visible {
    background: #c43d4b;
  }
  #menu .damecon-pin-button[aria-pressed='true']:hover svg,
  #menu .damecon-pin-button[aria-pressed='true']:focus-visible svg {
    display: none;
  }
  #menu .damecon-pin-button[aria-pressed='true']:hover::before,
  #menu .damecon-pin-button[aria-pressed='true']:focus-visible::before {
    content: '×';
    font-size: 18px;
    font-weight: bold;
  }
  @media (hover: none) {
    #menu .damecon-pin-button { opacity: .68; }
  }
  #menu .damecon-recent-tabs .damecon-recent-empty {
    height: auto;
    min-height: 24px;
    padding: 4px 5px;
    cursor: default;
    font-size: 10px;
    font-weight: normal;
    line-height: 15px;
    white-space: normal;
    opacity: .72;
  }
  body.dark #menu .damecon-recent-tabs .title::before { color: #fc0; }
  body:not(.dark) #menu .damecon-recent-tabs .title::before { color: #e5a400; }
`

export const recentSectionMarkup = (t) =>
  `<div class="title">${t('recent.title')}</div><ul class="menulist"></ul>`

export const pinButtonMarkup = () =>
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Zm3 11v7"/></svg>'
