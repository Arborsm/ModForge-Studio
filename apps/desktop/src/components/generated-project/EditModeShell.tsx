// components/generated-project/EditModeShell.tsx
// Edit 模式总壳层：Header + Patch catalog / full-page editor route

import { useEffect, useState } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { GameDirectoryInfo } from '../../lib/desktop'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { AddPatchDialog } from './AddPatchDialog'
import { ConfigSchemaDialog } from './ConfigSchemaDialog'
import { EditModeToolbar } from './EditModeToolbar'
import { PatchListPage } from './PatchListPage'
import { EditorPage } from './EditorPage'

interface EditModeShellProps {
  workspaceId: WorkspaceId
  draft: GeneratedProjectDraft | null
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string | null) => void
  onPatchAdd: (action: DraftPatch['action'], target: string, fromFile?: string) => void
  onPatchRemove: (patchId: string) => void
  onPatchUpdate: (patchId: string, patch: Partial<DraftPatch>) => void
  onConfigSchemaChange: (entries: Array<{ key: string; defaultValue: unknown; allowValues?: string; description?: string }>) => void
  onSaveDraft: () => void
  isDirty: boolean
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  gameRootPath?: string | null
  directoryInfo?: GameDirectoryInfo | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

export function EditModeShell({
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
  gameRootPath,
  directoryInfo,
  locale,
  theme,
  accentColor,
  viewportLabels,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onAddVirtualAsset,
  onRemoveVirtualAsset,
}: EditModeShellProps) {
  const activePatch = activePatchId ? patches.find((p) => p.id === activePatchId) ?? null : null
  const [editorViewMode, setEditorViewMode] = useState<'editor' | 'reference'>('editor')
  const [addPatchDialogOpen, setAddPatchDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const showReference = Boolean(gameRootPath && directoryInfo && locale && theme)
  const activeEditorViewMode = showReference ? editorViewMode : 'editor'

  function handleSelectPatch(patchId: string | null) {
    onSelectPatch(patchId)
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        onSaveDraft()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSaveDraft])

  return (
    <div className="edit-mode-shell">
      <EditModeToolbar
        workspaceId={workspaceId}
        patches={patches}
        activePatchId={activePatchId}
        activePatch={activePatch}
        viewMode={activeEditorViewMode}
        showReference={showReference}
        isDirty={isDirty}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={onGoBack}
        onGoForward={onGoForward}
        onSelectPatch={handleSelectPatch}
        onViewModeChange={setEditorViewMode}
        onAddPatch={() => {
          setAddPatchDialogOpen(true)
        }}
        onOpenConfig={() => setConfigDialogOpen(true)}
        onSaveDraft={onSaveDraft}
      />

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {activePatchId === null ? (
          <PatchListPage
            patches={patches}
            onEditPatch={handleSelectPatch}
            onAddPatchRequest={() => setAddPatchDialogOpen(true)}
            onRemovePatch={onPatchRemove}
            onTogglePatch={(id, enabled) => onPatchUpdate(id, { enabled })}
            workspaceId={workspaceId}
            draft={draft}
            isDirty={isDirty}
          />
        ) : (
          <EditorPage
            workspaceId={workspaceId}
            patch={activePatch}
            draft={draft}
            onPatchChange={onPatchUpdate}
            onAddVirtualAsset={onAddVirtualAsset}
            onRemoveVirtualAsset={onRemoveVirtualAsset}
            locale={locale}
            theme={theme}
            accentColor={accentColor}
            viewportLabels={viewportLabels}
            gameRootPath={gameRootPath ?? null}
            directoryInfo={directoryInfo ?? null}
            viewMode={activeEditorViewMode}
          />
        )}
      </div>

      {configDialogOpen && draft ? (
        <ConfigSchemaDialog
          open={configDialogOpen}
          mode="config"
          patch={activePatch}
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
          onPatchAdd(action, target, fromFile)
        }}
      />
    </div>
  )
}
