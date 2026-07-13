import type { AppCommand } from '@shared/contracts'
import type { AppEvent } from '@shared/contracts'

export type WorkbenchOrchestration = {
  handleEvent: (event: AppEvent) => void
}

export type WorkbenchOrchestrationDependencies = {
  dispatch: (command: AppCommand) => void | Promise<void>
}

export function createWorkbenchOrchestration({ dispatch }: WorkbenchOrchestrationDependencies): WorkbenchOrchestration {
  return {
    handleEvent(event) {
      if (event.type === 'cp-maker/asset-selected') {
        void dispatch({
          type: 'workbench/open-asset',
          assetId: event.assetId,
          assetKind: event.assetKind,
          sourceId: event.draftKey,
        })
        return
      }

      if (event.type === 'workbench/module-selected') {
        void dispatch({
          type: 'navigation/open-workbench-module',
          moduleId: event.moduleId,
        })
      }
    },
  }
}
