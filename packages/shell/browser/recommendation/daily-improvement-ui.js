const FILTERED_EQUIPMENT_SELECTOR = [
  '.equipment.disabled',
  '.equipment.equipped',
  '.equipment.insufficient',
].join(',')

const CATEGORY_FILTER_ID = 'kca-daily-improvement-category-filter'
const CATEGORY_FILTER_STYLE_ID = 'kca-daily-improvement-category-filter-styles'
const CATEGORY_HIDDEN_CLASS = 'kca-equipment-category-hidden'
const ALL_CATEGORIES = 'all'

const CATEGORY_FILTER_STYLES = `
  .tab_akashi .kca-equipment-categories {
    align-items: center;
    display: flex;
    gap: 5px;
    margin: 0 0 5px;
    min-width: 0;
    width: 680px;
  }
  .tab_akashi .kca-equipment-categories__label {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: bold;
    line-height: 28px;
  }
  .tab_akashi .kca-equipment-categories__rail {
    display: flex;
    flex: 1 1 auto;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    padding: 2px 0 4px;
    scrollbar-width: thin;
  }
  .tab_akashi .kca-equipment-category {
    align-items: center;
    border: 1px solid transparent;
    border-radius: 5px;
    color: inherit;
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    height: 28px;
    justify-content: center;
    min-width: 32px;
    padding: 2px 5px;
    font-family: inherit;
  }
  .tab_akashi .kca-equipment-category img {
    border-radius: 50%;
    height: 22px;
    width: 22px;
  }
  .tab_akashi .kca-equipment-category--all {
    font-size: 12px;
    font-weight: bold;
    padding-inline: 9px;
  }
  .tab_akashi .kca-equipment-category.active {
    border-color: currentColor;
    box-shadow: inset 0 -3px 0 currentColor;
  }
  .tab_akashi .kca-equipment-category:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 1px;
  }
  .tab_akashi .equipment.${CATEGORY_HIDDEN_CLASS} {
    display: none !important;
  }
`

const getCategoryCopy = (root) => {
  const language = root.documentElement?.lang?.toLowerCase() || ''
  if (language.startsWith('zh-hans')) {
    return {
      label: '装备类别',
      all: '全部',
      describe: (name, count) => `${name}类，共 ${count} 项`,
    }
  }
  if (language.startsWith('zh')) {
    return {
      label: '裝備類別',
      all: '全部',
      describe: (name, count) => `${name}類，共 ${count} 項`,
    }
  }
  if (language.startsWith('ja')) {
    return {
      label: '装備カテゴリ',
      all: 'すべて',
      describe: (name, count) => `${name}系統、${count}件`,
    }
  }
  return {
    label: 'Equipment type',
    all: 'All',
    describe: (name, count) => `${name} type, ${count} items`,
  }
}

export const getDailyImprovementEquipmentType = (equipment) => {
  const name = equipment.querySelector?.('.eq_name')
  const value = name?.dataset?.item_type3 ?? name?.getAttribute?.('data-item_type3')
  return /^\d+$/.test(String(value)) ? String(value) : null
}

export const applyDailyImprovementCategoryFilter = (equipmentRows, activeType) => {
  Array.from(equipmentRows).forEach((equipment) => {
    const hidden =
      activeType !== ALL_CATEGORIES &&
      getDailyImprovementEquipmentType(equipment) !== String(activeType)
    equipment.classList.toggle(CATEGORY_HIDDEN_CLASS, hidden)
  })
}

export const isDailyImprovementEquipmentAvailable = (equipment) =>
  !equipment.matches?.(FILTERED_EQUIPMENT_SELECTOR)

export const collectDailyImprovementCategories = (equipmentRows) => {
  const categories = new Map()
  Array.from(equipmentRows).forEach((equipment) => {
    if (!isDailyImprovementEquipmentAvailable(equipment)) return
    const type = getDailyImprovementEquipmentType(equipment)
    if (type === null) return
    const name = equipment.querySelector('.eq_name')?.textContent?.trim() || `#${type}`
    const icon = equipment.querySelector('.eq_icon img')?.getAttribute('src') || ''
    const category = categories.get(type)
    if (category) {
      category.count += 1
    } else {
      categories.set(type, { type, name, icon, count: 1 })
    }
  })
  return [...categories.values()].sort((left, right) => Number(left.type) - Number(right.type))
}

const createCategoryButton = (root, category, copy) => {
  const button = root.createElement('button')
  button.type = 'button'
  button.className = 'kca-equipment-category bscolor4 hover'
  button.dataset.equipmentType = category.type
  button.title = copy.describe(category.name, category.count)
  button.setAttribute('aria-label', button.title)
  button.setAttribute('aria-pressed', 'false')

  const icon = root.createElement('img')
  icon.src = category.icon
  icon.alt = ''
  icon.setAttribute('aria-hidden', 'true')
  button.appendChild(icon)
  return button
}

const renderCategoryButtons = (root, filter, categories, copy, activeType) => {
  const rail = filter.querySelector('.kca-equipment-categories__rail')
  rail.replaceChildren()

  const allButton = root.createElement('button')
  allButton.type = 'button'
  allButton.className = 'kca-equipment-category kca-equipment-category--all bscolor4 hover'
  allButton.dataset.equipmentType = ALL_CATEGORIES
  allButton.textContent = copy.all
  allButton.setAttribute('aria-pressed', 'false')
  rail.appendChild(allButton)
  categories.forEach((category) => rail.appendChild(createCategoryButton(root, category, copy)))

  filter.dataset.categorySignature = categories
    .map((category) => `${category.type}:${category.count}`)
    .join(',')
  filter.dataset.activeType = activeType
}

const selectCategory = (filter, equipmentRows, activeType) => {
  filter.dataset.activeType = activeType
  filter.querySelectorAll('[data-equipment-type]').forEach((button) => {
    const active = button.dataset.equipmentType === activeType
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  applyDailyImprovementCategoryFilter(equipmentRows, activeType)
}

export const mountDailyImprovementCategoryFilter = (root = document) => {
  const tab = root.querySelector('.tab_akashi')
  const weekdays = tab?.querySelector('.weekdays')
  const equipmentList = tab?.querySelector('.equipment_list')
  const equipmentRows = equipmentList?.querySelectorAll('.equipment') || []
  if (!tab || !weekdays || equipmentRows.length === 0) return false

  let filter = tab.querySelector(`#${CATEGORY_FILTER_ID}`)
  if (!filter) {
    if (!root.getElementById(CATEGORY_FILTER_STYLE_ID)) {
      const style = root.createElement('style')
      style.id = CATEGORY_FILTER_STYLE_ID
      style.textContent = CATEGORY_FILTER_STYLES
      root.head.appendChild(style)
    }

    filter = root.createElement('nav')
    filter.id = CATEGORY_FILTER_ID
    filter.className = 'kca-equipment-categories'
    const copy = getCategoryCopy(root)
    filter.setAttribute('aria-label', copy.label)

    const label = root.createElement('span')
    label.className = 'kca-equipment-categories__label'
    label.textContent = copy.label
    const rail = root.createElement('div')
    rail.className = 'kca-equipment-categories__rail'
    filter.append(label, rail)
    weekdays.insertAdjacentElement('afterend', filter)

    filter.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-equipment-type]')
      if (!button || !filter.contains(button)) return
      selectCategory(
        filter,
        equipmentList.querySelectorAll('.equipment'),
        button.dataset.equipmentType,
      )
    })
  }

  const categories = collectDailyImprovementCategories(equipmentRows)
  const day = tab.querySelector('.weekday.active')?.dataset?.value || ''
  const availableTypes = new Set(categories.map((category) => category.type))
  let activeType = filter.dataset.day === day ? filter.dataset.activeType : ALL_CATEGORIES
  if (activeType !== ALL_CATEGORIES && !availableTypes.has(activeType)) activeType = ALL_CATEGORIES

  const categorySignature = categories
    .map((category) => `${category.type}:${category.count}`)
    .join(',')
  if (filter.dataset.categorySignature !== categorySignature) {
    renderCategoryButtons(root, filter, categories, getCategoryCopy(root), activeType)
  }
  filter.dataset.day = day
  selectCategory(filter, equipmentRows, activeType)
  return true
}

export const applyDefaultDailyImprovementFilter = (
  root = document,
  filteredButtons = new WeakSet(),
) => {
  const button = root.querySelector('.tab_akashi #disabled_toggle')
  const equipmentList = root.querySelector('.tab_akashi .equipment_list')
  if (
    !button ||
    !equipmentList?.querySelector(FILTERED_EQUIPMENT_SELECTOR) ||
    filteredButtons.has(button)
  ) {
    return false
  }

  filteredButtons.add(button)
  button.click()
  return true
}

export const injectDefaultDailyImprovementFilter = () => {
  const content = document.querySelector('#contentHtml')
  if (!content) return

  const filteredButtons = new WeakSet()
  let scheduled = false
  const scheduleFilter = () => {
    if (scheduled) return
    scheduled = true
    window.setTimeout(() => {
      scheduled = false
      applyDefaultDailyImprovementFilter(content, filteredButtons)
      mountDailyImprovementCategoryFilter(content.ownerDocument)
    }, 0)
  }

  new MutationObserver(scheduleFilter).observe(content, { childList: true, subtree: true })
  scheduleFilter()
}
