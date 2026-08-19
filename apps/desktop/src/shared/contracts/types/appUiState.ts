import type { LoadingMotionIntensityId, LoadingMotionSpeedId, LoadingMotionSpeedMode, LoadingMotionStyleId } from './loadingMotion'
import type { WorkbenchLocation, WorkbenchNavigationSection } from '../registry'

/** Window border accent tone — matches the active theme or stays neutral. */
export type WindowBorderTone = 'accent' | 'neutral'
/** Window border thickness preset. */
export type WindowBorderWeight = 'standard' | 'thin' | 'none'
/** Behavior when the user closes the desktop window — quit the app or minimize to tray. */
export type WindowCloseBehavior = 'quit' | 'minimizeToTray'

/** Full color theme ids. Each owns its accent + neutral scale + status colors in `styles/tokens.css`. */
export type ThemeId = 'warm-paper' | 'neutral-tool' | 'slate-blue' | 'forest' | 'twilight' | 'stardew-wood' | 'crimson' | 'blossom'

/** Shell-level UI state — app mode, launcher page, debug, notification sound, and close behavior. */
export type AppUiShellState = {
  appMode: string
  launcherPage: string
  debugEnabled: boolean
  notificationSoundEnabled: boolean
  windowCloseBehavior: WindowCloseBehavior
  rememberCloseChoice: boolean
}

/** Appearance-related UI state — locale, theme, window border, recent game dirs, player profile, loading motion. */
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

/** Session state for the i18n generator tool — prefix, target prefixes, enabled targets, expanded paths. */
export type AppUiI18nGeneratorSession = {
  prefix: string
  targetPrefixes: Record<string, string>
  enabledTargets: string[]
  expandedPaths: string[]
}

/** Workbench-level UI state — location, navigation expansion, expert mode, and per-module state. */
export type AppUiWorkspaceState = {
  location: WorkbenchLocation
  navigation: {
    collapsed: boolean
    expandedSections: WorkbenchNavigationSection[]
  }
  expertMode: boolean
  modules: Record<string, Record<string, unknown>>
}

/** Launcher-level UI state — discover toolbar settings, force-offline, and force-non-premium flags. */
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

/** Root persisted UI state — shell, appearance, workspace, and launcher sections. */
export type AppUiState = {
  version: number
  shell: AppUiShellState
  appearance: AppUiAppearanceState
  workspace: AppUiWorkspaceState
  launcher: AppUiLauncherState
}

/** Patch request for partial UI state updates — only provided sections are merged. */
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
