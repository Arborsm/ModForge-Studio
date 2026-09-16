import { EditorPage, ExpertPanel, PatchListPage, resolveWorkspaceLanding, WorkspacePatchList, type WorkspaceId } from '@features/cp-maker'
import { useAuthoringShellCopy, useEditorCopy, useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useAssetLibraryFocusStore } from '@shared/lib/app-state/assetLibraryFocusStore'
import { dismissNotification } from '@shared/ui/notifications'
import { appEvent } from '@platform/observability'
import { WorkspaceSplitView } from '@shared/ui/WorkspaceSplitView'
import { useWorkbenchAssetDraftPort } from '../../model/useWorkbenchAssetDraftPort'
import { useEditModeStore } from '../../model/editModeStore'
import { useWorkbenchEnvironment, useWorkbenchProject } from '../../model/workbenchModuleContexts'
import { useWorkbenchRuntimeInputs } from './runtimeInputs'
import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import type { MapDocument } from '@entities/map'
import { MapAssetEditorHost, MapCatalog, MapTilesSessionEditor } from '../../workspaces/map'
import { useMapEditorSessionStore } from '../../workspaces/map/model/mapEditorSessions'
import { CharacterCatalogPage } from '../../workspaces/character-data'
import { BuildingCatalogPage } from '../../workspaces/building-data'
import { ItemCatalogPage } from '../../workspaces/item-data'
import { loadGameMapDocument } from '../../workspaces/map/model/gameMapLoad'
import type { MapTileEditDraft } from '../../workspaces/map/model/mapPatchReducer'
import { readCardMapTiles, withCardMapTiles } from '../../workspaces/map/model/mapTilesSession'
import { useModulePersistentState } from '@shared/lib/app-state/useModulePersistentState'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'

function normalizeTarget(target: string): string {
  return target.trim().replaceAll('\\', '/').toLowerCase()
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
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
 * items / mods). Owns the page layout directly: the routed main view and the
 * ExpertPanel drawer. There is no page header; save failures surface through
 * the shared notification system and the expert toggle lives in the workbench
 * side navigation.
 *
 * There is no shared shell skeleton: each workspace page keeps its own layout,
 * patch-level edit state lives in the shared `useEditModeStore`, and undo/redo
 * belong to the pages themselves (the map asset editor carries its own stack).
 */
export function AuthoringRuntime({ workspaceId, pendingAssetTarget = null, onPendingAssetTargetOpened }: AuthoringRuntimeProps) {
  const { locale, theme } = useWorkbenchRuntimeInputs()
  const shellCopy = useAuthoringShellCopy()
  const editorCopy = useEditorCopy()
  const mapAuthoringCopy = useMapAuthoringCopy()
  const environment = useWorkbenchEnvironment()
  const project = useWorkbenchProject()
  const activeEditPatchId = useEditModeStore((state) => state.activeEditPatchId)
  const navigateToPatch = useEditModeStore((state) => state.navigateToPatch)
  const patches = project.getPatchesForWorkspace(workspaceId)
  // Load patches are managed in the asset library; opening one from the change
  // list jumps straight to the corresponding load-binding instead of showing
  // the read-only summary editor.
  const openPatchOrJumpToAssetLibrary = (patchId: string) => {
    const patch = patches.find((p) => p.id === patchId)
    if (patch?.action === 'Load') {
      useAssetLibraryFocusStore.getState().setFocus({ kind: 'load-binding', key: patch.id })
      environment.onOpenModule('asset-library')
      return
    }
    navigateToPatch(patchId)
  }
  // Editor sessions live in a module-scoped store so they survive module
  // switches (AuthoringRuntime unmounts when the workbench swaps modules).
  const mapAssetSession = useMapEditorSessionStore((state) => state.mapAsset)
  const mapTilesSessionState = useMapEditorSessionStore((state) => state.mapTiles)
  const openMapAssetSession = useMapEditorSessionStore((state) => state.openMapAsset)
  const settleMapAssetDocument = useMapEditorSessionStore((state) => state.settleMapAssetDocument)
  const closeMapAssetSession = useMapEditorSessionStore((state) => state.closeMapAsset)
  const openMapTilesSession = useMapEditorSessionStore((state) => state.openMapTiles)
  const settleMapTilesDocument = useMapEditorSessionStore((state) => state.settleMapTilesDocument)
  const settleMapTilesLoadError = useMapEditorSessionStore((state) => state.settleMapTilesLoadError)
  const retryMapTiles = useMapEditorSessionStore((state) => state.retryMapTiles)
  const closeMapTilesSessionState = useMapEditorSessionStore((state) => state.closeMapTiles)
  const mapTilesSession = mapTilesSessionState?.session ?? null
  const mapTilesSessionDocument = mapTilesSessionState?.document ?? null
  const mapTilesSessionLoadError = mapTilesSessionState?.loadError ?? null
  const previousPatchRef = useRef<string | null>(null)
  const { port, saveState } = useWorkbenchAssetDraftPort(workspaceId, {
    onOpenPatch: navigateToPatch,
    // The patch-tiles session owns its own document undo/redo, so keep the
    // draft undo shortcut from stepping a pre-session patch operation
    // underneath it while the session is open.
    shortcutsEnabled: mapTilesSession === null,
  })

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

  // Save failures replace the old header badge with a transient notification;
  // the notification is dismissed as soon as the auto-save pipeline recovers.
  useEffect(() => {
    if (saveState === 'error') {
      appEvent('error', shellCopy.saveFailed)
        .noticeId('authoring-save-error')
        .context({ source: 'authoring-runtime', operation: 'save-project' })
        .emit()
    } else {
      dismissNotification('authoring-save-error')
    }
  }, [saveState, shellCopy.saveFailed])

  // Resources: subset the editors bind — real gameRootPath, directoryInfo,
  // playerAppearanceProfile, appearance window callback, locale, theme, accent.
  function returnToLibrary() {
    closeMapAssetSession()
    navigateToPatch(previousPatchRef.current)
  }

  function openMapAsset(relativePath: string, suppliedDocument?: MapDocument) {
    previousPatchRef.current = activeEditPatchId
    openMapAssetSession(relativePath)
    if (suppliedDocument) settleMapAssetDocument(suppliedDocument)
    navigateToPatch(null)
  }

  // Restart restore: the open asset session persists as a relative path and
  // reopens on mount; closing the editor clears it.
  const [persistedMapAssetPath, setPersistedMapAssetPath] = useModulePersistentState<string | null>(
    'map-editor/asset-session',
    null,
    isStringOrNull,
  )
  const sessionRestoreAttemptedRef = useRef(false)
  useEffect(() => {
    if (workspaceId !== 'map' || sessionRestoreAttemptedRef.current) return
    sessionRestoreAttemptedRef.current = true
    if (!mapAssetSession && persistedMapAssetPath) openMapAssetSession(persistedMapAssetPath)
  }, [workspaceId, mapAssetSession, persistedMapAssetPath, openMapAssetSession])
  useEffect(() => {
    if (workspaceId !== 'map') return
    setPersistedMapAssetPath(mapAssetSession?.relativePath ?? null)
  }, [workspaceId, mapAssetSession, setPersistedMapAssetPath])

  function closeMapTilesSession() {
    closeMapTilesSessionState()
    navigateToPatch(previousPatchRef.current)
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
      const tilesSessionCopy = mapAuthoringCopy.tilesSession
      appEvent('success', tilesSessionCopy.completedNotificationTitle)
        .description(tilesSessionCopy.completedNotificationDescription)
        .context({ source: 'authoring-runtime', operation: 'complete-map-tiles-session' })
        .emit()
    }
    closeMapTilesSession()
  }

  function editPatchTiles(args: { patchId: string; cardId: string; target: string }) {
    const gameRootPath = environment.directoryInfo?.rootPath ?? null
    // The entry point is disabled for token targets and missing game roots, but
    // the runtime still guards in case a host triggers it programmatically.
    if (!gameRootPath || args.target.includes('{{')) return
    previousPatchRef.current = activeEditPatchId
    openMapTilesSession(args)
    navigateToPatch(null)
  }

  // Tile-session documents load asynchronously; the store keeps the session
  // alive across module switches, so the load re-runs on every mount.
  const loadTilesSessionTask = useLatestTask('map-editor-tiles-session')
  useEffect(() => {
    if (workspaceId !== 'map' || !mapTilesSessionState || mapTilesSessionState.document || mapTilesSessionState.loadError) return
    const gameRootPath = environment.directoryInfo?.rootPath ?? null
    const target = mapTilesSessionState.session.target
    if (!gameRootPath || target.includes('{{')) return
    void loadTilesSessionTask(async (scope) => {
      try {
        const document = await loadGameMapDocument(gameRootPath, target, locale)
        if (scope.isCurrent()) settleMapTilesDocument(document)
      } catch (error) {
        if (error instanceof TaskCancelledError || !scope.isCurrent()) return
        settleMapTilesLoadError(error instanceof Error ? error.message : String(error))
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) throw error
    })
  }, [
    workspaceId,
    mapTilesSessionState,
    environment.directoryInfo,
    locale,
    loadTilesSessionTask,
    settleMapTilesDocument,
    settleMapTilesLoadError,
  ])

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
      openMapAsset(relativePath)
    },
    onEditPatchTiles: (args: { patchId: string; cardId: string; target: string }) => {
      editPatchTiles(args)
    },
  }

  // The asset session host owns document loading and the session render tree;
  // this runtime only contributes its bookkeeping wrapper and return behavior.
  if (workspaceId === 'map' && port && mapAssetSession) {
    return (
      <MapAssetEditorHost
        draftPort={port}
        loadProjectMapAsset={project.loadProjectMapAsset}
        resources={resources}
        onReturnToLibrary={returnToLibrary}
        onSessionOpen={openMapAsset}
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
            <button type="button" className="control-button" onClick={retryMapTiles}>
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
  const activePatch = patches.find((p) => p.id === activeEditPatchId) ?? null
  if (activeEditPatchId && activePatch && port) {
    mainContent = <EditorPage workspaceId={workspaceId} patch={activePatch} draftPort={port} resources={resources} />
  } else if (landing.kind === 'asset' && port) {
    if (workspaceId === 'characters') {
      // Characters: land on the catalog page (library + change manager).
      // Selecting a character opens the singleton patch's editor.
      const singletonPatch = port.draft.patches.find((p) => p.action === landing.action && p.target === landing.target) ?? null
      if (singletonPatch !== null) {
        mainContent = (
          <CharacterCatalogPage patch={singletonPatch} draftPort={port} resources={resources} onOpenPatch={openPatchOrJumpToAssetLibrary} />
        )
      } else {
        mainContent = <EditorPage workspaceId={workspaceId} patch={null} draftPort={port} resources={resources} />
      }
    } else if (workspaceId === 'buildings') {
      // Buildings: land on the catalog page (library + entry manager).
      // Selecting a building opens the singleton patch's editor.
      const singletonPatch = port.draft.patches.find((p) => p.action === landing.action && p.target === landing.target) ?? null
      if (singletonPatch !== null) {
        mainContent = (
          <BuildingCatalogPage patch={singletonPatch} draftPort={port} resources={resources} onOpenPatch={openPatchOrJumpToAssetLibrary} />
        )
      } else {
        mainContent = <EditorPage workspaceId={workspaceId} patch={null} draftPort={port} resources={resources} />
      }
    } else if (workspaceId === 'items') {
      // Items: land on the catalog page (library + entry manager).
      // Selecting an item opens the singleton patch's editor.
      const singletonPatch = port.draft.patches.find((p) => p.action === landing.action && p.target === landing.target) ?? null
      if (singletonPatch !== null) {
        mainContent = (
          <ItemCatalogPage patch={singletonPatch} draftPort={port} resources={resources} onOpenPatch={openPatchOrJumpToAssetLibrary} />
        )
      } else {
        mainContent = <EditorPage workspaceId={workspaceId} patch={null} draftPort={port} resources={resources} />
      }
    } else {
      // Other asset landings: find or create the singleton patch and show its editor.
      const singletonPatch = port.draft.patches.find((p) => p.action === landing.action && p.target === landing.target) ?? null
      mainContent = <EditorPage workspaceId={workspaceId} patch={singletonPatch} draftPort={port} resources={resources} />
    }
  } else if (landing.kind === 'assetGroup' && port) {
    // Map: page-owned first-level gallery (game maps + patch manager).
    mainContent = <MapCatalog draftPort={port} resources={resources} onOpenPatch={openPatchOrJumpToAssetLibrary} />
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
        onPatchUpdate={(patchId, changes) => port.updatePatch(patchId, changes)}
        gameRootPath={environment.directoryInfo?.rootPath ?? null}
        onCreatePatch={(target) => port.addPatch('EditData', target)}
        workspaceId="events"
      />
    )
  } else if (landing.kind === 'projectContent') {
    mainContent = (
      <div className="text-text-secondary flex h-full items-center justify-center px-6 text-center text-xs">
        {shellCopy.projectContentFallback}
      </div>
    )
  }

  // Characters, buildings and items each own their layout inside their
  // respective catalog pages (library + entry manager split view). Other asset
  // landings, if any, would still need the outer patch-list sidebar.
  if (
    landing.kind === 'asset' &&
    workspaceId !== 'characters' &&
    workspaceId !== 'buildings' &&
    workspaceId !== 'items' &&
    port &&
    mainContent !== null
  ) {
    mainContent = (
      <WorkspaceSplitView
        canvas
        sidebarLabel={editorCopy.studioDesk.patchList.regionLabel}
        sidebar={
          <WorkspacePatchList
            patches={patches}
            draftPort={port}
            reorderWithin={(candidate) => candidate.workspace === workspaceId}
            onOpenPatch={openPatchOrJumpToAssetLibrary}
          />
        }
      >
        {mainContent}
      </WorkspaceSplitView>
    )
  }

  return (
    <div className="authoring-shell">
      <div className="authoring-shell-body">
        <main className="authoring-shell-main">{mainContent}</main>

        <ExpertPanel patch={activePatch} extraTokenNames={[]} onPatchChange={project.updatePatch} />
      </div>
    </div>
  )
}
