import { create } from 'zustand'

/**
 * Transient request to open one project map asset in the map workspace editor.
 *
 * The asset library cannot reach into the map workspace's local session state,
 * so it stages the target here and then navigates to the map module. The map
 * authoring runtime consumes the value once its draft port is ready and clears
 * it, so a stale request never fires on a later visit.
 */
type PendingMapAssetEditState = {
  relativePath: string | null
  requestEdit: (relativePath: string) => void
  consumeEdit: () => string | null
}

export const usePendingMapAssetEditStore = create<PendingMapAssetEditState>((set, get) => ({
  relativePath: null,
  requestEdit: (relativePath) => set({ relativePath }),
  consumeEdit: () => {
    const { relativePath } = get()
    if (relativePath !== null) set({ relativePath: null })
    return relativePath
  },
}))
