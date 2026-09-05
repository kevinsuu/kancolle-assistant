export const readProxyDestination = async (configStore, kccpService) => {
  const cfg = configStore.get('proxy')
  if (cfg.mode === 'kccp-internal') {
    const { hostname, port } = (await kccpService.getConfig(configStore)).config
    return { host: hostname, port }
  }
  return { host: cfg.client.host, port: cfg.client.port }
}
export const applyProxySettings = async ({ configStore, kccpService, session, logger }) => {
  const cfg = configStore.get('proxy'),
    startedAt = Date.now()
  const internal = cfg.mode === 'kccp-internal',
    allExternal = cfg.mode === 'all-external'
  let selectedBranch = 'system'
  try {
    let settings = { mode: 'system' }
    if (cfg.enable && (internal || allExternal || cfg.method === 'https-mitm')) {
      const proxy = internal ? (await kccpService.getConfig(configStore)).config : cfg.client
      const host = internal ? proxy.hostname : proxy.host,
        port = proxy.httpsPort
      selectedBranch = allExternal ? 'all-external' : 'game-pac'
      settings = allExternal
        ? { mode: 'fixed_servers', proxyRules: `http://${host}:${port}` }
        : createKancolleProxyConfig(host, port)
    }
    await session.setProxy(settings)
    await session.forceReloadProxyConfig()
    await session.closeAllConnections()
    logger('proxy.settings-completed', {
      selectedBranch,
      mode: cfg.mode,
      enabled: cfg.enable,
      outcome: 'success',
      elapsedMs: Date.now() - startedAt,
    })
    return cfg.enable
  } catch (error) {
    logger('proxy.settings-failed', {
      selectedBranch,
      mode: cfg.mode,
      outcome: 'failed',
      reasonCode: 'PROXY_SETTINGS_FAILED',
      message: String(error.message).slice(0, 240),
      elapsedMs: Date.now() - startedAt,
    })
    throw error
  }
}
export const createKancolleProxyConfig = (host, port) => {
  // server letters, will expand to '00g|01y|02k' etc
  const servers = 'gyksmotlrsbtpbhpskish'
  const serversExp = [...servers].map((c, i) => String(i).padStart(2, '0') + c).join('|')

  const pac =
    'function FindProxyForURL(url, host) {\n' +
    `  if (new RegExp("w(${serversExp})\\.kancolle-server\\.com").test(host))\n` +
    `    return "PROXY ${host}:${port}";\n` +
    '  return "DIRECT";\n' +
    '}\n'

  const pacData =
    'data:application/x-ns-proxy-autoconfig;base64,' + Buffer.from(pac, 'utf8').toString('base64')
  return { mode: 'pac_script', pacScript: pacData }
}
