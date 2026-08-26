export const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const formatLocalizedNumber = (value, locale, options) =>
  Number(value || 0).toLocaleString(locale, options)

export const formatLocalizedDate = (value, locale, options, invalidFallback) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) && typeof invalidFallback !== 'undefined') {
    return invalidFallback
  }
  return date.toLocaleString(locale, options)
}
