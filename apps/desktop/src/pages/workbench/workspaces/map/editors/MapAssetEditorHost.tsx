import { useEffect } from 'react'
import type { MapDocument } from '@entities/map'
import type { AssetDraftPort, EditorResources } from '@features/cp-maker'
import { useMapAuthoringCopy } from '@locales/provider'
import { TaskCancelledError, useLatestTask } from '@shared/lib/task-runtime'
import { useMapEditorSessionStore } from '../model/mapEditorSessions'
import { MapAssetEditorSession } from './MapAssetEditor'

export type MapAssetEditorHostProps = {
  /** Draft port of the project the hosted session edits against. */
  draftPort: AssetDraftPort
  /** Reads a project map asset's JSON document by relative path. */
  loadProjectMapAsset: (relativePath: string) => Promise<{ content: string }>
  /** Host environment fields; the host overrides the session callbacks (`onReturnToLibrary`, `onOpenMapAsset`). */
  resources: EditorResources
  /** Surface-specific return behavior, e.g. closing the session on the hosting page. */
  onReturnToLibrary: () => void
  /** Surface-specific logic that runs alongside a session open, before the store records it. */
  onSessionOpen?: (relativePath: string) => void
}

/**
 * Hosts the open map asset editor session for any module runtime that owns a
 * project draft port: it consumes the session from `useMapEditorSessionStore`,
 * loads the document, renders the loading / error / retry states and mounts
 * `MapAssetEditorSession`.
 *
 * Boundaries: the session open entry point is `useMapEditorSessionStore`
 * (`openMapAsset`) — the host never opens sessions itself; restart restore is
 * owned by the mounting surface, so the host only renders a session that
 * already exists and returns `null` without one.
 */
export function MapAssetEditorHost({
  draftPort,
  loadProjectMapAsset,
  resources,
  onReturnToLibrary,
  onSessionOpen,
}: MapAssetEditorHostProps) {
  const mapAssetSession = useMapEditorSessionStore((state) => state.mapAsset)
  const openMapAssetSession = useMapEditorSessionStore((state) => state.openMapAsset)
  const settleMapAssetDocument = useMapEditorSessionStore((state) => state.settleMapAssetDocument)
  const settleMapAssetLoadError = useMapEditorSessionStore((state) => state.settleMapAssetLoadError)
  const retryMapAsset = useMapEditorSessionStore((state) => state.retryMapAsset)
  const mapAuthoringCopy = useMapAuthoringCopy()

  // The session store only owns the path; the document loads (or reloads after
  // a module switch) here, with failures surfaced in the session's own state.
  const loadAssetSessionTask = useLatestTask('map-editor-asset-session')
  useEffect(() => {
    if (!mapAssetSession || mapAssetSession.document || mapAssetSession.loadError) return
    const relativePath = mapAssetSession.relativePath
    void loadAssetSessionTask(async (scope) => {
      try {
        const loaded = await loadProjectMapAsset(relativePath)
        if (scope.isCurrent()) settleMapAssetDocument(JSON.parse(loaded.content) as MapDocument)
      } catch (error) {
        if (error instanceof TaskCancelledError || !scope.isCurrent()) return
        settleMapAssetLoadError(error instanceof Error ? error.message : String(error))
      }
    }).catch((error) => {
      if (!(error instanceof TaskCancelledError)) throw error
    })
  }, [mapAssetSession, loadProjectMapAsset, loadAssetSessionTask, settleMapAssetDocument, settleMapAssetLoadError])

  if (!mapAssetSession) return null

  const sessionResources: EditorResources = {
    ...resources,
    onReturnToLibrary,
    onOpenMapAsset: (relativePath) => {
      onSessionOpen?.(relativePath)
      openMapAssetSession(relativePath)
    },
  }

  if (mapAssetSession.loadError) {
    return (
      <div className="map-tiles-session-state is-error">
        <strong>{mapAuthoringCopy.assetSession.loadFailed}</strong>
        <p>{mapAssetSession.loadError}</p>
        <div className="map-tiles-session-actions">
          <button type="button" className="control-button" onClick={retryMapAsset}>
            {mapAuthoringCopy.assetSession.retry}
          </button>
          <button type="button" className="control-button" onClick={onReturnToLibrary}>
            {mapAuthoringCopy.assetSession.close}
          </button>
        </div>
      </div>
    )
  }
  if (!mapAssetSession.document) {
    return (
      <div className="map-tiles-session-state">
        <strong>{mapAuthoringCopy.assetSession.loading}</strong>
        <span className="animate-spin">◌</span>
      </div>
    )
  }
  return (
    <MapAssetEditorSession
      key={mapAssetSession.relativePath}
      relativePath={mapAssetSession.relativePath}
      document={mapAssetSession.document}
      draftPort={draftPort}
      resources={sessionResources}
    />
  )
}
