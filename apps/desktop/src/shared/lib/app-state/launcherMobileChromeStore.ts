/**
 * @file Android launcher top-bar chrome slot: the active launcher page injects
 * its leading top-bar content (page-semantic search field or page title)
 * without lifting page-local state up into the shell or the top menu bar.
 */
import { useEffect, type ReactNode } from 'react'
import { create } from 'zustand'

type LauncherMobileChromeState = {
  /** Leading top-bar content supplied by the active launcher page; null while none is offered. */
  leading: ReactNode | null
  setLeading: (leading: ReactNode | null) => void
}

export const useLauncherMobileChromeStore = create<LauncherMobileChromeState>((set) => ({
  leading: null,
  setLeading: (leading) => set({ leading }),
}))

/**
 * Publishes top-bar leading content while `active` is true and clears it on
 * deactivate/unmount. Cached launcher routes stay mounted while hidden, so
 * callers must gate this with their route-active flag to avoid two pages
 * fighting over the slot.
 */
export function useLauncherMobileTopLeading(leading: ReactNode, active: boolean) {
  const setLeading = useLauncherMobileChromeStore((state) => state.setLeading)
  useEffect(() => {
    if (!active) {
      return
    }
    setLeading(leading)
    return () => setLeading(null)
  })
}
