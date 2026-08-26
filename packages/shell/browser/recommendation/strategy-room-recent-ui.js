import { createStrategyRoomI18n } from './i18n'
import { pinButtonMarkup, recentSectionMarkup, styles } from './views/recent-tabs-view'

// Keep the original key so existing recent links become the user's initial pinned links.
const PINNED_TABS_STORAGE_KEY = 'damecon.strategyRoom.recentTabs.v1'
const MAX_PINNED_TABS = 5

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
  recentSection.innerHTML = recentSectionMarkup(t)
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
          pinButton.innerHTML = pinButtonMarkup()
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
