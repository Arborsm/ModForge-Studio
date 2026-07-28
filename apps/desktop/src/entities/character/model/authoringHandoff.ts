/**
 * "Open in character authoring" handoff.
 *
 * The browser page and the authoring page are separate workbench modules and
 * must not import each other, so the NPC key travels through this shared
 * entity-level store instead: the browser requests, the workbench navigates,
 * and the authoring editor consumes the request once on mount.
 */

import { create } from 'zustand'

type CharacterAuthoringHandoffState = {
  /** NPC key the browser asked the authoring page to open, or null when idle. */
  pendingNpcKey: string | null
  /** Records the NPC key the authoring page should select when it opens. */
  requestOpen: (npcKey: string) => void
  /** Reads and clears the pending key, so a later mount does not re-select it. */
  consumePending: () => string | null
}

export const useCharacterAuthoringHandoff = create<CharacterAuthoringHandoffState>((set, get) => ({
  pendingNpcKey: null,
  requestOpen: (npcKey) => set({ pendingNpcKey: npcKey.trim() || null }),
  consumePending: () => {
    const pending = get().pendingNpcKey
    if (pending !== null) {
      set({ pendingNpcKey: null })
    }
    return pending
  },
}))
