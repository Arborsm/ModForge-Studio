import { useState, type JSX, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { cx } from '@shared/lib/helper'
import type { AssetDraftPort } from '../model/draftPort'
import type { DraftPatch } from '../model/types'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { PatchActionIcon } from './PatchActionIcon'

export type WorkspacePatchListProps = {
  /** 按导出顺序展示的行（调用方已过滤）。 */
  patches: readonly DraftPatch[]
  draftPort: AssetDraftPort
  /** 传给 reorderPatch 的 within 谓词：覆盖完整草稿中与展示列表相同的子集。 */
  reorderWithin: (patch: DraftPatch) => boolean
  onOpenPatch: (patchId: string) => void
  /** 可选行缩略图；缺省用 action 类型图标。 */
  renderThumbnail?: (patch: DraftPatch) => ReactNode
}

/**
 * Row enable switch with a token-aware third state. When `enabled` is a token
 * expression, the switch shows the expression instead of a boolean and clicking
 * never overwrites it; converting to a fixed value is an explicit action.
 */
function WorkspacePatchEnabledToggle({ patch, draftPort, title }: { patch: DraftPatch; draftPort: AssetDraftPort; title: string }) {
  const copy = useEditorCopy().studioDesk.patchList
  const [menuOpen, setMenuOpen] = useState(false)
  if (typeof patch.enabled === 'string') {
    return (
      <span className="workspace-patch-enabled-expression">
        <button
          type="button"
          className="workspace-patch-toggle workspace-patch-toggle-expression"
          title={copy.enabledByExpression}
          aria-label={copy.enabledByExpression}
          onClick={() => setMenuOpen((value) => !value)}
        >
          {patch.enabled}
        </button>
        {menuOpen ? (
          <span className="workspace-patch-toggle-menu">
            <button
              type="button"
              onClick={() => {
                draftPort.updatePatch(patch.id, { enabled: true })
                setMenuOpen(false)
              }}
            >
              {copy.setAlwaysEnabled}
            </button>
            <button
              type="button"
              onClick={() => {
                draftPort.updatePatch(patch.id, { enabled: false })
                setMenuOpen(false)
              }}
            >
              {copy.setAlwaysDisabled}
            </button>
          </span>
        ) : null}
      </span>
    )
  }
  const enabled = patch.enabled !== false
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={enabled ? copy.toggleDisable(title) : copy.toggleEnable(title)}
      className={cx('workspace-patch-toggle', enabled && 'is-on')}
      onClick={() => draftPort.updatePatch(patch.id, { enabled: !enabled })}
    />
  )
}

/**
 * Shared change list for authoring workspaces: patches in export order — the
 * order Content Patcher applies them — one row per patch with reorder,
 * duplicate, enable toggle, and delete. A move swaps with the adjacent managed
 * patch via `reorderWithin`, which must match the rendered subset against the
 * full draft so every click visibly moves the row.
 */
export function WorkspacePatchList({
  patches,
  draftPort,
  reorderWithin,
  onOpenPatch,
  renderThumbnail,
}: WorkspacePatchListProps): JSX.Element {
  const copy = useEditorCopy().studioDesk.patchList
  const actionLabels = useEditorCopy().studioDesk.addPatchDialog.actionLabels
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const [deleteTarget, setDeleteTarget] = useState<DraftPatch | null>(null)

  return (
    <div className="workspace-patch-list">
      <ol className="workspace-patch-rows">
        {patches.map((patch, rowIndex) => {
          const title = patch.logName || patch.fromFile || patch.target
          // Auto-generated log names just restate action + target; only show
          // the title line when the author renamed the patch.
          const customTitle = title !== `${patch.action} → ${patch.target}` && title !== patch.target ? title : null
          const enabled = patch.enabled !== false
          const whenSummary = patch.when
            ? Object.entries(patch.when)
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(', ')
            : ''
          const priority = patch.priority !== undefined && Number(patch.priority) !== 0 ? String(patch.priority) : null
          const canMoveUp = rowIndex > 0
          const canMoveDown = rowIndex < patches.length - 1
          return (
            <li key={patch.id} className={cx('workspace-patch-row', !enabled && 'is-disabled')}>
              {renderThumbnail ? (
                renderThumbnail(patch)
              ) : (
                <span className="workspace-patch-thumb" aria-hidden="true">
                  <PatchActionIcon action={patch.action} />
                </span>
              )}
              <span className="workspace-patch-order">{rowIndex + 1}</span>
              <span className="asset-editor-badge">{actionLabels[patch.action]}</span>
              <button
                type="button"
                className="workspace-patch-copy"
                aria-label={copy.openPatch(title)}
                onClick={() => onOpenPatch(patch.id)}
              >
                <strong>{patch.target}</strong>
                <span className="workspace-patch-details">
                  {customTitle ? <span className="workspace-patch-detail">{customTitle}</span> : null}
                  {patch.fromFile && patch.fromFile !== title ? (
                    <span className="workspace-patch-detail">
                      {copy.fromFile}: {patch.fromFile}
                    </span>
                  ) : null}
                  {whenSummary ? (
                    <span className="workspace-patch-detail">
                      {copy.when}: {whenSummary}
                    </span>
                  ) : null}
                  {expertMode && priority !== null ? (
                    <span className="workspace-patch-detail">
                      {copy.priority}: {priority}
                    </span>
                  ) : null}
                </span>
              </button>
              <WorkspacePatchEnabledToggle patch={patch} draftPort={draftPort} title={title} />
              <div className="workspace-patch-row-actions">
                <button
                  type="button"
                  disabled={!canMoveUp}
                  title={copy.moveUp}
                  aria-label={copy.moveUp}
                  onClick={() => draftPort.reorderPatch(patch.id, -1, reorderWithin)}
                >
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!canMoveDown}
                  title={copy.moveDown}
                  aria-label={copy.moveDown}
                  onClick={() => draftPort.reorderPatch(patch.id, 1, reorderWithin)}
                >
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" title={copy.duplicate} aria-label={copy.duplicate} onClick={() => draftPort.duplicatePatch(patch.id)}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button type="button" title={copy.delete} aria-label={copy.delete} onClick={() => setDeleteTarget(patch)}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <DeleteConfirmDialog
        open={deleteTarget !== null}
        title={copy.deleteTitle}
        message={deleteTarget ? copy.deleteMessage(deleteTarget.logName || deleteTarget.fromFile || deleteTarget.target) : ''}
        cancelLabel={copy.cancel}
        confirmLabel={copy.confirmDelete}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) draftPort.removePatch(deleteTarget.id)
        }}
      />
    </div>
  )
}
