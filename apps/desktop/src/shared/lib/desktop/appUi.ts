import type { AppUiState, PatchAppUiStateRequest } from '@shared/contracts'
import { invokeDesktop } from './runtime'

export function loadAppUiState() {
  return invokeDesktop<AppUiState>('load_app_ui_state')
}

export function patchAppUiState(request: PatchAppUiStateRequest) {
  return invokeDesktop<AppUiState>('patch_app_ui_state', { request })
}

