/** Workbench-level events emitted when a module is selected or an asset is focused. */
export type WorkbenchEvent =
  | {
      type: 'workbench/module-selected'
      moduleId: string
    }
  | {
      type: 'workbench/asset-focused'
      assetId: string
      sourceViewId?: string
    }

/** CP-maker-level events emitted when a draft or asset is selected. */
export type CpMakerEvent =
  | {
      type: 'cp-maker/draft-selected'
      draftKey: string
    }
  | {
      type: 'cp-maker/asset-selected'
      draftKey: string
      assetId: string
      assetKind: 'event' | 'map' | 'image' | 'data'
    }

/** Union of all typed events flowing through the app event bus. */
export type AppEvent =
  | WorkbenchEvent
  | CpMakerEvent
  | {
      type: 'app/locale-changed'
      locale: string
    }

/** Typed publish/subscribe event bus shared across app layers. */
export interface AppEventBus {
  emit: (event: AppEvent) => void
  subscribe: (listener: (event: AppEvent) => void) => () => void
}
