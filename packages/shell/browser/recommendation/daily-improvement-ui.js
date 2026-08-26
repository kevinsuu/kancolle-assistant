const FILTERED_EQUIPMENT_SELECTOR = [
  '.equipment.disabled',
  '.equipment.equipped',
  '.equipment.insufficient',
].join(',')

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
    }, 0)
  }

  new MutationObserver(scheduleFilter).observe(content, { childList: true, subtree: true })
  scheduleFilter()
}
