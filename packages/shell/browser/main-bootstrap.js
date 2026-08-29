import { createKccpService } from './kccp-integration'
import { registerRecommendationIpc } from './recommendation/recommendation-ipc'
import { createRecommendationWorkerService } from './recommendation/recommendation-worker-service'
import { registerDmmCredentialVault } from './security/dmm-credential-vault'
import { createWebUiCommandRouter } from './ui/webui-command-router'
import { registerWebUiIpc } from './ui/webui-ipc'

export const createMainBootstrap = ({ createKccp = createKccpService } = {}) => {
  const kccpService = createKccp()
  let recommendationService

  const registerCoreServices = ({
    app,
    createRecommendationWorker,
    dialog,
    getKc3ExtensionId,
    ipcMain,
    logger,
    safeStorage,
  }) => {
    registerDmmCredentialVault({ app, dialog, ipcMain, safeStorage })
    recommendationService = createRecommendationWorkerService({
      createWorker: createRecommendationWorker,
      logger,
    })
    registerRecommendationIpc({
      ipcMain,
      getKc3ExtensionId,
      recommend: (input, options) => recommendationService.recommend(input, options),
      planExpeditions: (input) => recommendationService.planExpeditions(input),
      summarizeResourceLedger: (input) => recommendationService.summarizeResourceLedger(input),
      logger,
    })
  }

  const registerWebUi = ({ ipcMain, getWebUiExtensionId, routerDependencies }) => {
    registerWebUiIpc({
      ipcMain,
      getWebUiExtensionId,
      route: createWebUiCommandRouter({ ...routerDependencies, kccpService }),
    })
  }

  const dispose = () => {
    recommendationService?.dispose()
    kccpService.dispose()
  }

  return Object.freeze({ kccpService, registerCoreServices, registerWebUi, dispose })
}
