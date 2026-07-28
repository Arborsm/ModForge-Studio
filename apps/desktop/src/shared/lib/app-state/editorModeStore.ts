import { create } from 'zustand'
import { applyAppUiStatePatch } from './appUiState'

type EditorModeState = {
  expertMode: boolean
  setExpertMode: (enabled: boolean) => void
}

/**
 * Expert mode toggle state for authoring workspaces.
 * Persisted to `AppUiWorkspaceState.expertMode` via `applyAppUiStatePatch`.
 */
export const useEditorModeStore = create<EditorModeState>((set) => ({
  expertMode: false,
  setExpertMode: (enabled) => {
    set({ expertMode: enabled })
    void applyAppUiStatePatch({ workspace: { expertMode: enabled } })
  },
}))

/**
 * Syncs the store from persisted `AppUiState.workspace.expertMode`.
 * Called once on app init after loading persisted state.
 */
export function syncEditorModeStoreFromAppUiState(expertMode: boolean) {
  useEditorModeStore.setState({ expertMode })
}
