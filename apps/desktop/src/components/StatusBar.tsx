import { CheckCircle2, FolderSearch, TriangleAlert } from 'lucide-react'
import type { TileHoverInfo } from './MapViewport'
import type { WorkspaceMode, WorkspaceTone } from '../lib/editor-shell'
import type { GameDirectoryInfo, MapAssetSummary } from '../lib/desktop'
import type { MapDocument } from '../lib/maps/types'
import { cx } from '../lib/cx'
import { useEditorCopy } from '../lib/app/localeContext'

type StatusBarProps = {
  workspaceMode: WorkspaceMode
  workspaceStatus: {
    tone: WorkspaceTone
    message: string
  }
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  activeAsset: MapAssetSummary | null
  mapDocument: MapDocument | null
  pathLabel: string
  hoverInfo: TileHoverInfo | null
}

export default function StatusBar({
  workspaceMode,
  workspaceStatus,
  directoryInfo,
  mapAssets,
  activeAsset,
  mapDocument,
  pathLabel,
  hoverInfo,
}: StatusBarProps) {
  const copy = useEditorCopy()
  const xnbCount = mapAssets.filter((asset) => asset.format === 'xnb').length
  const statusMessage = workspaceStatus.message || copy.statusTone[workspaceStatus.tone]
  const hoverSummary = hoverInfo
    ? `${hoverInfo.tileX}, ${hoverInfo.tileY} | ${copy.common.layer}: ${hoverInfo.layerName ?? copy.common.none} | ${copy.common.gid}: ${hoverInfo.gid ?? copy.common.none}`
    : ''
  const hoverDetails = hoverInfo
    ? `${copy.common.tilesets}: ${hoverInfo.tilesetName ?? copy.common.none} | ${copy.rightDock.objectCount}: ${hoverInfo.objectHits.length}`
    : ''

  return (
    <footer className="status-bar" role="contentinfo">
      <div className="status-bar-group status-bar-group-primary" role="group" aria-label={copy.rightDock.workspaceStatus}>
        <div
          className={cx(
            'status-bar-indicator',
            directoryInfo ? 'status-bar-indicator-ready text-[var(--success)]' : 'status-bar-indicator-warning text-[var(--warning)]',
          )}
        >
          {directoryInfo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
          <span>{directoryInfo ? copy.statusBar.pathValid : copy.statusBar.pathMissing}</span>
        </div>

        <div className="status-bar-item">
          <FolderSearch className="h-3.5 w-3.5" />
          <span className="status-bar-label">{copy.statusBar.scanned}</span>
          <span className="status-bar-value">{xnbCount} XNB</span>
        </div>

        <span className={cx('status-pill status-pill-compact', `status-pill-${workspaceStatus.tone}`)}>{statusMessage}</span>
      </div>

      <div className="status-bar-divider" aria-hidden="true" />

      <div className="status-bar-group status-bar-group-context" role="group" aria-label={copy.rightDock.projectFacts}>
        <div className="status-bar-item status-bar-item-wide">
          <span className="status-bar-label">{copy.center.activeScene}</span>
          <span className="status-bar-value">{mapDocument?.name ?? activeAsset?.name ?? copy.common.none}</span>
        </div>
        <div className="status-bar-item status-bar-item-wide" title={pathLabel}>
          <span className="status-bar-label">{copy.common.path}</span>
          <span className="status-bar-value">{pathLabel}</span>
        </div>
      </div>

      {workspaceMode === 'map' && hoverInfo ? (
        <>
          <div className="status-bar-divider" aria-hidden="true" />
          <div className="status-bar-group status-bar-group-hover" role="group" aria-label={copy.rightDock.hoverProbe}>
            <div className="status-bar-item status-bar-item-wide" title={hoverSummary}>
              <span className="status-bar-label">{copy.statusBar.hover}</span>
              <span className="status-bar-value">{hoverSummary}</span>
            </div>
            <div className="status-bar-item">
              <span className="status-bar-label">{copy.statusBar.coordinates}</span>
              <span className="status-bar-value">
                X {hoverInfo.pixelX} Y {hoverInfo.pixelY}
              </span>
            </div>
            <div className="status-bar-item status-bar-item-wide" title={hoverDetails}>
              <span className="status-bar-label">{copy.common.tilesets}</span>
              <span className="status-bar-value">
                {hoverInfo.tilesetName ?? copy.common.none} | {copy.rightDock.objectCount}: {hoverInfo.objectHits.length}
              </span>
            </div>
          </div>
        </>
      ) : null}
    </footer>
  )
}
