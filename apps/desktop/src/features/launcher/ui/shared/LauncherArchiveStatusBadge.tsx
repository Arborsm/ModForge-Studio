import type { ArchiveInstallStatus } from '../../model/archiveInstallPlan'
import { useEditorCopy } from '@locales/provider'

const STATUS_LABEL_KEYS: Record<
  ArchiveInstallStatus,
  'previewStatusNew' | 'previewStatusUpdate' | 'previewStatusReinstall' | 'previewStatusDowngrade'
> = {
  new: 'previewStatusNew',
  update: 'previewStatusUpdate',
  reinstall: 'previewStatusReinstall',
  downgrade: 'previewStatusDowngrade',
}

/** Small pill showing the new/update/reinstall/downgrade install state. */
export function LauncherArchiveStatusBadge({ status }: { status: ArchiveInstallStatus }) {
  const copy = useEditorCopy().launcher
  return (
    <span className="launcher-install-root-badge" data-status={status}>
      {copy.library[STATUS_LABEL_KEYS[status]]}
    </span>
  )
}
