import type { LoadingMotionIntensityId, LoadingMotionSpeedId, LoadingMotionSpeedMode, LoadingMotionStyleId } from './loadingMotion'
import type { WorkbenchLocation, WorkbenchNavigationSection } from '../registry'

export type WindowBorderTone = 'accent' | 'neutral'
export type WindowBorderWeight = 'standard' | 'thin' | 'none'
export type WindowCloseBehavior = 'quit' | 'minimizeToTray'

/** Full color theme ids. Each owns its accent + neutral scale + status colors in `styles/tokens.css`. */
export type ThemeId = 'warm-paper' | 'neutral-tool' | 'slate-blue' | 'forest' | 'twilight' | 'stardew-wood' | 'crimson' | 'blossom'

export type AppUiShellState = {
  appMode: string
  launcherPage: string
  debugEnabled: boolean
  notificationSoundEnabled: boolean
  windowCloseBehavior: WindowCloseBehavior
  rememberCloseChoice: boolean
}

export type AppUiAppearanceState = {
  locale: string
  themeId: string
  windowBorderTone: WindowBorderTone
  windowBorderWeight: WindowBorderWeight
  recentGameDirectories: string[]
  playerAppearance: {
    profiles: unknown[]
    activeProfileId: string | null
  }
  loadingMotion: {
    styleId: LoadingMotionStyleId
    intensityId: LoadingMotionIntensityId
    speedMode: LoadingMotionSpeedMode
    speedId: LoadingMotionSpeedId
    speedMultiplier: number
  }
}

export type AppUiI18nGeneratorSession = {
  prefix: string
  targetPrefixes: Record<string, string>
  enabledTargets: string[]
  expandedPaths: string[]
}

export type AppUiWorkspaceState = {
  location: WorkbenchLocation
  navigation: {
    collapsed: boolean
    expandedSections: WorkbenchNavigationSection[]
  }
  expertMode: boolean
  modules: Record<string, Record<string, unknown>>
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
  forceNonPremium: boolean
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
    loadingMotion?: AppUiAppearanceState['loadingMotion']
  }
  workspace?: {
    location?: WorkbenchLocation
    navigation?: Partial<AppUiWorkspaceState['navigation']>
    expertMode?: boolean
    modules?: Record<string, Record<string, unknown> | null>
  }
  launcher?: Partial<AppUiLauncherState> & {
    discoverToolbar?: Partial<AppUiLauncherState['discoverToolbar']>
  }
}
