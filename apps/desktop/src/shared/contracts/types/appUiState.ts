export type AppUiShellState = {
  appMode: string
  launcherPage: string
  debugEnabled: boolean
  notificationSoundEnabled: boolean
}

export type AppUiAppearanceState = {
  locale: string
  accentPresetId: string
  recentGameDirectories: string[]
  playerAppearance: {
    profiles: unknown[]
    activeProfileId: string | null
  }
}

export type WorkspaceViewMode = 'edit' | 'preview'

export type AppUiWorkspaceState = {
  layouts: Record<string, Record<string, unknown>>
  workspaceViewMode?: WorkspaceViewMode
  generatedProject?: {
    activeGeneratedDraftKey?: string | null
  }
}

export type AppUiLauncherState = {
  discoverToolbar: {
    sort: string
    ascending: boolean
    timeRange: string
    pageSize: number
    filtersHidden: boolean
  }
  forceOffline: boolean
}

export type AppUiState = {
  version: number
  shell: AppUiShellState
  appearance: AppUiAppearanceState
  workspace: AppUiWorkspaceState
  launcher: AppUiLauncherState
}

export type PatchAppUiStateRequest = {
  shell?: AppUiShellState
  appearance?: Partial<AppUiAppearanceState> & {
    playerAppearance?: AppUiAppearanceState['playerAppearance']
  }
  workspace?: {
    layouts?: Record<string, Record<string, unknown> | null>
    workspaceViewMode?: WorkspaceViewMode
    generatedProject?: {
      activeGeneratedDraftKey?: string | null
    }
  }
  launcher?: Partial<AppUiLauncherState> & {
    discoverToolbar?: Partial<AppUiLauncherState['discoverToolbar']>
  }
}
