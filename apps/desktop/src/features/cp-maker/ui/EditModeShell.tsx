// Edit 模式总壳层：Header + Patch catalog / full-page editor route

import { useEffect, useState } from 'react'
import type { DraftPatch, CpMakerDraft, WorkspaceId } from '@features/cp-maker'
import type { GameDirectoryInfo } from '../model/cpMakerPort'
import type { LocaleCode, ThemeMode, ViewportLabels } from '@locales/api'
import type { PlayerAppearanceProfile } from '@entities/event'
import { AddPatchDialog } from './AddPatchDialog'
import { ConfigSchemaDialog } from './ConfigSchemaDialog'
import { EditModeToolbar } from './EditModeToolbar'
import { PatchListPage } from './PatchListPage'
import { EditorPage } from './EditorPage'
import { useEditorCopy } from '@locales/provider'

interface EditModeShellProps {
  workspaceId: WorkspaceId
  draft: CpMakerDraft | null
  patches: DraftPatch[]
  activePatchId: string | null
  onSelectPatch: (patchId: string | null) => void
  onPatchAdd: (action: DraftPatch['action'], target: string, fromFile?: string) => string | void
  onPatchRemove: (patchId: string) => void
  onPatchUpdate: (patchId: string, patch: Partial<DraftPatch>) => void
  onConfigSchemaChange: (entries: Array<{ key: string; defaultValue: unknown; allowValues?: string; description?: string }>) => void
  onSaveDraft: () => void
  isDirty: boolean
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  onRemoveVirtualAsset: (relativePath: string) => void
  gameRootPath?: string | null
  directoryInfo?: GameDirectoryInfo | null
  playerAppearanceProfile?: PlayerAppearanceProfile | null
  onOpenPlayerAppearanceWindow?: () => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

function EditModeWipPage({ workspaceId }: { workspaceId: WorkspaceId }) {
  const copy = useEditorCopy()
  const desk = copy.studioDesk
  const title = workspaceId === 'mods' ? copy.leftDock.project : copy.nav[workspaceId]

  return (
    <section className="edit-mode-wip-page" aria-label={desk.wipTitle(title)}>
      <div className="edit-mode-wip-card">
        <div className="studio-wip-blueprint" aria-hidden="true">
          <span className="studio-wip-node studio-wip-node-a" />
          <span className="studio-wip-node studio-wip-node-b" />
          <span className="studio-wip-node studio-wip-node-c" />
          <span className="studio-wip-line studio-wip-line-a" />
          <span className="studio-wip-line studio-wip-line-b" />
        </div>
        <div className="studio-wip-copy">
          <span className="studio-wip-badge">{desk.wipBadge}</span>
          <h3>{desk.wipTitle(title)}</h3>
          <p>{desk.wipDescription}</p>
        </div>
      </div>
    </section>
  )
}

function cloneDraftPatchValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  if (value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
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
  playerAppearanceProfile,
  onOpenPlayerAppearanceWindow,
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
  const activePatch = activePatchId ? (patches.find((p) => p.id === activePatchId) ?? null) : null
  const [activeEventKey, setActiveEventKey] = useState<string | null>(null)
  const [addPatchDialogOpen, setAddPatchDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const isWipWorkspace = workspaceId !== 'events'
  const isEventPatchHub = !isWipWorkspace && activePatchId === null
  const isEventScriptEditor = workspaceId === 'events' && activePatchId !== null
  const eventAliases =
    workspaceId === 'events' &&
    activePatch?.editorState &&
    typeof activePatch.editorState === 'object' &&
    !Array.isArray(activePatch.editorState) &&
    'eventAliases' in activePatch.editorState &&
    typeof activePatch.editorState.eventAliases === 'object' &&
    activePatch.editorState.eventAliases !== null &&
    !Array.isArray(activePatch.editorState.eventAliases)
      ? (activePatch.editorState.eventAliases as Record<string, string>)
      : {}
  const toolbarContextTitle = workspaceId === 'events' && activeEventKey ? activeEventKey : null
  const toolbarContextSubtitle = toolbarContextTitle ? (eventAliases[toolbarContextTitle] ?? null) : null

  function handleSelectPatch(patchId: string | null) {
    if (patchId === null) {
      setActiveEventKey(null)
    }
    onSelectPatch(patchId)
  }

  function handleOpenEventPatch(patchId: string, eventKey?: string) {
    setActiveEventKey(eventKey ?? null)
    onSelectPatch(patchId)
  }

  function handleDuplicatePatch(patch: DraftPatch) {
    const copiedPatchId = onPatchAdd(patch.action, patch.target, patch.fromFile)
    if (typeof copiedPatchId !== 'string') {
      return
    }

    onPatchUpdate(copiedPatchId, {
      logName: `${patch.logName || patch.target || patch.id} Copy`,
      enabled: patch.enabled,
      when: patch.when ? cloneDraftPatchValue(patch.when) : undefined,
      editorState: cloneDraftPatchValue(patch.editorState),
      targetLocale: patch.targetLocale,
      update: patch.update,
      priority: patch.priority,
      localTokens: patch.localTokens ? cloneDraftPatchValue(patch.localTokens) : undefined,
      targetField: patch.targetField ? [...patch.targetField] : undefined,
    })
    onSelectPatch(null)
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
      {!isEventPatchHub && !isEventScriptEditor ? (
        <EditModeToolbar
          workspaceId={workspaceId}
          patches={patches}
          activePatchId={activePatchId}
          activePatch={activePatch}
          contextTitle={toolbarContextTitle}
          contextSubtitle={toolbarContextSubtitle}
          isDirty={isDirty}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onSelectPatch={handleSelectPatch}
          onAddPatch={() => {
            setAddPatchDialogOpen(true)
          }}
          onOpenConfig={() => setConfigDialogOpen(true)}
          onSaveDraft={onSaveDraft}
        />
      ) : null}

      {/* 内容区 */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {isWipWorkspace ? (
          <EditModeWipPage workspaceId={workspaceId} />
        ) : activePatchId === null ? (
          <PatchListPage
            patches={patches}
            onEditPatch={handleOpenEventPatch}
            onAddPatchRequest={() => setAddPatchDialogOpen(true)}
            onRemovePatch={onPatchRemove}
            onTogglePatch={(id, enabled) => onPatchUpdate(id, { enabled })}
            onPatchUpdate={onPatchUpdate}
            onDuplicatePatch={handleDuplicatePatch}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={onGoBack}
            onGoForward={onGoForward}
            onOpenConfig={() => setConfigDialogOpen(true)}
            onSaveDraft={onSaveDraft}
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
            selectedEventKey={activeEventKey}
            gameRootPath={gameRootPath ?? null}
            directoryInfo={directoryInfo ?? null}
            playerAppearanceProfile={playerAppearanceProfile}
            onOpenPlayerAppearanceWindow={onOpenPlayerAppearanceWindow}
            onSelectedEventKeyChange={setActiveEventKey}
            onOpenConfig={() => setConfigDialogOpen(true)}
            onSaveDraft={onSaveDraft}
            isDirty={isDirty}
          />
        )}
      </div>

      {configDialogOpen && draft ? (
        <ConfigSchemaDialog
          key={`config:${activePatch?.id ?? 'world'}:${draft.configSchema.length}`}
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
