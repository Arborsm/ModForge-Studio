/**
 * @file Full-screen mod-pack management page (Android host). The desktop pack
 * sidebar content renders inside a body-portal page shell: the drawer panel
 * reads as a cramped column on a phone, while a full-screen page matches the
 * mobile shell's other surfaces (settings, downloads, notifications).
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useEditorCopy } from '@locales/provider'
import { MobilePageShell } from '../../ui/mobile/MobilePageShell'
import { LauncherLibraryPackSidebar, type LauncherLibraryPackSidebarProps } from './LauncherLibraryPackSidebar'

type LauncherLibraryPacksPageProps = {
  open: boolean
  onClose: () => void
} & Omit<LauncherLibraryPackSidebarProps, 'drawerOpen' | 'drawerPanelRef'>

/** Full-screen pack management; Escape closes (the Android back key dispatches it). */
export function LauncherLibraryPacksPage({ open, onClose, ...sidebarProps }: LauncherLibraryPacksPageProps) {
  const copy = useEditorCopy().launcher
  // The sidebar uses the ref for desktop drawer measuring only; the page pins it open.
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="mobile-packs-page-root">
      <MobilePageShell title={copy.library.packTitle} onClose={onClose}>
        <div className="mobile-packs-page-body">
          <LauncherLibraryPackSidebar {...sidebarProps} drawerOpen drawerPanelRef={panelRef} />
        </div>
      </MobilePageShell>
    </div>,
    document.body,
  )
}
