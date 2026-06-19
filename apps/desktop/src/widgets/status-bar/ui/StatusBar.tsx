import { CheckCircle2, FolderSearch, TriangleAlert } from 'lucide-react'
import type { GameDirectoryInfo, MapAssetSummary } from '@shared/contracts'
import type { TileHoverInfo } from '@shared/contracts'
import type { AppMode, LauncherPage, WorkspaceMode, WorkspaceTone } from '@locales/api'
import type { MapDocument } from '@shared/contracts'
import { cx } from '@shared/lib/cx'
import { useEditorCopy } from '@locales/provider'

type StatusBarProps = {
  appMode: AppMode
  launcherPage: LauncherPage
  workspaceMode: WorkspaceMode
  workspaceViewMode?: 'edit' | 'preview'
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
  eventName?: string | null
  eventPreconditions?: string[]
  eventCommandCount?: number
  eventActorCount?: number
  currentEventCommandId?: string | null
  patchName?: string | null
  scriptLength?: number
  isModified?: boolean
}

export default function StatusBar({
  appMode,
  launcherPage,
  workspaceMode,
  workspaceViewMode = 'preview',
  workspaceStatus,
  directoryInfo,
  mapAssets,
  activeAsset,
  mapDocument,
  pathLabel,
  hoverInfo,
  eventName,
  eventPreconditions,
  eventCommandCount,
  eventActorCount,
  currentEventCommandId,
  patchName,
  scriptLength,
  isModified,
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

  if (appMode === 'launcher') {
    return (
      <footer className="status-bar" role="contentinfo">
        <div className="status-bar-group status-bar-group-primary" role="group" aria-label={copy.shell.modeLabel}>
          <span className="status-pill status-pill-compact status-pill-ready">{copy.shell.launcher}</span>
          <div className="status-bar-item">
            <span className="status-bar-label">{copy.launcher.navigation}</span>
            <span className="status-bar-value">{copy.launcher.pages[launcherPage]}</span>
          </div>
        </div>
      </footer>
    )
  }

  // ─── Edit Mode Status Bar ──────────────────────────────────────────────
  if (workspaceViewMode === 'edit') {
    const preconditions = eventPreconditions?.slice(1).join(' / ') ?? ''
    const selectedCmdIndex = currentEventCommandId ? currentEventCommandId.replace(/^cmd:/u, '') : ''
    const hasEditorData = Boolean(patchName || eventName)

    return (
      <footer className="status-bar" role="contentinfo">
        {/* Left: Mode + Identity */}
        <div className="status-bar-group status-bar-group-primary" role="group" aria-label={copy.statusBar.design}>
          <span className="status-pill status-pill-compact bg-(--accent) text-white">{copy.statusBar.design}</span>
          {patchName && (
            <div className="status-bar-item status-bar-item-wide">
              <span className="status-bar-label">Patch</span>
              <span className="status-bar-value">{patchName}</span>
            </div>
          )}
          {eventName && (
            <div className="status-bar-item status-bar-item-wide">
              <span className="status-bar-label">{copy.statusBar.event}</span>
              <span className="status-bar-value" title={preconditions || undefined}>
                {eventName}
                {preconditions ? ` · ${preconditions}` : ''}
              </span>
            </div>
          )}
          {!hasEditorData && <span className="text-[10px] text-(--text-tertiary)">{copy.statusBar.noEditItem}</span>}
        </div>

        {hasEditorData && (
          <>
            <div className="status-bar-divider" aria-hidden="true" />

            {/* Center: Edit Statistics */}
            <div className="status-bar-group status-bar-group-context" role="group" aria-label={copy.statusBar.event}>
              <div className="status-bar-item">
                <span className="status-bar-label">{copy.statusBar.commands}</span>
                <span className="status-bar-value">{eventCommandCount ?? 0}</span>
              </div>
              <div className="status-bar-item">
                <span className="status-bar-label">{copy.statusBar.actors}</span>
                <span className="status-bar-value">{eventActorCount ?? 0}</span>
              </div>
              {selectedCmdIndex && (
                <div className="status-bar-item">
                  <span className="status-bar-label">{copy.statusBar.selectedCommand}</span>
                  <span className="status-bar-value">#{selectedCmdIndex}</span>
                </div>
              )}
              {scriptLength !== undefined && (
                <div className="status-bar-item">
                  <span className="status-bar-label">Chars</span>
                  <span className="status-bar-value">{scriptLength}</span>
                </div>
              )}
            </div>
          </>
        )}

        {isModified && (
          <>
            <div className="status-bar-divider" aria-hidden="true" />
            <div className="status-bar-group status-bar-group-context">
              <span className="status-pill status-pill-compact status-pill-busy">{copy.statusBar.modified}</span>
            </div>
          </>
        )}
      </footer>
    )
  }

  // ─── Preview / Browse Mode Status Bar ──────────────────────────────────
  return (
    <footer className="status-bar" role="contentinfo">
      <div className="status-bar-group status-bar-group-primary" role="group" aria-label={copy.rightDock.workspaceStatus}>
        <div
          className={cx(
            'status-bar-indicator',
            directoryInfo ? 'status-bar-indicator-ready text-(--success)' : 'status-bar-indicator-warning text-(--warning)',
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
