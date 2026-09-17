/**
 * @file Mobile launcher utility page stack: downloads / notifications open as
 * full-screen pages on the Android host instead of titlebar float panels.
 */

import { create } from 'zustand'

export type MobileLauncherPage = 'downloads' | 'notifications' | 'logs'

type MobilePageState = {
  page: MobileLauncherPage | null
  openPage: (page: MobileLauncherPage) => void
  closePage: () => void
}

/** Single-level page stack; the Android back key pops it (Phase 6 wiring). */
export const useMobilePageStore = create<MobilePageState>((set) => ({
  page: null,
  openPage: (page) => set({ page }),
  closePage: () => set({ page: null }),
}))
