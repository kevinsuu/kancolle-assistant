import { Worker } from 'worker_threads'
import { createRecommendationWorkerService } from './recommendation/recommendation-worker-service'
import { createCacheMaintenance } from './services/cache-maintenance'
import path from 'path'
import { app, BrowserWindow, ipcMain, dialog } from 'electron'

import {
  installKccpMod,
  kccp,
  kccpCacheHandler,
  kccpCacher,
  kccpModderUtils,
  kccpPatcher,
  reloadKccpModCache,
  updateKccpMod,
} from './kccacheproxy-api'

import { createKccpRuntime } from './kccp-runtime'
export const createKccpService = (dependencies = {}) => {
  const service = createKccpRuntime({
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    kccp,
    kccpCacher,
    kccpCacheHandler,
    kccpModderUtils,
    kccpPatcher,
    installKccpMod,
    updateKccpMod,
    reloadKccpModCache,
    ...dependencies,
  })

  const cacher = dependencies.kccpCacher || kccpCacher
  const proxyRuntime = dependencies.kccp || kccp
  const logger = (event, data) => service.logger.log('maintenance', event, data)
  const worker = createRecommendationWorkerService({
    createWorker: () => new Worker(path.join(__dirname, 'maintenance.worker.js')),
    logger,
    timeoutMs: 120_000,
  })
  const maintenance = createCacheMaintenance({
    run: (input) => worker.runMaintenance(input),
    getCache: () => {
      if (!cacher.getCached()) cacher.loadCached()
      return cacher.getCached()
    },
    getDirectory: () => service.getCachePath(proxyRuntime.config.getConfig()),
    save: () => cacher.forceSave(),
    logger,
  })
  return Object.freeze({
    ...service,
    mergeCache: maintenance.mergeCache,
    extractSplit: (source, target) =>
      worker.runMaintenance({ operation: 'extract', source, target }),
    makeOutlines: (source, target) =>
      worker.runMaintenance({ operation: 'outlines', source, target }),
    dispose: async () => {
      await worker.dispose()
      await Promise.all([maintenance.dispose(), service.dispose()])
    },
  })
}
