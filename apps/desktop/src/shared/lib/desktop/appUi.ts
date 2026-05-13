import type { AppUiState, PatchAppUiStateRequest } from '@shared/contracts'
import { invokeDesktop } from './runtime'

/** Loads persisted app shell, appearance, workspace, and launcher UI state. */
export function loadAppUiState() {
  return invokeDesktop<AppUiState>('load_app_ui_state')
}

/** Applies a partial app UI state patch and returns the normalized persisted state. */
export function patchAppUiState(request: PatchAppUiStateRequest) {
  return invokeDesktop<AppUiState>('patch_app_ui_state', { request })
}

