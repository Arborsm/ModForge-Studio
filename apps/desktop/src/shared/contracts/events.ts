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

export type LauncherCloudflareChallengeSource =
  | 'diagnostics'
  | 'library-gallery-cover'
  | 'updates-detail'
  | 'updates-changelog'

export type LauncherEvent = {
  type: 'launcher/cloudflare-challenge-required'
  url: string
  source: LauncherCloudflareChallengeSource
}

export type AppEvent =
  | WorkbenchEvent
  | CpMakerEvent
  | LauncherEvent
  | {
      type: 'app/locale-changed'
      locale: string
    }

export interface AppEventBus {
  emit: (event: AppEvent) => void
  subscribe: (listener: (event: AppEvent) => void) => () => void
}
