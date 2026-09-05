import { createKccpService } from './kccp-integration'
import { registerRecommendationIpc } from './recommendation/recommendation-ipc'
import { createRecommendationWorkerService } from './recommendation/recommendation-worker-service'
import { registerDmmCredentialVault } from './security/dmm-credential-vault'
import { createWebUiCommandRouter } from './ui/webui-command-router'
import { registerWebUiIpc } from './ui/webui-ipc'

export const createMainBootstrap = ({ createKccp = createKccpService } = {}) => {
  const kccpService = createKccp()
  let recommendationService
  let disposeRecommendationIpc

  const registerCoreServices = ({
    app,
    createRecommendationWorker,
    dialog,
    getKc3ExtensionId,
    ipcMain,
    logger,
    safeStorage,
    syncQuestList,
  }) => {
    registerDmmCredentialVault({ app, dialog, ipcMain, safeStorage })
    recommendationService = createRecommendationWorkerService({
      createWorker: createRecommendationWorker,
      logger,
    })
    disposeRecommendationIpc = registerRecommendationIpc({
      ipcMain,
      getKc3ExtensionId,
      recommend: (input, options) => recommendationService.recommend(input, options),
      planExpeditions: (input) => recommendationService.planExpeditions(input),
      summarizeResourceLedger: (input) => recommendationService.summarizeResourceLedger(input),
      logger,
      syncQuestList,
    })
  }

  const registerWebUi = ({ ipcMain, getWebUiExtensionId, routerDependencies }) => {
    registerWebUiIpc({
      ipcMain,
      getWebUiExtensionId,
      logger: (event, data) => kccpService.logger.log('webui', event, data),
      route: createWebUiCommandRouter({ ...routerDependencies, kccpService }),
    })
  }

  const dispose = () => {
    disposeRecommendationIpc?.()
    const pending = recommendationService?.dispose()
    return Promise.all([pending, kccpService.dispose()])
  }

  return Object.freeze({ kccpService, registerCoreServices, registerWebUi, dispose })
}
