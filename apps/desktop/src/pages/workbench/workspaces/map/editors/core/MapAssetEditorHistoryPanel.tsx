import type { JSX } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import { useMapAuthoringCopy } from '@locales/provider'
import type { MapEditorHistoryEntry } from '../../model/mapHistoryStack'

export type { MapEditorHistoryEntry } from '../../model/mapHistoryStack'

export type MapAssetEditorHistoryPanelProps = {
  entries: MapEditorHistoryEntry[]
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Jumps so the clicked entry becomes the current document state. */
  onJumpTo: (key: string) => void
}

/**
 * Undo-history list for the map editor's left column. Pure presentational
 * component: rows render past/current/future states and every action is
 * delegated to the parent through the `onUndo` / `onRedo` / `onJumpTo`
 * callbacks.
 */
export function MapAssetEditorHistoryPanel(props: MapAssetEditorHistoryPanelProps): JSX.Element {
  const copy = useMapAuthoringCopy().assetEditor
  const { entries, canUndo, canRedo, onUndo, onRedo, onJumpTo } = props
  return (
    <div className="map-asset-history-panel">
      <div className="map-asset-history-toolbar">
        <span className="lbl">{copy.historyTitle}</span>
        <span className="spacer" />
        <button type="button" className="icon-button" aria-label={copy.undo} title={copy.undoTitle} disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="icon-button" aria-label={copy.redo} title={copy.redoTitle} disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="map-asset-history-empty">{copy.historyEmpty}</p>
      ) : (
        <div className="map-asset-history-list">
          {entries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="map-asset-history-row"
              data-state={entry.state}
              disabled={entry.state === 'current'}
              onClick={() => onJumpTo(entry.key)}
            >
              <span className="map-asset-history-dot" />
              <span className="map-asset-history-label">{entry.label}</span>
              {entry.state !== 'current' ? <span className="map-asset-history-jump">{copy.historyJumpTo}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
