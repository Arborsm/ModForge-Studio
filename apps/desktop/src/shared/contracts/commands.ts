export type NavigationCommand =
  | {
      type: 'navigation/open-page'
      pageId: string
    }
  | {
      type: 'navigation/open-workbench-module'
      moduleId: string
    }

export type WorkbenchCommand = {
  type: 'workbench/open-asset'
  assetId: string
  assetKind: 'event' | 'map' | 'image' | 'data'
  sourceId?: string
}

export type AppCommand = NavigationCommand | WorkbenchCommand

export type PendingWorkbenchCommandIntent = {
  id: string
  command: Extract<AppCommand, { type: 'navigation/open-workbench-module' | 'workbench/open-asset' }>
}

export interface CommandDispatcher {
  dispatch: (command: AppCommand) => void | Promise<void>
}
