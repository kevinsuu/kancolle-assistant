import { createStrategyRoomI18n } from './i18n'

// Keep the original key so existing recent links become the user's initial pinned links.
const PINNED_TABS_STORAGE_KEY = 'damecon.strategyRoom.recentTabs.v1'
const MAX_PINNED_TABS = 5

const styles = `
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

const readPinnedTabIds = () => {
  try {
    const storedValue = JSON.parse(window.localStorage.getItem(PINNED_TABS_STORAGE_KEY))
    if (!Array.isArray(storedValue)) return []
    return storedValue
      .filter(
        (tabId, index, tabIds) => typeof tabId === 'string' && tabIds.indexOf(tabId) === index,
      )
      .slice(0, MAX_PINNED_TABS)
  } catch {
    return []
  }
}

const writePinnedTabIds = (tabIds) => {
  try {
    window.localStorage.setItem(PINNED_TABS_STORAGE_KEY, JSON.stringify(tabIds))
  } catch {
    // Strategy Room navigation should keep working if browser storage is unavailable.
  }
}

const findSourceMenuItem = (menu, tabId) =>
  Array.from(menu.querySelectorAll('.submenu:not(.damecon-recent-tabs) .menulist li')).find(
    (item) => item.dataset.id === tabId,
  )

const isAvailableMenuItem = (item) => {
  if (!item || item.classList.contains('disabled')) return false
  return window.getComputedStyle(item.closest('.submenu')).display !== 'none'
}

export const injectStrategyRoomRecentTabs = () => {
  const { t } = createStrategyRoomI18n()
  const menu = document.querySelector('#menu')
  const logo = menu?.querySelector('.logo')
  if (!menu || !logo || menu.querySelector('.damecon-recent-tabs')) return

  const style = document.createElement('style')
  style.id = 'damecon-strategy-room-recent-style'
  style.textContent = styles
  document.head.appendChild(style)

  const recentSection = document.createElement('div')
  recentSection.className = 'submenu damecon-recent-tabs'
  recentSection.setAttribute('role', 'navigation')
  recentSection.setAttribute('aria-label', t('recent.aria'))
  recentSection.innerHTML = `<div class="title">${t('recent.title')}</div><ul class="menulist"></ul>`
  logo.insertAdjacentElement('afterend', recentSection)

  const recentList = recentSection.querySelector('.menulist')
  let pinnedTabIds = readPinnedTabIds()

  const togglePinnedTab = (menuItem) => {
    const tabId = menuItem.dataset.id
    if (pinnedTabIds.includes(tabId)) {
      pinnedTabIds = pinnedTabIds.filter((pinnedTabId) => pinnedTabId !== tabId)
    } else {
      pinnedTabIds = [tabId, ...pinnedTabIds].slice(0, MAX_PINNED_TABS)
    }
    writePinnedTabIds(pinnedTabIds)
    renderPinnedTabs()
  }

  const updatePinButtons = () => {
    menu
      .querySelectorAll('.submenu:not(.damecon-recent-tabs) .menulist li[data-id]')
      .forEach((menuItem) => {
        if (!isAvailableMenuItem(menuItem)) return

        menuItem.classList.add('damecon-pin-enabled')
        let pinButton = menuItem.querySelector(':scope > .damecon-pin-button')
        if (!pinButton) {
          pinButton = document.createElement('button')
          pinButton.className = 'damecon-pin-button'
          pinButton.type = 'button'
          pinButton.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Zm3 11v7"/></svg>'
          menuItem.appendChild(pinButton)
        }

        const isPinned = pinnedTabIds.includes(menuItem.dataset.id)
        pinButton.setAttribute('aria-pressed', String(isPinned))
        pinButton.setAttribute(
          'aria-label',
          isPinned
            ? t('recent.unpinItem', { name: menuItem.textContent.trim() })
            : t('recent.pinItem', { name: menuItem.textContent.trim() }),
        )
        pinButton.title = isPinned ? t('recent.unpin') : t('recent.pin')
      })
  }

  const renderPinnedTabs = () => {
    const availableTabs = pinnedTabIds
      .map((tabId) => findSourceMenuItem(menu, tabId))
      .filter(isAvailableMenuItem)

    const availableTabIds = availableTabs.map((item) => item.dataset.id)
    if (availableTabIds.length !== pinnedTabIds.length) {
      pinnedTabIds = availableTabIds
      writePinnedTabIds(pinnedTabIds)
    }
    updatePinButtons()

    if (availableTabs.length === 0) {
      recentList.innerHTML = `<li class="damecon-recent-empty">${t('recent.empty')}</li>`
      return
    }

    recentList.replaceChildren(
      ...availableTabs.map((sourceItem) => {
        const recentItem = document.createElement('li')
        recentItem.dataset.recentTabId = sourceItem.dataset.id
        recentItem.textContent = sourceItem.textContent.trim()
        recentItem.title = t('recent.openItem', { name: recentItem.textContent })
        recentItem.tabIndex = 0
        recentItem.setAttribute('role', 'button')
        if (sourceItem.classList.contains('active')) recentItem.classList.add('active')

        const openTab = () => {
          const currentSourceItem = findSourceMenuItem(menu, recentItem.dataset.recentTabId)
          if (isAvailableMenuItem(currentSourceItem)) currentSourceItem.click()
        }
        recentItem.addEventListener('click', openTab)
        recentItem.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          openTab()
        })
        return recentItem
      }),
    )
  }

  document.addEventListener(
    'click',
    (event) => {
      const pinButton = event.target.closest?.('#menu .damecon-pin-button')
      if (pinButton) {
        event.preventDefault()
        event.stopImmediatePropagation()
        togglePinnedTab(pinButton.closest('li[data-id]'))
        return
      }

      const menuItem = event.target.closest?.('#menu .submenu .menulist li[data-id]')
      if (!menuItem || menuItem.closest('.damecon-recent-tabs') || !isAvailableMenuItem(menuItem)) {
        return
      }
      window.setTimeout(renderPinnedTabs, 0)
    },
    true,
  )

  renderPinnedTabs()
}
