import { create } from 'zustand'

/**
 * Shared edit-mode state for authoring workspaces.
 *
 * Replaces the per-component `useEditModeNavigation` hook so that
 * `WorkbenchExperience` (which owns shell history) and `AuthoringRuntime`
 * (which owns patch rendering) share a single `activeEditPatchId`.
 *
 * `navigateToPatch` is the user-initiated entry point: it updates state and
 * notifies the shell history push callback registered by `WorkbenchExperience`.
 * `setPatch` only updates state — used during shell history restore to avoid
 * pushing a duplicate entry.
 */
type EditModeState = {
  activeEditPatchId: string | null
  /** Set patch without pushing shell history (used during history restore). */
  setPatch: (patchId: string | null) => void
  /** Set patch and notify shell history (used for user-initiated navigation). */
  navigateToPatch: (patchId: string | null) => void
  /** Reset to list view without pushing shell history. */
  reset: () => void
}

const _patchNavigateFn: { current: ((patchId: string | null) => void) | null } = { current: null }

/** Register the shell history push callback. Called once by `WorkbenchExperience`. */
export function registerPatchNavigateFn(fn: (patchId: string | null) => void): void {
  _patchNavigateFn.current = fn
}

export const useEditModeStore = create<EditModeState>((set) => ({
  activeEditPatchId: null,
  setPatch: (patchId) => set({ activeEditPatchId: patchId }),
  navigateToPatch: (patchId) => {
    set({ activeEditPatchId: patchId })
    _patchNavigateFn.current?.(patchId)
  },
  reset: () => set({ activeEditPatchId: null }),
}))
