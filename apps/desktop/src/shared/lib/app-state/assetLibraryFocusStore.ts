import { create } from 'zustand'

/**
 * Transient request to select one item when the asset library module mounts.
 *
 * Cross-module jumps (the map workspace's "manage in asset library" links)
 * cannot reach into the asset library's local state, so they stage the target
 * here and then navigate. The asset library consumes the value once on mount
 * and clears it, so a stale focus never fires on a later visit.
 */
export type AssetLibraryFocus = { kind: 'asset'; key: string } | { kind: 'load-binding'; key: string }

type AssetLibraryFocusState = {
  focus: AssetLibraryFocus | null
  setFocus: (focus: AssetLibraryFocus | null) => void
  consumeFocus: () => AssetLibraryFocus | null
}

export const useAssetLibraryFocusStore = create<AssetLibraryFocusState>((set, get) => ({
  focus: null,
  setFocus: (focus) => set({ focus }),
  consumeFocus: () => {
    const { focus } = get()
    if (focus !== null) set({ focus: null })
    return focus
  },
}))
