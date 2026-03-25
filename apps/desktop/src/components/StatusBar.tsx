import { CheckCircle2, FolderSearch, TriangleAlert } from 'lucide-react'
import type { TileHoverInfo } from './MapViewport'
import type { EditorCopy, WorkspaceTone } from '../lib/editor-shell'
import type { GameDirectoryInfo, MapAssetSummary } from '../lib/desktop'
import type { MapDocument } from '../lib/maps/types'

type StatusBarProps = {
  copy: EditorCopy
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
  copy,
  workspaceStatus,
  directoryInfo,
  mapAssets,
  activeAsset,
  mapDocument,
  pathLabel,
  hoverInfo,
}: StatusBarProps) {
  const tmxCount = mapAssets.filter((asset) => asset.format === 'tmx').length
  const xnbCount = mapAssets.filter((asset) => asset.format === 'xnb').length
  const hoverSummary = hoverInfo
    ? `${hoverInfo.tileX}, ${hoverInfo.tileY} | ${copy.common.layer}: ${hoverInfo.layerName ?? copy.common.none} | ${copy.common.gid}: ${hoverInfo.gid ?? copy.common.none}`
    : copy.common.none
  const hoverDetails = hoverInfo
    ? `${copy.common.tilesets}: ${hoverInfo.tilesetName ?? copy.common.none} | ${copy.rightDock.objectCount}: ${hoverInfo.objectHits.length}`
    : `${copy.common.tilesets}: ${copy.common.none}`

  return (
    <footer className="flex h-8 items-center justify-between gap-4 border-t border-[var(--border-color)] bg-[var(--bg-app)] px-3 text-[11px] text-[var(--text-secondary)]">
      <div className="flex min-w-0 items-center gap-4 overflow-hidden">
        <div className={`flex items-center gap-1.5 ${directoryInfo ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
          {directoryInfo ? <CheckCircle2 className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
          <span>{directoryInfo ? copy.statusBar.pathValid : copy.statusBar.pathMissing}</span>
        </div>

        <div className="flex items-center gap-1.5 truncate">
          <FolderSearch className="h-3.5 w-3.5" />
          <span className="truncate">
            {copy.statusBar.scanned}: {tmxCount} TMX | {xnbCount} XNB
          </span>
        </div>

        <div className="truncate">{workspaceStatus.message || copy.statusTone[workspaceStatus.tone]}</div>
      </div>

      <div className="flex min-w-0 items-center gap-4 overflow-hidden font-mono">
        <span className="truncate">
          {copy.center.activeScene}: {mapDocument?.name ?? activeAsset?.name ?? copy.common.none}
        </span>
        <span className="truncate" title={pathLabel}>
          {copy.common.path}: {pathLabel}
        </span>
        <span className="truncate" title={hoverSummary}>
          {copy.statusBar.hover}: {hoverSummary}
        </span>
        <span>
          {copy.statusBar.coordinates}: X {hoverInfo?.pixelX ?? 0} Y {hoverInfo?.pixelY ?? 0}
        </span>
        <span className="truncate" title={hoverDetails}>
          {hoverDetails}
        </span>
      </div>
    </footer>
  )
}
