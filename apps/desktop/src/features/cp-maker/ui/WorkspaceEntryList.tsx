import { useState, type JSX } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

export type WorkspaceEntryRow = {
  /** Stable entry key, used as React key and passed back to handlers. */
  key: string
  /** Author-facing name shown in the row; falls back to `key` when absent. */
  displayName: string
  /** Optional badge tone + label (override/new/etc.). */
  badge?: { tone: 'ok' | 'warn' | 'muted'; label: string }
  /** Whether the entry is currently exported; false parks it in disabledEntries. */
  enabled: boolean
}

export type WorkspaceEntryListProps = {
  /** Entries in authoring order (enabled first, then disabled). */
  rows: readonly WorkspaceEntryRow[]
  onOpen: (key: string) => void
  onDelete: (key: string) => void
  onToggleEnabled: (key: string, next: boolean) => void
  /** Optional header label; omit to render frameless. */
  title?: string
}

/**
 * Entry-level change manager for asset workspaces (characters / buildings /
 * items). Mirrors the visual language of `WorkspacePatchList` — one row per
 * edited entry with open / enable-toggle / delete — but without drag reorder:
 * `editorState.entries` is a key-indexed dict whose order Content Patcher does
 * not apply in any meaningful sequence, so reordering is not exposed.
 */
export function WorkspaceEntryList({ rows, onOpen, onDelete, onToggleEnabled, title }: WorkspaceEntryListProps): JSX.Element {
  const copy = useEditorCopy().studioDesk.entryList
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceEntryRow | null>(null)

  const list = (
    <div className="workspace-patch-list">
      {rows.length === 0 ? (
        <div className="workspace-patch-list-empty">
          <p>{copy.emptyTitle}</p>
          <p>{copy.emptyHint}</p>
        </div>
      ) : (
        <ol className="workspace-patch-rows">
          {rows.map((row, rowIndex) => {
            const enabled = row.enabled
            const name = row.displayName || row.key
            return (
              <li key={row.key} className={cx('workspace-patch-row', !enabled && 'is-disabled')} onDoubleClick={() => onOpen(row.key)}>
                <span className="workspace-patch-order">{rowIndex + 1}</span>
                {row.badge ? (
                  <span className={cx('asset-editor-badge', row.badge.tone === 'warn' && 'is-warn', row.badge.tone === 'ok' && 'is-ok')}>
                    {row.badge.label}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="workspace-patch-copy"
                  aria-label={copy.openEntry(name)}
                  onDoubleClick={() => onOpen(row.key)}
                >
                  <strong>{name}</strong>
                  <span className="workspace-patch-details">
                    <span className="workspace-patch-detail">{row.key}</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={enabled ? copy.toggleDisable(name) : copy.toggleEnable(name)}
                  className={cx('workspace-patch-toggle', enabled && 'is-on')}
                  onClick={() => onToggleEnabled(row.key, !enabled)}
                />
                <div className="workspace-patch-row-actions">
                  <button type="button" title={copy.openEntry(name)} aria-label={copy.openEntry(name)} onClick={() => onOpen(row.key)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" title={copy.delete} aria-label={copy.delete} onClick={() => setDeleteTarget(row)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        title={copy.deleteTitle}
        message={deleteTarget ? copy.deleteMessage(deleteTarget.displayName || deleteTarget.key) : ''}
        cancelLabel={copy.cancel}
        confirmLabel={copy.confirmDelete}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget.key)
        }}
      />
    </div>
  )

  return title ? (
    <div className="workspace-patch-list-frame">
      <header className="workspace-patch-list-header">
        <p className="panel-title">{title}</p>
      </header>
      {list}
    </div>
  ) : (
    list
  )
}
