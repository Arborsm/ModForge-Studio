/**
 * @file Desktop host facade for loading and patching persisted app UI state.
 * @module platform/host/appUi
 */

import type { AppUiState, PatchAppUiStateRequest } from '@shared/contracts'
import { HOST_COMMANDS } from '@platform/host-commands'
import { canUseDesktopHost, getPlatformPorts, invokeDesktop } from './runtime'

/** Loads persisted app shell, appearance, workspace, and launcher UI state. */
export function loadAppUiState() {
  return invokeDesktop<AppUiState>(HOST_COMMANDS.loadAppUiState, undefined, { kind: 'latest', key: 'app-ui-state' })
}

/** Applies a partial app UI state patch and returns the normalized persisted state. */
export function patchAppUiState(request: PatchAppUiStateRequest) {
  return invokeDesktop<AppUiState>(HOST_COMMANDS.patchAppUiState, { request }, { kind: 'queuedMutation', queue: 'AppUiState' })
}

/** Listens for the Android system back request forwarded by the WebView bridge. */
export async function listenToAndroidBackRequest(listener: () => void) {
  if (!canUseDesktopHost()) {
    return () => {}
  }

  return getPlatformPorts().hostEvents.listen('android:back', listener)
}
