import { useState, type ReactNode } from 'react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import type { GameDirectoryInfo } from '../../lib/desktop'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { PatchListSidebar } from './PatchListSidebar'
import { ConfigSchemaDialog } from './ConfigSchemaDialog'
import { AddPatchDialog } from './AddPatchDialog'
import { PreviewModeShell } from './PreviewModeShell'

interface WorkflowModeShellProps {
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
  children: ReactNode
  gameRootPath?: string | null
  directoryInfo?: GameDirectoryInfo | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
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
  gameRootPath,
  directoryInfo,
  locale,
  theme,
  accentColor,
  viewportLabels,
}: WorkflowModeShellProps) {
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [configDialogMode, setConfigDialogMode] = useState<'properties' | 'config'>('properties')
  const [addPatchDialogOpen, setAddPatchDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'editor' | 'reference'>('editor')

  const activePatch = activePatchId ? patches.find((p) => p.id === activePatchId) ?? null : null
  const showReferenceTab = Boolean(gameRootPath && directoryInfo && locale && theme)

  function handleEditProperties(patchId: string) {
    onSelectPatch(patchId)
    setConfigDialogMode('properties')
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
          onEditProperties={handleEditProperties}
          onOpenConfig={handleOpenConfig}
          onSaveDraft={onSaveDraft}
          isDirty={isDirty}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {showReferenceTab ? (
          <div className="flex items-center gap-0.5 border-b border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-1"
          >
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'editor'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('editor')}
            >
              Editor
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                activeTab === 'reference'
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setActiveTab('reference')}
            >
              Reference
            </button>
          </div>
        ) : null}
        <div className="min-w-0 flex-1 overflow-auto">
          {activeTab === 'reference' && showReferenceTab ? (
            <PreviewModeShell
              workspaceMode={workspaceId}
              gameRootPath={gameRootPath}
              directoryInfo={directoryInfo}
              locale={locale!}
              theme={theme!}
              accentColor={accentColor ?? '#6366f1'}
              viewportLabels={viewportLabels ?? {} as ViewportLabels}
            />
          ) : (
            children
          )}
        </div>
      </div>

      {configDialogOpen && draft ? (
        <ConfigSchemaDialog
          open={configDialogOpen}
          mode={configDialogMode}
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
