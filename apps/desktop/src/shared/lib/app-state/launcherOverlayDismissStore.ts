import { create } from 'zustand'

type LauncherOverlayDismissState = {
  dismissEpoch: number
  requestLauncherOverlayDismiss: () => void
}

/**
 * Epoch signal for asking launcher pages to close detail drawers when TopMenuBar opens a global overlay.
 */
export const useLauncherOverlayDismissStore = create<LauncherOverlayDismissState>((set) => ({
  dismissEpoch: 0,
  requestLauncherOverlayDismiss: () => set((state) => ({ dismissEpoch: state.dismissEpoch + 1 })),
}))
