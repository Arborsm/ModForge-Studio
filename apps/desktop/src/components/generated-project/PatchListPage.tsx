// components/generated-project/PatchListPage.tsx
// Patch 列表页：左侧列表 + 右侧预览/操作

import { useState, useRef, useEffect } from 'react'
import {
  Plus, ToggleLeft, ToggleRight, AlertCircle, MoreHorizontal,
  Pencil, Trash2, FileCode, Database, Image, MapPin,
  ChevronRight, Settings, Save,
} from 'lucide-react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import { ConfigSchemaDialog } from './ConfigSchemaDialog'
import { AddPatchDialog } from './AddPatchDialog'

interface PatchListPageProps {
  patches: DraftPatch[]
  onEditPatch: (patchId: string) => void
  onAddPatch: (action: DraftPatch['action'], target: string, fromFile?: string) => void
  onRemovePatch: (patchId: string) => void
  onTogglePatch: (patchId: string, enabled: boolean) => void
  onSaveDraft: () => void
  isDirty: boolean
  workspaceId: WorkspaceId
  draft: GeneratedProjectDraft | null
  onConfigSchemaChange: (entries: Array<{ key: string; defaultValue: unknown; allowValues?: string; description?: string }>) => void
  onPatchUpdate: (patchId: string, patch: Partial<DraftPatch>) => void
}

function getPatchIcon(action: string) {
  switch (action) {
    case 'EditData': return <Database className="h-3.5 w-3.5" />
    case 'EditImage': return <Image className="h-3.5 w-3.5" />
    case 'EditMap': return <MapPin className="h-3.5 w-3.5" />
    case 'Load': return <FileCode className="h-3.5 w-3.5" />
    default: return <FileCode className="h-3.5 w-3.5" />
  }
}

function getPatchActionColor(action: string): string {
  switch (action) {
    case 'EditData': return 'text-blue-400'
    case 'EditImage': return 'text-purple-400'
    case 'EditMap': return 'text-green-400'
    case 'Load': return 'text-orange-400'
    default: return 'text-[var(--text-secondary)]'
  }
}

export function PatchListPage({
  patches,
  onEditPatch,
  onAddPatch,
  onRemovePatch,
  onTogglePatch,
  onSaveDraft,
  isDirty,
  workspaceId,
  draft,
  onConfigSchemaChange,
  onPatchUpdate,
}: PatchListPageProps) {
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(null)
  const [contextMenuPatchId, setContextMenuPatchId] = useState<string | null>(null)
  const [addPatchDialogOpen, setAddPatchDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const selectedPatch = selectedPatchId ? patches.find((p) => p.id === selectedPatchId) ?? null : null

  useEffect(() => {
    if (!contextMenuPatchId) return
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenuPatchId(null)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [contextMenuPatchId])

  return (
    <div className="flex h-full">
      {/* Left: Patch List */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        {/* List Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Patches ({patches.length})
          </span>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
            onClick={() => setAddPatchDialogOpen(true)}
            title="Add Patch"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Patch Cards */}
        <div className="flex-1 overflow-auto p-1.5">
          {patches.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <FileCode className="h-8 w-8 text-[var(--text-secondary)] opacity-30" />
              <p className="text-xs text-[var(--text-secondary)]">No patches yet.</p>
              <button
                type="button"
                className="control-button control-button-primary text-xs"
                onClick={() => setAddPatchDialogOpen(true)}
              >
                Add Patch
              </button>
            </div>
          ) : (
            patches.map((patch) => (
              <div
                key={patch.id}
                className={`
                  group relative mb-1 cursor-pointer rounded-lg border px-3 py-2.5 text-xs transition-all
                  ${selectedPatchId === patch.id
                    ? 'border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-panel))]'
                    : 'border-transparent hover:bg-[var(--bg-panel-muted)]'
                  }
                  ${!patch.enabled ? 'opacity-50' : ''}
                `}
                onClick={() => setSelectedPatchId(patch.id)}
                onDoubleClick={() => onEditPatch(patch.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenuPatchId(contextMenuPatchId === patch.id ? null : patch.id)
                }}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
                      <span className={getPatchActionColor(patch.action)}>
                        {getPatchIcon(patch.action)}
                      </span>
                      <span className="truncate font-medium text-[var(--text-primary)]">
                        {patch.logName}
                      </span>
                      {patch.when && Object.keys(patch.when).length > 0 ? (
                        <span title="Has When conditions">
                          <AlertCircle className="h-3 w-3 shrink-0 text-[var(--accent)]" />
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-[10px] text-[var(--text-secondary)]">
                      <span className="font-medium">{patch.action}</span>
                      <ChevronRight className="mx-0.5 inline h-2.5 w-2.5" />
                      {patch.target}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100"
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
                  <div ref={menuRef} className="absolute right-2 top-9 z-50 min-w-[140px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1 shadow-lg">
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditPatch(patch.id)
                        setContextMenuPatchId(null)
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onTogglePatch(patch.id, !patch.enabled)
                        setContextMenuPatchId(null)
                      }}
                    >
                      {patch.enabled ? (
                        <><ToggleLeft className="h-3 w-3" /> Disable</>
                      ) : (
                        <><ToggleRight className="h-3 w-3" /> Enable</>
                      )}
                    </button>
                    <div className="my-1 h-px bg-[var(--border-color)]" />
                    <button
                      type="button"
                      className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-active)]"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemovePatch(patch.id)
                        if (selectedPatchId === patch.id) setSelectedPatchId(null)
                        setContextMenuPatchId(null)
                      }}
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1.5 border-t border-[var(--border-color)] p-2">
          <button
            type="button"
            className="control-button flex items-center gap-1 text-[10px]"
            onClick={() => setConfigDialogOpen(true)}
          >
            <Settings className="h-3 w-3" /> Config
          </button>
          <button
            type="button"
            className="control-button control-button-primary flex flex-1 items-center justify-center gap-1 text-[10px]"
            onClick={onSaveDraft}
            disabled={!isDirty}
          >
            <Save className="h-3 w-3" />
            {isDirty ? 'Save*' : 'Save'}
          </button>
        </div>
      </div>

      {/* Right: Preview / Detail */}
      <div className="flex min-w-0 flex-1 flex-col bg-[var(--bg-app)]">
        {selectedPatch ? (
          <div className="flex h-full flex-col">
            {/* Detail Header */}
            <div className="flex items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-5 py-3">
              <span className={getPatchActionColor(selectedPatch.action)}>
                {getPatchIcon(selectedPatch.action)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {selectedPatch.logName}
                </div>
                <div className="text-[11px] text-[var(--text-secondary)]">
                  {selectedPatch.action} → {selectedPatch.target}
                </div>
              </div>
              <button
                type="button"
                className="control-button control-button-primary flex items-center gap-1.5 text-xs"
                onClick={() => onEditPatch(selectedPatch.id)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Patch
              </button>
            </div>

            {/* Detail Body */}
            <div className="flex-1 overflow-auto p-5">
              <div className="mx-auto max-w-xl space-y-4">
                {/* Status */}
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Status
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-flex h-2 w-2 rounded-full ${selectedPatch.enabled ? 'bg-green-400' : 'bg-gray-400'}`} />
                    <span className="text-[var(--text-primary)]">
                      {selectedPatch.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {/* Properties */}
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Properties
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Action</span>
                      <span className="font-medium text-[var(--text-primary)]">{selectedPatch.action}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-secondary)]">Target</span>
                      <span className="font-mono text-[var(--text-primary)]">{selectedPatch.target}</span>
                    </div>
                    {selectedPatch.targetField && selectedPatch.targetField.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Target Field</span>
                        <span className="font-mono text-[var(--text-primary)]">{selectedPatch.targetField.join(' / ')}</span>
                      </div>
                    )}
                    {selectedPatch.when && Object.keys(selectedPatch.when).length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">When Conditions</span>
                        <span className="text-[var(--accent)]">{Object.keys(selectedPatch.when).length} condition(s)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editor State Summary */}
                {(() => {
                  const state = selectedPatch.editorState as Record<string, unknown> | null | undefined
                  if (!state) return null
                  return (
                    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Editor Data
                      </div>
                      <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                        {!!state.entries && (
                          <div>
                            Entries: <span className="text-[var(--text-primary)]">{Object.keys(state.entries as Record<string, unknown>).length}</span>
                          </div>
                        )}
                        {!!state.fields && (
                          <div>
                            Fields: <span className="text-[var(--text-primary)]">{Object.keys(state.fields as Record<string, unknown>).length}</span>
                          </div>
                        )}
                        {!!state.textOperations && (
                          <div>
                            Text Operations: <span className="text-[var(--text-primary)]">{(state.textOperations as unknown[]).length}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-secondary)]">
            <FileCode className="h-12 w-12 opacity-20" />
            <p className="text-sm">Select a patch to preview details</p>
            <p className="max-w-xs text-center text-xs opacity-60">
              Click a patch in the list to see its properties, or double-click to open the editor directly.
            </p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {configDialogOpen && draft ? (
        <ConfigSchemaDialog
          open={configDialogOpen}
          mode="config"
          patch={selectedPatch}
          configSchema={draft.configSchema}
          onClose={() => setConfigDialogOpen(false)}
          onPatchPropertiesChange={(patchId, props) => onPatchUpdate(patchId, props)}
          onConfigSchemaChange={onConfigSchemaChange}
        />
      ) : null}

      <AddPatchDialog
        open={addPatchDialogOpen}
        workspaceId={workspaceId}
        onClose={() => setAddPatchDialogOpen(false)}
        onAdd={(action, target, fromFile) => {
          setAddPatchDialogOpen(false)
          onAddPatch(action, target, fromFile)
        }}
      />
    </div>
  )
}
