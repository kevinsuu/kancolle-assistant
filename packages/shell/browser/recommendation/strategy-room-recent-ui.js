import { createStrategyRoomI18n } from './i18n'
import { pinButtonMarkup, recentSectionMarkup, styles } from './views/recent-tabs-view'

// Keep the original key so existing recent links become the user's initial pinned links.
const PINNED_TABS_STORAGE_KEY = 'damecon.strategyRoom.recentTabs.v1'
const PINNED_TABS_LOG_PREFIX = '[Kancolle Assistant] Strategy Room pinned tabs'

export const readPinnedTabIds = (storage = undefined, logger = globalThis.console) => {
  try {
    const storedValue = JSON.parse(
      (storage ?? window.localStorage).getItem(PINNED_TABS_STORAGE_KEY),
    )
    if (!Array.isArray(storedValue)) return []
    const tabIds = storedValue.filter(
      (tabId, index, tabIds) => typeof tabId === 'string' && tabIds.indexOf(tabId) === index,
    )
    logger.info(PINNED_TABS_LOG_PREFIX, {
      event: 'pinned-tabs-read',
      outcome: 'restored',
      pinnedCount: tabIds.length,
      discardedCount: storedValue.length - tabIds.length,
    })
    return tabIds
  } catch (error) {
    logger.warn(PINNED_TABS_LOG_PREFIX, {
      event: 'pinned-tabs-read',
      outcome: 'empty',
      pinnedCount: 0,
      reasonCode: error instanceof SyntaxError ? 'STORAGE_PARSE_FAILED' : 'STORAGE_READ_FAILED',
      error:
        error instanceof SyntaxError
          ? 'Invalid pinned-tab JSON'
          : String(error?.message || 'unknown').slice(0, 200),
    })
    return []
  }
}

export const writePinnedTabIds = (tabIds, storage = undefined, logger = globalThis.console) => {
  try {
    const pinnedStorage = storage ?? window.localStorage
    pinnedStorage.setItem(PINNED_TABS_STORAGE_KEY, JSON.stringify(tabIds))
    return true
  } catch (error) {
    // Strategy Room navigation should keep working if browser storage is unavailable.
    logger.warn(PINNED_TABS_LOG_PREFIX, {
      event: 'pinned-tabs-write',
      outcome: 'memory-only',
      pinnedCount: tabIds.length,
      reasonCode: 'STORAGE_WRITE_FAILED',
      error: String(error?.message || 'unknown').slice(0, 200),
    })
    return false
  }
}

const findSourceMenuItem = (menu, tabId) =>
  Array.from(menu.querySelectorAll('.submenu:not(.damecon-recent-tabs) .menulist li')).find(
    (item) => item.dataset.id === tabId,
  )

const isAvailableMenuItem = (item) => {
  if (!item || item.classList.contains('disabled')) return false
  const submenu = item.closest('.submenu')
  return Boolean(submenu && !submenu.hidden && submenu.style.display !== 'none')
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
    const wasPinned = pinnedTabIds.includes(tabId)
    if (wasPinned) {
      pinnedTabIds = pinnedTabIds.filter((pinnedTabId) => pinnedTabId !== tabId)
    } else {
      pinnedTabIds = [tabId, ...pinnedTabIds]
    }
    const persisted = writePinnedTabIds(pinnedTabIds)
    console.info(PINNED_TABS_LOG_PREFIX, {
      event: 'pinned-tabs-toggle',
      tabId,
      outcome: wasPinned ? 'unpinned' : 'pinned',
      pinnedCount: pinnedTabIds.length,
      persisted,
    })
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

  const syncPinnedActiveState = () => {
    recentList.querySelectorAll('[data-recent-tab-id]').forEach((recentItem) => {
      const sourceItem = findSourceMenuItem(menu, recentItem.dataset.recentTabId)
      recentItem.classList.toggle('active', Boolean(sourceItem?.classList.contains('active')))
    })
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
      window.setTimeout(syncPinnedActiveState, 0)
    },
    true,
  )

  renderPinnedTabs()
}
