import { EditorPage, ExpertModeButton, ExpertPanel, PatchListPage, resolveWorkspaceLanding, type WorkspaceId } from '@features/cp-maker'
import { useAuthoringShellCopy, useEditorCopy, useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useWorkbenchAssetDraftPort } from '../../model/useWorkbenchAssetDraftPort'
import { useEditModeNavigation } from '../../model/useEditModeNavigation'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { MapDocument } from '@entities/map'
import { MapAssetEditorSession, MapCatalog, MapTilesSessionEditor } from '../../workspaces/map'
import { loadGameMapDocument } from '../../workspaces/map/model/gameMapLoad'
import type { MapTileEditDraft } from '../../workspaces/map/model/mapPatchReducer'
import { readCardMapTiles, withCardMapTiles } from '../../workspaces/map/model/mapTilesSession'

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

export type AuthoringRuntimeProps = {
  workspaceId: WorkspaceId
  /**
   * `EditData` asset a cross-module jump asked to open, e.g. `Data/Objects`.
   * The runtime selects the workspace patch that already edits it, or adds one,
   * so a jump from a codex page lands in an editor instead of the patch list.
   */
  pendingAssetTarget?: string | null
  /** Called once the patch for `pendingAssetTarget` is selected. */
  onPendingAssetTargetOpened?: () => void
}

/**
 * Host runtime for content workspaces (map / events / characters / buildings /
 * items / mods). Owns the page layout directly: a slim header (title, breadcrumb,
 * save state, expert toggle), the routed main view, and the ExpertPanel drawer.
 *
 * There is no shared shell skeleton: each workspace page keeps its own layout,
 * patch-level history lives in `useEditModeNavigation`, and undo/redo belong to
 * the pages themselves (the map asset editor carries its own stack).
 */
export function AuthoringRuntime({ workspaceId, pendingAssetTarget = null, onPendingAssetTargetOpened }: AuthoringRuntimeProps) {
  const { locale, theme } = useWorkbenchRuntimeInputs()
  const copy = useEditorCopy()
  const shellCopy = useAuthoringShellCopy()
  const mapAuthoringCopy = useMapAuthoringCopy()
  const environment = useWorkbenchEnvironment()
  const project = useWorkbenchProject()
  const navigation = useEditModeNavigation(true)
  const patches = project.getPatchesForWorkspace(workspaceId)
  const [mapAssetSession, setMapAssetSession] = useState<{ relativePath: string; document: MapDocument } | null>(null)
  const [mapTilesSession, setMapTilesSession] = useState<{ patchId: string; cardId: string; target: string } | null>(null)
  const [mapTilesSessionDocument, setMapTilesSessionDocument] = useState<MapDocument | null>(null)
  const [mapTilesSessionLoadError, setMapTilesSessionLoadError] = useState<string | null>(null)
  const previousPatchRef = useRef<string | null>(null)
  const { port, saveState } = useWorkbenchAssetDraftPort(workspaceId, {
    onOpenPatch: navigation.navigateToPatch,
    // The patch-tiles session owns its own document undo/redo, so keep the
    // draft undo shortcut from stepping a pre-session patch operation
    // underneath it while the session is open.
    shortcutsEnabled: mapTilesSession === null,
  })

  const { navigateToPatch } = navigation
  const { addPatch, activeDraft } = project
  useEffect(() => {
    if (pendingAssetTarget === null || activeDraft === null) {
      return
    }
    const normalized = normalizeTarget(pendingAssetTarget)
    const existing = patches.find((patch) => patch.action === 'EditData' && normalizeTarget(patch.target) === normalized)
    if (existing) {
      navigateToPatch(existing.id)
      onPendingAssetTargetOpened?.()
      return
    }
    // Ensure the patch first; the next render finds it in `patches` and opens
    // it. Trusting a synchronously returned id is unsafe under effect
    // double-invocation, while the dedupe inside addPatch prevents duplicates.
    addPatch(workspaceId, pendingAssetTarget, 'EditData')
  }, [pendingAssetTarget, activeDraft, patches, workspaceId, addPatch, navigateToPatch, onPendingAssetTargetOpened])

  const landing = useMemo(() => resolveWorkspaceLanding(workspaceId), [workspaceId])

  // Singleton-ensure for asset landings: create the patch if it doesn't exist.
  useEffect(() => {
    if (!port) return
    if (landing.kind === 'asset') {
      const exists = port.draft.patches.some((p) => p.action === landing.action && p.target === landing.target)
      if (!exists) {
        port.addPatch(landing.action, landing.target, undefined)
      }
    }
  }, [port, landing])

  const workspaceLabel = copy.studioDesk.referencePreview.workspaceLabels[workspaceId]
  const workspaceTitle = workspaceId === 'mods' ? shellCopy.projectContentTitle : shellCopy.workspaceLabel(workspaceLabel)

  // Breadcrumb: patch logName when editing, null otherwise
  const activePatch = patches.find((p) => p.id === navigation.activeEditPatchId) ?? null
  const breadcrumb = activePatch ? activePatch.logName || activePatch.target : null

  // Resources: subset the editors bind — real gameRootPath, directoryInfo,
  // playerAppearanceProfile, appearance window callback, locale, theme, accent.
  function returnToLibrary() {
    setMapAssetSession(null)
    navigation.navigateToPatch(previousPatchRef.current)
  }

  async function openMapAsset(relativePath: string, suppliedDocument?: MapDocument) {
    const document = suppliedDocument ?? (JSON.parse((await project.loadProjectMapAsset(relativePath)).content) as MapDocument)
    previousPatchRef.current = navigation.activeEditPatchId
    setMapAssetSession({ relativePath, document })
    navigation.navigateToPatch(null)
  }

  function closeMapTilesSession() {
    setMapTilesSession(null)
    setMapTilesSessionDocument(null)
    setMapTilesSessionLoadError(null)
    navigation.navigateToPatch(previousPatchRef.current)
  }

  function completeMapTilesSession(edits: MapTileEditDraft[]) {
    if (mapTilesSession && port) {
      const sessionPatch = port.draft.patches.find((patch) => patch.id === mapTilesSession.patchId)
      if (sessionPatch) {
        // A single updatePatch call writes the whole card, so the draft undo
        // stack records the entire session as one undoable step.
        port.updatePatch(mapTilesSession.patchId, {
          editorState: withCardMapTiles(sessionPatch.editorState, mapTilesSession.cardId, edits),
        })
      }
    }
    closeMapTilesSession()
  }

  async function editPatchTiles(args: { patchId: string; cardId: string; target: string }) {
    const gameRootPath = environment.directoryInfo?.rootPath ?? null
    // The entry point is disabled for token targets and missing game roots, but
    // the runtime still guards in case a host triggers it programmatically.
    if (!gameRootPath || args.target.includes('{{')) return
    previousPatchRef.current = navigation.activeEditPatchId
    setMapTilesSession(args)
    setMapTilesSessionDocument(null)
    setMapTilesSessionLoadError(null)
    navigation.navigateToPatch(null)
    try {
      const document = await loadGameMapDocument(gameRootPath, args.target, locale)
      setMapTilesSessionDocument(document)
    } catch (error) {
      setMapTilesSessionLoadError(error instanceof Error ? error.message : String(error))
    }
  }

  const resources = {
    gameRootPath: environment.directoryInfo?.rootPath ?? null,
    directoryInfo: environment.directoryInfo ?? null,
    playerAppearanceProfile: environment.playerAppearanceProfile ?? null,
    onOpenPlayerAppearanceWindow: environment.onOpenPlayerAppearanceWindow,
    locale,
    theme,
    accentColor: environment.accentColor,
    onReturnToLibrary: returnToLibrary,
    onOpenMapAsset: (relativePath: string) => {
      void openMapAsset(relativePath)
    },
    onEditPatchTiles: (args: { patchId: string; cardId: string; target: string }) => {
      void editPatchTiles(args)
    },
  }

  if (workspaceId === 'map' && port && mapAssetSession) {
    return (
      <MapAssetEditorSession
        key={mapAssetSession.relativePath}
        relativePath={mapAssetSession.relativePath}
        document={mapAssetSession.document}
        draftPort={port}
        resources={resources}
      />
    )
  }

  if (workspaceId === 'map' && port && mapTilesSession) {
    const sessionPatch = port.draft.patches.find((patch) => patch.id === mapTilesSession.patchId) ?? null
    if (mapTilesSessionDocument) {
      return (
        <MapTilesSessionEditor
          key={`${mapTilesSession.patchId}:${mapTilesSession.cardId}`}
          target={mapTilesSession.target}
          baseDocument={mapTilesSessionDocument}
          initialEdits={sessionPatch ? readCardMapTiles(sessionPatch.editorState, mapTilesSession.cardId) : []}
          onComplete={completeMapTilesSession}
          onCancel={closeMapTilesSession}
          resources={resources}
        />
      )
    }
    const tilesSessionCopy = mapAuthoringCopy.tilesSession
    return (
      <div className={cx('map-tiles-session-state', mapTilesSessionLoadError && 'is-error')}>
        <strong>{tilesSessionCopy.title}</strong>
        {mapTilesSessionLoadError ? <p>{tilesSessionCopy.loadFailed}</p> : <span className="animate-spin">◌</span>}
        <div className="map-tiles-session-actions">
          {mapTilesSessionLoadError ? (
            <button type="button" className="control-button" onClick={() => void editPatchTiles(mapTilesSession)}>
              {tilesSessionCopy.retry}
            </button>
          ) : null}
          <button type="button" className="control-button" onClick={closeMapTilesSession}>
            {tilesSessionCopy.cancel}
          </button>
        </div>
      </div>
    )
  }

  let mainContent: ReactElement | null = null
  if (navigation.activeEditPatchId && activePatch && port) {
    mainContent = <EditorPage workspaceId={workspaceId} patch={activePatch} draftPort={port} resources={resources} />
  } else if (landing.kind === 'asset' && port) {
    // Asset landing: find or create the singleton patch and show its editor.
    const singletonPatch = port.draft.patches.find((p) => p.action === landing.action && p.target === landing.target) ?? null
    mainContent = <EditorPage workspaceId={workspaceId} patch={singletonPatch} draftPort={port} resources={resources} />
  } else if (landing.kind === 'assetGroup' && port) {
    // Map: page-owned first-level browser (library + patch manager).
    mainContent = (
      <MapCatalog
        draftPort={port}
        resources={resources}
        onOpenPatch={navigation.navigateToPatch}
        onOpenMapAsset={(relativePath, document) => {
          void openMapAsset(relativePath, document)
        }}
      />
    )
  } else if (landing.kind === 'module' && workspaceId === 'events' && port) {
    // Events hub: list-based entry into the per-patch event editors.
    mainContent = (
      <PatchListPage
        patches={patches.filter((p) => p.workspace === 'events')}
        onEditPatch={(patchId, eventKey) => {
          port.selectEntry(eventKey ?? null)
          navigateToPatch(patchId)
        }}
        onRemovePatch={(patchId) => port.updatePatch(patchId, { enabled: false })}
        onTogglePatch={(patchId, enabled) => port.updatePatch(patchId, { enabled })}
        onPatchUpdate={(patchId, changes) => port.updatePatch(patchId, changes)}
        canGoBack={navigation.canGoBack}
        canGoForward={navigation.canGoForward}
        onGoBack={navigation.goBack}
        onGoForward={navigation.goForward}
        workspaceId="events"
        draft={port.draft}
      />
    )
  } else if (landing.kind === 'projectContent') {
    mainContent = (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-(--text-secondary)">
        {shellCopy.projectContentFallback}
      </div>
    )
  }

  const saveLabel =
    saveState === 'saving'
      ? shellCopy.saving
      : saveState === 'saved'
        ? shellCopy.saved
        : saveState === 'error'
          ? shellCopy.saveFailed
          : shellCopy.unsaved

  return (
    <div className="authoring-shell">
      <header className="authoring-header">
        <div className="authoring-header-context">
          <span className="authoring-header-title">{workspaceTitle}</span>
          {breadcrumb ? <span className="authoring-header-breadcrumb">{breadcrumb}</span> : null}
        </div>

        <div className="authoring-header-spacer" />

        <span
          className={cx('authoring-header-save-status', saveState === 'error' && 'is-error', saveState === 'saving' && 'is-working')}
          data-state={saveState}
        >
          {saveLabel}
        </span>

        <ExpertModeButton />
      </header>

      <div className="authoring-shell-body">
        <main className="authoring-shell-main">{mainContent}</main>

        <ExpertPanel patch={activePatch} extraTokenNames={[]} onPatchChange={project.updatePatch} />
      </div>
    </div>
  )
}
