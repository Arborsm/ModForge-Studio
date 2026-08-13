/**
 * "Open in item authoring" handoff.
 *
 * The codex page and the authoring page are separate workbench modules and must
 * not import each other, so the request travels through this shared entity-level
 * store instead.
 *
 * It runs in two phases because an item jump crosses two boundaries the building
 * jump does not: the item pages span several asset families, so the workbench
 * first has to open the patch for the requested family, and only then can the
 * editor inside it select the entry. `pendingTarget` drives the first step;
 * `pendingEntry` drives the second and exists only for families with a
 * structured editor — the raw escape hatch has no entry to select, so the
 * request ends once its patch is open.
 */

import { create } from 'zustand'
import type { ItemAuthoringTarget } from './itemAssetFamilies'

type ItemAuthoringHandoffState = {
  /** Target whose patch still has to be opened, or null when idle. */
  pendingTarget: ItemAuthoringTarget | null
  /** Target whose entry the open editor still has to select, or null when idle. */
  pendingEntry: ItemAuthoringTarget | null
  /** Records the target the authoring page should open. */
  requestOpen: (target: ItemAuthoringTarget) => void
  /** Reports the target's patch as open, handing structured targets to the editor. */
  patchOpened: () => void
  /** Reads and clears the entry request, so a later remount does not re-select it. */
  consumePendingEntry: () => ItemAuthoringTarget | null
}

export const useItemAuthoringHandoff = create<ItemAuthoringHandoffState>((set, get) => ({
  pendingTarget: null,
  pendingEntry: null,
  requestOpen: (target) => set({ pendingTarget: target, pendingEntry: null }),
  patchOpened: () => {
    const target = get().pendingTarget
    if (target === null) {
      return
    }
    const selectsEntry = target.editor === 'structured' && target.itemId !== null
    set({ pendingTarget: null, pendingEntry: selectsEntry ? target : null })
  },
  consumePendingEntry: () => {
    const pending = get().pendingEntry
    if (pending !== null) {
      set({ pendingEntry: null })
    }
    return pending
  },
}))
