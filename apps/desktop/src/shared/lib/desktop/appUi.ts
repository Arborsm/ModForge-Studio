import type { AppUiState, PatchAppUiStateRequest } from '@shared/contracts'
import { invokeDesktop } from './runtime'

/** Loads persisted app shell, appearance, workspace, and launcher UI state. */
export function loadAppUiState() {
  return invokeDesktop<AppUiState>('load_app_ui_state', undefined, { kind: 'latest', key: 'app-ui-state' })
}

/** Applies a partial app UI state patch and returns the normalized persisted state. */
export function patchAppUiState(request: PatchAppUiStateRequest) {
  return invokeDesktop<AppUiState>('patch_app_ui_state', { request }, { kind: 'queuedMutation', queue: 'AppUiState' })
}
