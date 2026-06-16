import { HOST_COMMANDS, type AppUiState, type PatchAppUiStateRequest } from '@shared/contracts'
import { invokeDesktop } from './runtime'

/** Loads persisted app shell, appearance, workspace, and launcher UI state. */
export function loadAppUiState() {
  return invokeDesktop<AppUiState>(HOST_COMMANDS.loadAppUiState, undefined, { kind: 'latest', key: 'app-ui-state' })
}

/** Applies a partial app UI state patch and returns the normalized persisted state. */
export function patchAppUiState(request: PatchAppUiStateRequest) {
  return invokeDesktop<AppUiState>(HOST_COMMANDS.patchAppUiState, { request }, { kind: 'queuedMutation', queue: 'AppUiState' })
}
