export { normalizeAppShellState } from './appShellState'
export type { AppShellState as NormalizedAppShellState } from './appShellState'
export { applyAppUiStatePatch, configureAppUiStatePersistence, getAppUiStateSnapshot, initializeAppUiState } from './appUiState'
export { useAssetLibraryFocusStore, type AssetLibraryFocus } from './assetLibraryFocusStore'
export { useModulePersistentState } from './useModulePersistentState'
export {
  resetPreferencesStoreForTest,
  startPreferencesRuntime,
  stopPreferencesRuntime,
  syncPreferencesStoreFromAppUiState,
  usePreferencesStore,
  type PreferencesState,
} from './preferencesStore'
export { DEFAULT_THEME_ID, normalizeThemeId, THEME_IDS } from './theme'
export type { AppUiState, AppUiState as AppUiStateSnapshot, PatchAppUiStateRequest } from '@shared/contracts'
