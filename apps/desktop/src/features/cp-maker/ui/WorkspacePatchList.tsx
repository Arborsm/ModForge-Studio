import { useState, type JSX } from 'react'
import { Copy, GripVertical, Pencil, Trash2 } from 'lucide-react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEditorCopy } from '@locales/provider'
import { useEditorModeStore } from '@shared/lib/app-state/editorModeStore'
import { cx } from '@shared/lib/helper'
import type { AssetDraftPort } from '../model/draftPort'
import type { DraftPatch } from '../model/types'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'

export type WorkspacePatchListProps = {
  /** 按导出顺序展示的行（调用方已过滤）。 */
  patches: readonly DraftPatch[]
  draftPort: AssetDraftPort
  /** 传给 reorderPatch 的 within 谓词：覆盖完整草稿中与展示列表相同的子集。 */
  reorderWithin: (patch: DraftPatch) => boolean
  onOpenPatch: (patchId: string) => void
  /** 可选标题；提供后会渲染共享标题头。 */
  title?: string
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

type SortablePatchRowProps = {
  patch: DraftPatch
  rowIndex: number
  draftPort: AssetDraftPort
  onOpenPatch: (patchId: string) => void
  onDelete: (patch: DraftPatch) => void
}

function SortablePatchRow({ patch, rowIndex, draftPort, onOpenPatch, onDelete }: SortablePatchRowProps) {
  const copy = useEditorCopy().studioDesk.patchList
  const actionLabels = useEditorCopy().studioDesk.addPatchDialog.actionLabels
  const expertMode = useEditorModeStore((state) => state.expertMode)
  const title = patch.logName || patch.fromFile || patch.target
  const customTitle = title !== `${patch.action} → ${patch.target}` && title !== patch.target ? title : null
  const whenSummary = patch.when
    ? Object.entries(patch.when)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ')
    : ''
  const priority = patch.priority !== undefined && Number(patch.priority) !== 0 ? String(patch.priority) : null
  const enabled = patch.enabled !== false

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: patch.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <li
      ref={setNodeRef}
      key={patch.id}
      className={cx('workspace-patch-row', !enabled && 'is-disabled', isDragging && 'is-dragging')}
      style={style}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) return
        onOpenPatch(patch.id)
      }}
    >
      <button
        type="button"
        className="workspace-patch-drag"
        aria-label={copy.movePatch(title)}
        title={copy.movePatch(title)}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span className="workspace-patch-order">{rowIndex + 1}</span>
      <span className="asset-editor-badge">{actionLabels[patch.action]}</span>
      <button type="button" className="workspace-patch-copy" aria-label={copy.openPatch(title)} onClick={() => onOpenPatch(patch.id)}>
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
        <button type="button" title={copy.openPatch(title)} aria-label={copy.openPatch(title)} onClick={() => onOpenPatch(patch.id)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" title={copy.duplicate} aria-label={copy.duplicate} onClick={() => draftPort.duplicatePatch(patch.id)}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button type="button" title={copy.delete} aria-label={copy.delete} onClick={() => onDelete(patch)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

/**
 * Shared change list for authoring workspaces: patches in export order — the
 * order Content Patcher applies them — one row per patch with drag-to-reorder,
 * duplicate, enable toggle, and delete.
 */
export function WorkspacePatchList({ patches, draftPort, reorderWithin, onOpenPatch, title }: WorkspacePatchListProps): JSX.Element {
  const copy = useEditorCopy().studioDesk.patchList
  const [deleteTarget, setDeleteTarget] = useState<DraftPatch | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = patches.findIndex((patch) => patch.id === active.id)
    const newIndex = patches.findIndex((patch) => patch.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const delta = newIndex - oldIndex
    const patch = patches[oldIndex]
    if (!patch) return
    if (delta > 0) {
      for (let i = 0; i < delta; i++) {
        draftPort.reorderPatch(patch.id, 1, reorderWithin)
      }
    } else {
      for (let i = 0; i < -delta; i++) {
        draftPort.reorderPatch(patch.id, -1, reorderWithin)
      }
    }
  }

  const list = (
    <div className="workspace-patch-list">
      {patches.length === 0 ? (
        <div className="workspace-patch-list-empty">
          <p>{copy.emptyTitle}</p>
          <p>{copy.emptyHint}</p>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={patches.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ol className="workspace-patch-rows">
              {patches.map((patch, rowIndex) => (
                <SortablePatchRow
                  key={patch.id}
                  patch={patch}
                  rowIndex={rowIndex}
                  draftPort={draftPort}
                  onOpenPatch={onOpenPatch}
                  onDelete={setDeleteTarget}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
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
