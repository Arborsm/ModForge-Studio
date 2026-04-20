import { useState } from 'react'
import { FileCode, FileJson, Folder, Plus, Save, Download } from 'lucide-react'
import { buildContentJson, type GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { WorkspaceId } from '../../lib/plugins/workspaceRegistry'
import { CreateDraftDialog } from './CreateDraftDialog'
import { ExportDialog } from './ExportDialog'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { ConfigSchemaDialog } from './ConfigSchemaDialog'

interface GeneratedProjectOverviewProps {
  draft: GeneratedProjectDraft | null
  drafts: Array<{ draftStorageKey: string; projectName: string; projectUniqueId: string; lastDraftSavedAt: number | null }>
  patchCountByWorkspace: Partial<Record<WorkspaceId, number>>
  isDirty: boolean
  isLoading: boolean
  onCreateDraft: (metadata: {
    projectName: string
    projectDescription: string
    projectAuthor: string
    projectVersion: string
    projectUniqueId: string
  }) => void
  onLoadDraft: (storageKey: string) => void
  onDeleteDraft: (storageKey: string) => void
  onCopyDraft: (storageKey: string) => void
  onSaveDraft: () => void
  onExportPack: (outputPath: string) => Promise<void>
  onConfigSchemaChange: (entries: Array<{ key: string; defaultValue: unknown; allowValues?: unknown[]; description?: string }>) => void
  onNavigateToWorkspace: (workspace: WorkspaceId) => void
}

export function GeneratedProjectOverview({
  draft,
  drafts,
  patchCountByWorkspace,
  isDirty,
  isLoading,
  onCreateDraft,
  onLoadDraft,
  onDeleteDraft,
  onCopyDraft,
  onSaveDraft,
  onExportPack,
  onConfigSchemaChange,
  onNavigateToWorkspace,
}: GeneratedProjectOverviewProps) {
  const [activeFile, setActiveFile] = useState<'manifest' | 'content'>('manifest')
  const [selectedDraftKey, setSelectedDraftKey] = useState<string | null>(draft?.draftStorageKey ?? null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null)
  const [draftToDeleteName, setDraftToDeleteName] = useState('')
  const [configDialogOpen, setConfigDialogOpen] = useState(false)

  const manifestJson = draft ? generateManifestJson(draft) : ''
  const contentJson = draft ? buildContentJson(draft).contentJson : ''

  return (
    <div className="flex h-full">
      {/* Left: Draft Selector + File Tree */}
      <div className="w-56 shrink-0 border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        {/* Draft Selector */}
        <div className="border-b border-[var(--border-color)] p-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Drafts</span>
            <button type="button" className="icon-button h-6 w-6" onClick={() => setCreateDialogOpen(true)} title="New Draft">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="max-h-40 overflow-auto">
            {drafts.length === 0 ? (
              <div className="py-2 text-center text-[10px] text-[var(--text-secondary)]">No drafts</div>
            ) : (
              drafts.map((d) => (
                <DraftListItem
                  key={d.draftStorageKey}
                  draft={d}
                  selected={selectedDraftKey === d.draftStorageKey}
                  onSelect={() => {
                    setSelectedDraftKey(d.draftStorageKey)
                    onLoadDraft(d.draftStorageKey)
                  }}
                  onDelete={() => {
                    setDraftToDelete(d.draftStorageKey)
                    setDraftToDeleteName(d.projectName)
                    setDeleteDialogOpen(true)
                  }}
                  onCopy={() => onCopyDraft(d.draftStorageKey)}
                />
              ))
            )}
          </div>
        </div>

        {/* File Tree */}
        {draft ? (
          <div className="p-2">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">Files</span>
            <div className="mt-1 space-y-0.5">
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                  activeFile === 'manifest' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                }`}
                onClick={() => setActiveFile('manifest')}
              >
                <FileCode className="h-3 w-3 shrink-0" />
                manifest.json
              </button>
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
                  activeFile === 'content' ? 'bg-[var(--bg-active)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                }`}
                onClick={() => setActiveFile('content')}
              >
                <FileJson className="h-3 w-3 shrink-0" />
                content.json
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Center: Code Preview */}
      <div className="min-w-0 flex-1 border-r border-[var(--border-color)] bg-[var(--bg-app)]">
        {draft ? (
          <>
            <div className="flex items-center border-b border-[var(--border-color)] px-3 py-1.5">
              <span className="text-xs font-medium text-[var(--text-primary)]">
                {activeFile === 'manifest' ? 'manifest.json' : 'content.json'}
              </span>
              <span className="ml-2 text-[10px] text-[var(--text-secondary)]">(read-only preview)</span>
            </div>
            <pre className="h-[calc(100%-32px)] overflow-auto p-3 text-xs text-[var(--text-secondary)]">
              {activeFile === 'manifest' ? manifestJson : contentJson}
            </pre>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            No active draft. Create or select one.
          </div>
        )}
      </div>

      {/* Right: Change Summary + Actions */}
      <div className="w-52 shrink-0 bg-[var(--bg-panel)] p-3">
        {draft ? (
          <>
            <div className="mb-3">
              <h3 className="text-xs font-semibold text-[var(--text-primary)]">{draft.projectMetadata.projectName}</h3>
              <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{draft.projectMetadata.projectUniqueId}</p>
            </div>

            {/* Actions */}
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              <button type="button" className="control-button text-[10px]" onClick={onSaveDraft} disabled={!isDirty || isLoading}>
                <Save className="mr-1 inline h-3 w-3" />
                Save
              </button>
              <button type="button" className="control-button control-button-primary text-[10px]" onClick={() => setExportDialogOpen(true)}>
                <Download className="mr-1 inline h-3 w-3" />
                Export
              </button>
              <button type="button" className="control-button text-[10px]" onClick={() => setConfigDialogOpen(true)}>
                Config
              </button>
            </div>

            {/* Change Summary */}
            <div className="border-t border-[var(--border-color)] pt-2">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Changes by Workspace</span>
              <div className="mt-1.5 space-y-1">
                {(['map', 'events', 'characters', 'buildings', 'items'] as WorkspaceId[]).map((ws) => {
                  const count = patchCountByWorkspace[ws] ?? 0
                  return (
                    <button
                      key={ws}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-[var(--bg-panel-muted)]"
                      onClick={() => onNavigateToWorkspace(ws)}
                    >
                      <span className="capitalize text-[var(--text-primary)]">{ws}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${count > 0 ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Config Schema Summary */}
            {draft.configSchema.length > 0 ? (
              <div className="mt-3 border-t border-[var(--border-color)] pt-2">
                <span className="text-xs font-semibold text-[var(--text-secondary)]">ConfigSchema</span>
                <div className="mt-1 space-y-0.5">
                  {draft.configSchema.map((entry) => (
                    <div key={entry.key} className="flex items-center justify-between px-2 text-[10px]">
                      <span className="text-[var(--text-primary)]">{entry.key}</span>
                      <span className="text-[var(--text-secondary)]">{JSON.stringify(entry.defaultValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-center text-xs text-[var(--text-secondary)]">
            Select a draft to see details.
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateDraftDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={(metadata) => {
          setCreateDialogOpen(false)
          onCreateDraft(metadata)
        }}
      />

      <ExportDialog
        open={exportDialogOpen}
        draftName={draft?.projectMetadata.projectName ?? ''}
        onClose={() => setExportDialogOpen(false)}
        onExport={onExportPack}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        title="Delete Draft"
        message={`Are you sure you want to delete "${draftToDeleteName}"? This action cannot be undone.`}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          if (draftToDelete) {
            onDeleteDraft(draftToDelete)
          }
        }}
      />

      {draft ? (
        <ConfigSchemaDialog
          open={configDialogOpen}
          mode="config"
          patch={null}
          configSchema={draft.configSchema}
          onClose={() => setConfigDialogOpen(false)}
          onPatchWhenChange={() => { /* not used in config mode */ }}
          onConfigSchemaChange={onConfigSchemaChange}
        />
      ) : null}
    </div>
  )
}

function DraftListItem({
  draft,
  selected,
  onSelect,
  onDelete,
  onCopy,
}: {
  draft: { draftStorageKey: string; projectName: string }
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onCopy: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div
      className={`group relative flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors ${
        selected
          ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
      }`}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenuOpen(!menuOpen)
      }}
    >
      <Folder className="h-3 w-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{draft.projectName}</span>

      {/* Context Menu */}
      {menuOpen ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-6 z-50 min-w-[120px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-1 shadow-lg">
            <button
              type="button"
              className="w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-active)]"
              onClick={(e) => {
                e.stopPropagation()
                onCopy()
                setMenuOpen(false)
              }}
            >
              Duplicate
            </button>
            <div className="my-0.5 h-px bg-[var(--border-color)]" />
            <button
              type="button"
              className="w-full rounded-md px-2.5 py-1.5 text-left text-[11px] text-red-400 hover:bg-[var(--bg-active)]"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
                setMenuOpen(false)
              }}
            >
              Delete
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

function generateManifestJson(draft: GeneratedProjectDraft): string {
  const meta = draft.projectMetadata
  const manifest: Record<string, unknown> = {
    Name: meta.projectName,
    Author: meta.projectAuthor,
    Version: meta.projectVersion,
    Description: meta.projectDescription,
    UniqueID: meta.projectUniqueId,
    ContentPackFor: { UniqueID: meta.contentPackForUniqueId },
  }
  if (draft.configSchema.length > 0) {
    const schema: Record<string, unknown> = {}
    for (const entry of draft.configSchema) {
      const def: Record<string, unknown> = { Default: entry.defaultValue }
      if (entry.allowValues !== undefined) def.AllowValues = entry.allowValues
      if (entry.description !== undefined) def.Description = entry.description
      schema[entry.key] = def
    }
    manifest.ConfigSchema = schema
  }
  return JSON.stringify(manifest, null, 2)
}
