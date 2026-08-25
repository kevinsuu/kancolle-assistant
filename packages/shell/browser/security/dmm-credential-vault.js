import fs from 'fs/promises'
import path from 'path'
import { BrowserWindow } from 'electron'

const GET_CREDENTIAL_CHANNEL = 'dmm-credentials:get'
const OFFER_CREDENTIAL_CHANNEL = 'dmm-credentials:offer-save'
const LOGIN_HOST = 'accounts.dmm.com'
const LOGIN_PATH_PREFIX = '/service/login/password'
const VAULT_VERSION = 1

const isTrustedLoginUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl)
    return (
      url.protocol === 'https:' &&
      url.hostname === LOGIN_HOST &&
      url.pathname.startsWith(LOGIN_PATH_PREFIX)
    )
  } catch {
    return false
  }
}

const isTrustedMainFrame = (event) =>
  event.senderFrame?.parent === null && isTrustedLoginUrl(event.senderFrame.url)

const isValidCredential = (credential) =>
  credential &&
  typeof credential.username === 'string' &&
  credential.username.length > 0 &&
  credential.username.length <= 512 &&
  typeof credential.password === 'string' &&
  credential.password.length > 0 &&
  credential.password.length <= 4096

const isSecureStorageAvailable = (safeStorage) => {
  if (!safeStorage.isEncryptionAvailable()) return false
  if (process.platform !== 'linux') return true
  return safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

const readCredential = async ({ safeStorage, vaultPath }) => {
  if (!isSecureStorageAvailable(safeStorage)) return null

  try {
    const stored = JSON.parse(await fs.readFile(vaultPath, 'utf8'))
    if (stored.version !== VAULT_VERSION || typeof stored.encrypted !== 'string') return null

    const credential = JSON.parse(
      safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64')),
    )
    return isValidCredential(credential) ? credential : null
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Unable to read the encrypted DMM credential vault.')
    }
    return null
  }
}

const writeCredential = async ({ credential, safeStorage, vaultPath }) => {
  const vaultDirectory = path.dirname(vaultPath)
  const temporaryPath = `${vaultPath}.tmp`
  const encrypted = safeStorage.encryptString(JSON.stringify(credential)).toString('base64')

  await fs.mkdir(vaultDirectory, { recursive: true, mode: 0o700 })
  await fs.writeFile(temporaryPath, JSON.stringify({ version: VAULT_VERSION, encrypted }), {
    encoding: 'utf8',
    mode: 0o600,
  })
  await fs.rename(temporaryPath, vaultPath)
}

const showSavePrompt = async ({ dialog, event, username }) => {
  const ownerWindow =
    BrowserWindow.fromWebContents(event.sender) || event.sender.getOwnerBrowserWindow()
  const options = {
    type: 'question',
    title: 'DMM login',
    message: 'Save this DMM login on this device?',
    detail:
      `Account: ${username}\n\n` +
      'The password will be encrypted for your operating-system account and will only be ' +
      'filled on https://accounts.dmm.com. It will never be submitted automatically.',
    buttons: ['Save locally', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }

  return ownerWindow ? dialog.showMessageBox(ownerWindow, options) : dialog.showMessageBox(options)
}

export const registerDmmCredentialVault = ({ app, dialog, ipcMain, safeStorage }) => {
  const vaultPath = path.join(app.getPath('userData'), 'secure-storage', 'dmm-login.json')
  let saveOperation = Promise.resolve({ saved: false })

  ipcMain.handle(GET_CREDENTIAL_CHANNEL, async (event) => {
    if (!isTrustedMainFrame(event)) return null
    return readCredential({ safeStorage, vaultPath })
  })

  ipcMain.handle(OFFER_CREDENTIAL_CHANNEL, async (event, credential) => {
    if (!isTrustedMainFrame(event) || !isValidCredential(credential)) {
      return { saved: false }
    }
    if (!isSecureStorageAvailable(safeStorage)) {
      return { saved: false, reason: 'secure-storage-unavailable' }
    }

    const requestedCredential = {
      username: credential.username,
      password: credential.password,
    }

    saveOperation = saveOperation
      .then(async () => {
        const existing = await readCredential({ safeStorage, vaultPath })
        if (
          existing?.username === requestedCredential.username &&
          existing?.password === requestedCredential.password
        ) {
          return { saved: true, unchanged: true }
        }

        const response = await showSavePrompt({
          dialog,
          event,
          username: requestedCredential.username,
        })
        if (response.response !== 0) return { saved: false }

        await writeCredential({
          credential: requestedCredential,
          safeStorage,
          vaultPath,
        })
        return { saved: true }
      })
      .catch(() => {
        console.warn('Unable to save the encrypted DMM credential vault.')
        return { saved: false }
      })

    return saveOperation
  })
}
