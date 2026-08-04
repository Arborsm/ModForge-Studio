import { FolderArchive, MousePointerClick } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'

type LauncherLibraryArchiveDropZoneProps = {
  /** True while the user drags supported archive files over the window. */
  active: boolean
  /** Human-readable list of supported archive suffixes (for example ".zip, .7z"). */
  formatsLabel: string
  /** Opens the archive file picker; shares the header "Install Archive" flow. */
  onChooseArchives: () => void
}

/**
 * Always-visible archive install entry for the launcher library.
 *
 * Renders as a button so keyboard and mouse users can reach the archive file
 * picker, and doubles as the active drop-target indicator while an OS archive
 * drag hovers the window (the window-level drag events may drop anywhere, so
 * the highlight is the single consistent feedback surface).
 */
export function LauncherLibraryArchiveDropZone({ active, formatsLabel, onChooseArchives }: LauncherLibraryArchiveDropZoneProps) {
  const copy = useEditorCopy().launcher
  return (
    <button
      type="button"
      className={cx('launcher-library-drop-zone', active && 'launcher-library-drop-zone-active')}
      onClick={onChooseArchives}
      data-testid="launcher-library-archive-drop-zone"
    >
      <span className="launcher-library-drop-zone-icon" aria-hidden="true">
        <FolderArchive className="h-4 w-4" />
      </span>
      <span className="launcher-library-drop-zone-copy">
        <strong role="status">{active ? copy.library.dragDropInstallTitle : copy.library.dragDropZoneTitle}</strong>
        <span>{copy.library.dragDropInstallSubtitle(formatsLabel)}</span>
      </span>
      <span className="launcher-library-drop-zone-browse" aria-hidden="true">
        <MousePointerClick className="h-3 w-3" />
        <span>{copy.library.dragDropZoneBrowseHint}</span>
      </span>
    </button>
  )
}
