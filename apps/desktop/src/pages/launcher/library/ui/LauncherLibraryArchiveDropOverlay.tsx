import { FolderArchive } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'

type LauncherLibraryArchiveDropOverlayProps = {
  /** Human-readable list of supported archive suffixes (for example ".zip, .7z"). */
  formatsLabel: string
}

/**
 * Full-library overlay shown while the user drags supported archive files over the mod library.
 *
 * The webview native drag-drop listener (not DOM events) owns the actual drop logic;
 * this layer is purely visual feedback and is rendered with pointer-events disabled
 * so it does not intercept mouse or keyboard interactions.
 */
export function LauncherLibraryArchiveDropOverlay({ formatsLabel }: LauncherLibraryArchiveDropOverlayProps) {
  const copy = useEditorCopy().launcher
  return (
    <div
      className="launcher-library-archive-drop-overlay"
      data-testid="launcher-library-archive-drop-overlay"
      role="status"
      aria-live="polite"
    >
      <div className="launcher-library-archive-drop-overlay-content">
        <span className="launcher-library-archive-drop-overlay-icon" aria-hidden="true">
          <FolderArchive className="h-6 w-6" />
        </span>
        <span className="launcher-library-archive-drop-overlay-copy">
          <strong>{copy.library.dragDropInstallTitle}</strong>
          <span>{copy.library.dragDropInstallSubtitle(formatsLabel)}</span>
        </span>
      </div>
    </div>
  )
}
