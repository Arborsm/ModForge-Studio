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

export type AppEvent =
  | WorkbenchEvent
  | CpMakerEvent
  | {
      type: 'app/locale-changed'
      locale: string
    }

export interface AppEventBus {
  emit: (event: AppEvent) => void
  subscribe: (listener: (event: AppEvent) => void) => () => void
}
