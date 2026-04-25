import {
  AlertCircle,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Trash2,
} from 'lucide-react'
import type { DraftPatch } from '../../lib/app/useGeneratedProject'
import { cx } from '../../lib/cx'
import { useEditorCopy } from '../../lib/app/localeContext'
import { PatchActionIcon } from './PatchActionIcon'
import { getPatchActionColor } from './patchActionColor'

type PatchSummaryCardProps = {
  patch: DraftPatch
  active?: boolean
  compact?: boolean
  onSelect?: () => void
  onEdit?: () => void
  onToggle?: (enabled: boolean) => void
  onRemove?: () => void
}

export function PatchSummaryCard({
  patch,
  active,
  compact,
  onSelect,
  onEdit,
  onToggle,
  onRemove,
}: PatchSummaryCardProps) {
  const catalog = useEditorCopy().studioDesk.patchCatalog
  const hasWhen = Boolean(patch.when && Object.keys(patch.when).length > 0)
  const buttonLabel = `${patch.logName || patch.target} ${patch.action} ${patch.target}`

  return (
    <article className={cx('edit-patch-card', active && 'edit-patch-card-active', !patch.enabled && 'edit-patch-card-disabled', compact && 'edit-patch-card-compact')}>
      <button
        type="button"
        className="edit-patch-card-main"
        onClick={onSelect}
        onDoubleClick={onEdit}
        aria-label={buttonLabel}
      >
        <span className={cx('edit-patch-card-icon', getPatchActionColor(patch.action))}>
          <PatchActionIcon action={patch.action} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="edit-patch-card-title-row">
            <span className="edit-patch-card-title">{patch.logName || patch.target}</span>
            {hasWhen ? <AlertCircle className="h-3 w-3 shrink-0 text-[var(--accent)]" /> : null}
          </span>
          <span className="edit-patch-card-meta">
            <span>{patch.action}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="truncate">{patch.target}</span>
          </span>
          {!compact && patch.fromFile ? (
            <span className="edit-patch-card-path">{patch.fromFile}</span>
          ) : null}
        </span>
        <span className="edit-patch-card-status">
          {patch.enabled ? catalog.enabled : catalog.disabled}
        </span>
      </button>

      <div className="edit-patch-card-actions">
        {onToggle ? (
          <button
            type="button"
            className="icon-button h-7 w-7"
            onClick={() => onToggle(!patch.enabled)}
            title={patch.enabled ? catalog.disablePatch : catalog.enablePatch}
            aria-label={patch.enabled ? catalog.disablePatch : catalog.enablePatch}
          >
            {patch.enabled ? <ToggleRight className="h-4 w-4 text-[var(--accent)]" /> : <ToggleLeft className="h-4 w-4" />}
          </button>
        ) : null}
        {onEdit ? (
          <button type="button" className="icon-button h-7 w-7" onClick={onEdit} title={catalog.editPatch} aria-label={catalog.editPatch}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" className="icon-button h-7 w-7 text-red-400" onClick={onRemove} title={catalog.deleteAction} aria-label={catalog.deleteAction}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <MoreHorizontal className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
        )}
      </div>
    </article>
  )
}
