/** Navigation command to open a page or workbench module by id. */
export type NavigationCommand =
  | {
      type: 'navigation/open-page'
      pageId: string
    }
  | {
      type: 'navigation/open-workbench-module'
      moduleId: string
    }

/** Command to focus or open an asset inside the workbench. */
export type WorkbenchCommand = {
  type: 'workbench/open-asset'
  assetId: string
  assetKind: 'event' | 'map' | 'image' | 'data'
  sourceId?: string
}

/** Union of all typed commands dispatched through the app command bus. */
export type AppCommand = NavigationCommand | WorkbenchCommand

/** A workbench-targeting command held pending until the workbench shell is ready to handle it. */
export type PendingWorkbenchCommandIntent = {
  id: string
  command: Extract<AppCommand, { type: 'navigation/open-workbench-module' | 'workbench/open-asset' }>
}

/** Sink for typed app commands; implemented by the app shell and consumed by features. */
export interface CommandDispatcher {
  dispatch: (command: AppCommand) => void | Promise<void>
}
