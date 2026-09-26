const QUEST_LIST_PATH = '/kcsapi/api_get_member/questlist'
const MAX_CONTEXT_AGE_MS = 24 * 60 * 60 * 1000
const MAX_QUEST_LIST_LENGTH = 2_048
const MAX_QUEST_RESPONSE_BYTES = 4 * 1024 * 1024
const SYNC_TIMEOUT_MS = 10_000
const REQUIRED_AUTH_FIELD = 'api_token'
const AUTH_FIELDS = ['api_token', 'api_verno', 'api_starttime']

const syncError = (code, message) => Object.assign(new Error(message), { code })

const isKanColleApiUrl = (value) => {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.hostname.endsWith('.kancolle-server.com') &&
      url.pathname.includes('/kcsapi/')
    )
  } catch {
    return false
  }
}

const uploadBody = async (requestSession, uploadData = []) => {
  const chunks = []
  for (const part of uploadData) {
    if (part.bytes) {
      chunks.push(Buffer.from(part.bytes))
    } else if (part.blobUUID && typeof requestSession.getBlobData === 'function') {
      chunks.push(Buffer.from(await requestSession.getBlobData(part.blobUUID)))
    }
  }
  return Buffer.concat(chunks).toString('utf8')
}

const parseQuestListResponse = (text) => {
  const json = text.startsWith('svdata=') ? text.slice('svdata='.length) : text
  let payload
  try {
    payload = JSON.parse(json)
  } catch {
    throw syncError('KC3_QUEST_SYNC_RESPONSE_INVALID', 'The quest sync response was not JSON.')
  }
  const questList =
    payload?.api_data?.api_list == null && Number(payload?.api_data?.api_count) === 0
      ? []
      : payload?.api_data?.api_list
  if (Number(payload?.api_result) !== 1 || !Array.isArray(questList)) {
    throw syncError(
      'KC3_QUEST_SYNC_RESPONSE_INVALID',
      'The quest sync response did not contain a quest list.',
    )
  }
  if (questList.length > MAX_QUEST_LIST_LENGTH) {
    throw syncError('KC3_QUEST_SYNC_RESPONSE_INVALID', 'The quest sync response was too large.')
  }
  return questList
}

const requestQuestList = (createRequest, requestSession, url, body, setAbort) =>
  new Promise((resolve, reject) => {
    const request = createRequest({
      url,
      method: 'POST',
      session: requestSession,
      credentials: 'include',
      redirect: 'error',
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
    })
    setAbort(() => request.abort())
    request.on('error', reject)
    request.on('close', () =>
      reject(syncError('KC3_QUEST_SYNC_REQUEST_FAILED', 'The quest sync request closed early.')),
    )
    request.on('response', (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(
          syncError(
            'KC3_QUEST_SYNC_REQUEST_FAILED',
            `The quest sync request returned HTTP ${response.statusCode}.`,
          ),
        )
        request.abort()
        return
      }
      const chunks = []
      let byteCount = 0
      response.on('data', (chunk) => {
        byteCount += chunk.length
        if (byteCount > MAX_QUEST_RESPONSE_BYTES) {
          reject(
            syncError('KC3_QUEST_SYNC_RESPONSE_INVALID', 'The quest sync response was too large.'),
          )
          request.abort()
          return
        }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('aborted', () =>
        reject(
          syncError('KC3_QUEST_SYNC_REQUEST_FAILED', 'The quest sync response was interrupted.'),
        ),
      )
      response.on('end', () => {
        // EventEmitter callbacks run outside the Promise executor. Parsing errors must
        // reject this request instead of escaping into Electron's main process.
        try {
          resolve(parseQuestListResponse(Buffer.concat(chunks).toString('utf8')))
        } catch (error) {
          reject(error)
        }
      })
    })
    request.end(body)
  })

export const createKC3QuestLiveSync = ({
  requestSession,
  createRequest,
  now = Date.now,
  scheduleTimeout = setTimeout,
  cancelTimeout = clearTimeout,
} = {}) => {
  if (
    !requestSession ||
    (typeof requestSession.fetch !== 'function' && typeof createRequest !== 'function')
  ) {
    throw new TypeError('An Electron session with a request transport is required.')
  }

  const contexts = new Map()
  const inFlight = new Map()

  const observeRequest = async (details) => {
    if (
      details?.method !== 'POST' ||
      !Number.isInteger(details.webContentsId) ||
      details.webContentsId <= 0 ||
      !isKanColleApiUrl(details.url)
    ) {
      return false
    }

    const body = new URLSearchParams(await uploadBody(requestSession, details.uploadData))
    if (!body.get(REQUIRED_AUTH_FIELD)) return false

    const auth = {}
    AUTH_FIELDS.forEach((field) => {
      const value = body.get(field)
      if (value) auth[field] = value
    })
    contexts.set(details.webContentsId, {
      apiOrigin: new URL(details.url).origin,
      auth,
      capturedAt: now(),
    })
    return true
  }

  const hasContext = (webContentsId) => {
    const context = contexts.get(webContentsId)
    return Boolean(context && now() - context.capturedAt <= MAX_CONTEXT_AGE_MS)
  }

  const synchronize = async (webContentsId) => {
    if (inFlight.has(webContentsId)) return inFlight.get(webContentsId)

    const promise = (async () => {
      const context = contexts.get(webContentsId)
      if (!context || now() - context.capturedAt > MAX_CONTEXT_AGE_MS) {
        contexts.delete(webContentsId)
        throw syncError(
          'KC3_QUEST_SYNC_CONTEXT_UNAVAILABLE',
          'No recent KanColle API session is available for this game tab.',
        )
      }

      const controller = new AbortController()
      let abortRequest = () => controller.abort()
      let timedOut = false
      let rejectTimeout
      const timeout = new Promise((_, reject) => {
        rejectTimeout = reject
      })
      const timer = scheduleTimeout(() => {
        timedOut = true
        abortRequest()
        rejectTimeout(syncError('KC3_QUEST_SYNC_TIMEOUT', 'The quest sync request timed out.'))
      }, SYNC_TIMEOUT_MS)
      const startedAt = now()
      try {
        const body = new URLSearchParams({ ...context.auth, api_tab_id: '0', api_page_no: '1' })
        // Bound both response headers and body even when the network stack ignores abort.
        const fetchRequest =
          typeof createRequest === 'function'
            ? requestQuestList(
                createRequest,
                requestSession,
                new URL(QUEST_LIST_PATH, context.apiOrigin).href,
                body.toString(),
                (abort) => {
                  abortRequest = abort
                },
              )
            : (async () => {
                const response = await requestSession.fetch(
                  new URL(QUEST_LIST_PATH, context.apiOrigin).href,
                  {
                    method: 'POST',
                    headers: {
                      Accept: 'application/json, text/plain, */*',
                      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    },
                    body: body.toString(),
                    credentials: 'include',
                    signal: controller.signal,
                  },
                )
                if (!response.ok) {
                  throw syncError(
                    'KC3_QUEST_SYNC_REQUEST_FAILED',
                    `The quest sync request returned HTTP ${response.status}.`,
                  )
                }
                return parseQuestListResponse(await response.text())
              })()
        // Promise.race also handles a late rejection from the abandoned request.
        const quests = await Promise.race([fetchRequest, timeout])
        return {
          quests,
          gameWebContentsId: webContentsId,
          elapsedMs: Math.max(0, now() - startedAt),
        }
      } catch (error) {
        if (timedOut) {
          throw syncError('KC3_QUEST_SYNC_TIMEOUT', 'The quest sync request timed out.')
        }
        if (error?.code) throw error
        throw syncError(
          timedOut || error?.name === 'AbortError'
            ? 'KC3_QUEST_SYNC_TIMEOUT'
            : 'KC3_QUEST_SYNC_REQUEST_FAILED',
          timedOut || error?.name === 'AbortError'
            ? 'The quest sync request timed out.'
            : 'The quest sync request failed.',
        )
      } finally {
        cancelTimeout(timer)
      }
    })()

    inFlight.set(webContentsId, promise)
    void promise.then(
      () => {
        if (inFlight.get(webContentsId) === promise) inFlight.delete(webContentsId)
      },
      () => {
        if (inFlight.get(webContentsId) === promise) inFlight.delete(webContentsId)
      },
    )
    return promise
  }

  const forget = (webContentsId) => {
    contexts.delete(webContentsId)
    inFlight.delete(webContentsId)
  }

  return Object.freeze({ forget, hasContext, observeRequest, synchronize })
}

export { MAX_CONTEXT_AGE_MS, QUEST_LIST_PATH }
