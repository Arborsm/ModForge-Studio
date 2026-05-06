export type WorkbenchEvent =
  | {
      type: 'workbench/view-selected'
      viewId: string
    }
  | {
      type: 'workbench/asset-focused'
      assetId: string
      sourceViewId?: string
    }

export type GeneratedProjectEvent =
  | {
      type: 'generated-project/draft-selected'
      draftKey: string
    }
  | {
      type: 'generated-project/asset-selected'
      draftKey: string
      assetId: string
      assetKind: 'event' | 'map' | 'image' | 'data'
    }

export type AppEvent =
  | WorkbenchEvent
  | GeneratedProjectEvent
  | {
      type: 'app/locale-changed'
      locale: string
    }

export interface AppEventBus {
  emit: (event: AppEvent) => void
  subscribe: (listener: (event: AppEvent) => void) => () => void
}
