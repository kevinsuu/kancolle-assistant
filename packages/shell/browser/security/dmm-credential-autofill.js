const GET_CREDENTIAL_CHANNEL = 'dmm-credentials:get'
const OFFER_CREDENTIAL_CHANNEL = 'dmm-credentials:offer-save'
const LOGIN_HOST = 'accounts.dmm.com'
const LOGIN_PATH_PREFIX = '/service/login/password'

const isDmmLoginPage = () =>
  location.protocol === 'https:' &&
  location.hostname === LOGIN_HOST &&
  location.pathname.startsWith(LOGIN_PATH_PREFIX)

const findLoginInputs = () => {
  const password = document.querySelector('input[type="password"]')
  if (!(password instanceof HTMLInputElement)) return {}

  const form = password.form || document
  const selectors = [
    'input[autocomplete="username"]',
    'input[type="email"]',
    'input[name*="mail" i]',
    'input[name*="email" i]',
    'input[name*="login" i]',
    'input[type="text"]',
  ]
  const username = selectors
    .map((selector) => form.querySelector(selector))
    .find((input) => input instanceof HTMLInputElement && input !== password)

  return { username, password }
}

const setInputValue = (input, value) => {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const fillCredential = (credential) => {
  const { username, password } = findLoginInputs()
  if (!username || !password) return false
  if (username.value && username.value !== credential.username) return true

  if (!username.value) setInputValue(username, credential.username)
  if (!password.value) setInputValue(password, credential.password)
  return true
}

const offerCurrentCredential = (invoke) => {
  const { username, password } = findLoginInputs()
  if (!username?.value || !password?.value) return
  void invoke(OFFER_CREDENTIAL_CHANNEL, {
    username: username.value,
    password: password.value,
  })
}

export const initializeDmmCredentialAutofill = async (invoke) => {
  if (!isDmmLoginPage() || window.top !== window) return

  document.addEventListener('submit', () => offerCurrentCredential(invoke), true)

  const credential = await invoke(GET_CREDENTIAL_CHANNEL)
  if (!credential) return
  if (fillCredential(credential)) return

  const observer = new MutationObserver(() => {
    if (!fillCredential(credential)) return
    observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.setTimeout(() => observer.disconnect(), 10000)
}
