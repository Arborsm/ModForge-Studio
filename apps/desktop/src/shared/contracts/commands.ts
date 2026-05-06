export type NavigationCommand =
  | {
      type: 'navigation/open-page'
      pageId: string
    }
  | {
      type: 'navigation/open-workbench-view'
      viewId: string
    }

export type WorkbenchCommand =
  | {
      type: 'workbench/open-asset'
      assetId: string
      assetKind: 'event' | 'map' | 'image' | 'data'
      sourceId?: string
    }
  | {
      type: 'workbench/focus-panel'
      panelId: string
    }

export type AppCommand = NavigationCommand | WorkbenchCommand

export interface CommandDispatcher {
  dispatch: (command: AppCommand) => void | Promise<void>
}
