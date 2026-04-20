import { useState } from 'react'
import { MoreHorizontal, Plus, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'
import type { DraftPatch } from '../../lib/app/useGeneratedProject'

interface PatchListSidebarProps {
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string) => void
  onAddPatch: () => void
  onRemovePatch: (patchId: string) => void
  onTogglePatch: (patchId: string, enabled: boolean) => void
  onEditProperties: (patchId: string) => void
  onOpenConfig: () => void
  onSaveDraft: () => void
  isDirty: boolean
}

export function PatchListSidebar({
  patches,
  activePatchId,
  onSelectPatch,
  onAddPatch,
  onRemovePatch,
  onTogglePatch,
  onEditProperties,
  onOpenConfig,
  onSaveDraft,
  isDirty,
}: PatchListSidebarProps) {
  const [contextMenuPatchId, setContextMenuPatchId] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">
          Patches ({patches.length})
        </span>
        <button
          type="button"
          className="icon-button h-6 w-6"
          onClick={onAddPatch}
          title="Add Patch"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Patch List */}
      <div className="flex-1 overflow-auto py-1">
        {patches.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-[var(--text-secondary)]">
            No patches yet.
            <br />
            Click + to add one.
          </div>
        ) : (
          patches.map((patch) => (
            <div
              key={patch.id}
              className={`
                group relative mx-1.5 mb-1 cursor-pointer rounded-lg border px-2.5 py-2 text-xs transition-all
                ${activePatchId === patch.id
                  ? 'border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-panel))]'
                  : 'border-transparent hover:bg-[var(--bg-panel-muted)]'
                }
                ${!patch.enabled ? 'opacity-50' : ''}
              `}
              onClick={() => onSelectPatch(patch.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenuPatchId(contextMenuPatchId === patch.id ? null : patch.id)
              }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTogglePatch(patch.id, !patch.enabled)
                  }}
                >
                  {patch.enabled ? (
                    <ToggleRight className="h-4 w-4 text-[var(--accent)]" />
                  ) : (
                    <ToggleLeft className="h-4 w-4" />
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-[var(--text-primary)]">
                      {patch.logName}
                    </span>
                    {patch.when && Object.keys(patch.when).length > 0 ? (
                      <span title="Has When conditions"><AlertCircle className="h-3 w-3 shrink-0 text-[var(--accent)]" /></span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-[var(--text-secondary)]">
                    {patch.action} → {patch.target}
                  </div>
                </div>

                <button
                  type="button"
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    setContextMenuPatchId(contextMenuPatchId === patch.id ? null : patch.id)
                  }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                </button>
              </div>

              {/* Context Menu */}
              {contextMenuPatchId === patch.id ? (
                <div className="absolute right-1 top-8 z-50 min-w-[140px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1 shadow-lg">
                  <button
                    type="button"
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditProperties(patch.id)
                      setContextMenuPatchId(null)
                    }}
                  >
                    Edit Properties
                  </button>
                  <button
                    type="button"
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onTogglePatch(patch.id, !patch.enabled)
                      setContextMenuPatchId(null)
                    }}
                  >
                    {patch.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <div className="my-1 h-px bg-[var(--border-color)]" />
                  <button
                    type="button"
                    className="w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-active)]"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemovePatch(patch.id)
                      setContextMenuPatchId(null)
                    }}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-[var(--border-color)] p-2">
        <div className="flex gap-1.5">
          <button
            type="button"
            className="control-button flex-1 text-[10px]"
            onClick={onOpenConfig}
          >
            Config
          </button>
          <button
            type="button"
            className="control-button control-button-primary flex-1 text-[10px]"
            onClick={onSaveDraft}
            disabled={!isDirty}
          >
            {isDirty ? 'Save*' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
