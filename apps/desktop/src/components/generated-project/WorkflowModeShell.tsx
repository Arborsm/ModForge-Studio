import { useState, type ReactNode } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import { PatchListSidebar } from './PatchListSidebar'
import { ConfigSchemaDialog } from './ConfigSchemaDialog'
import { AddPatchDialog } from './AddPatchDialog'

interface WorkflowModeShellProps {
  workspaceId: WorkspaceId
  draft: GeneratedProjectDraft | null
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string | null) => void
  onPatchAdd: (action: DraftPatch['action'], target: string) => void
  onPatchRemove: (patchId: string) => void
  onPatchUpdate: (patchId: string, patch: Partial<DraftPatch>) => void
  onConfigSchemaChange: (entries: Array<{ key: string; defaultValue: unknown; allowValues?: unknown[]; description?: string }>) => void
  onSaveDraft: () => void
  isDirty: boolean
  children: ReactNode
}

export function WorkflowModeShell({
  workspaceId,
  draft,
  patches,
  activePatchId,
  onSelectPatch,
  onPatchAdd,
  onPatchRemove,
  onPatchUpdate,
  onConfigSchemaChange,
  onSaveDraft,
  isDirty,
  children,
}: WorkflowModeShellProps) {
  void workspaceId // reserved for future per-workspace layout variations
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [configDialogMode, setConfigDialogMode] = useState<'when' | 'config'>('when')
  const [addPatchDialogOpen, setAddPatchDialogOpen] = useState(false)

  const activePatch = activePatchId ? patches.find((p) => p.id === activePatchId) ?? null : null

  function handleEditWhen(patchId: string) {
    onSelectPatch(patchId)
    setConfigDialogMode('when')
    setConfigDialogOpen(true)
  }

  function handleOpenConfig() {
    setConfigDialogMode('config')
    setConfigDialogOpen(true)
  }

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0">
        <PatchListSidebar
          patches={patches}
          activePatchId={activePatchId}
          onSelectPatch={onSelectPatch}
          onAddPatch={() => setAddPatchDialogOpen(true)}
          onRemovePatch={(id) => {
            onPatchRemove(id)
            if (activePatchId === id) {
              onSelectPatch(null)
            }
          }}
          onTogglePatch={(id, enabled) => onPatchUpdate(id, { enabled })}
          onEditWhen={handleEditWhen}
          onOpenConfig={handleOpenConfig}
          onSaveDraft={onSaveDraft}
          isDirty={isDirty}
        />
      </div>

      <div className="min-w-0 flex-1">
        {children}
      </div>

      {configDialogOpen && draft ? (
        <ConfigSchemaDialog
          open={configDialogOpen}
          mode={configDialogMode}
          patch={activePatch}
          configSchema={draft.configSchema}
          onClose={() => setConfigDialogOpen(false)}
          onPatchWhenChange={(patchId, when) => onPatchUpdate(patchId, { when })}
          onConfigSchemaChange={onConfigSchemaChange}
        />
      ) : null}

      <AddPatchDialog
        open={addPatchDialogOpen}
        onClose={() => setAddPatchDialogOpen(false)}
        onAdd={(action, target) => {
          setAddPatchDialogOpen(false)
          onPatchAdd(action, target)
        }}
      />
    </div>
  )
}
