const normalizeSearchText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()

// Every whitespace-separated term must appear in the quest ID, code, title, or requirement.
export const questMatchesSearch = (quest, query) => {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = normalizeSearchText(
    [quest?.id, quest?.code, quest?.name, quest?.description].join(' '),
  )
  return terms.every((term) => haystack.includes(term))
}

export const questGuideSearchUrl = (quest) =>
  `https://www.google.com/search?q=${encodeURIComponent(
    ['艦これ', quest?.code, quest?.name, '攻略'].filter(Boolean).join(' '),
  )}`
