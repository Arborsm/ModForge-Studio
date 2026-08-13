/**
 * "Open in building authoring" handoff.
 *
 * The codex page and the authoring page are separate workbench modules and must
 * not import each other, so the building key travels through this shared
 * entity-level store instead: the codex requests, the workbench navigates, and
 * the authoring editor consumes the request once on mount.
 */

import { create } from 'zustand'

type BuildingAuthoringHandoffState = {
  /** Building key the codex asked the authoring page to open, or null when idle. */
  pendingBuildingKey: string | null
  /** Records the building key the authoring page should select when it opens. */
  requestOpen: (buildingKey: string) => void
  /** Reads and clears the pending key, so a later mount does not re-select it. */
  consumePending: () => string | null
}

export const useBuildingAuthoringHandoff = create<BuildingAuthoringHandoffState>((set, get) => ({
  pendingBuildingKey: null,
  requestOpen: (buildingKey) => set({ pendingBuildingKey: buildingKey.trim() || null }),
  consumePending: () => {
    const pending = get().pendingBuildingKey
    if (pending !== null) {
      set({ pendingBuildingKey: null })
    }
    return pending
  },
}))
