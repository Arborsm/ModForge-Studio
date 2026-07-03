import { useEditorCopy } from '@locales/provider'
import { getWorkspaceModeLabel } from '@locales/api'
import { PanelFrame } from '@shared/ui/PanelFrame'
import type { ProjectPanelProps } from '../common/leftShared'

export function ProjectPanel({
  locale,
  workspaceMode,
  desktopHost,
  gameDirectory,
  onGameDirectoryChange,
  onChooseDirectory,
  onUseKnownPath,
  onValidateOnly,
  onScanAndOpenTown,
  directoryInfo,
  mapAssets,
  activeMapId,
  sceneLabel,
}: ProjectPanelProps) {
  const copy = useEditorCopy()
  const activeAssetName = sceneLabel ?? mapAssets.find((item) => item.id === activeMapId)?.name ?? copy.common.none

  return (
    <PanelFrame title={copy.leftDock.project} subtitle={copy.leftDock.projectSubtitle} hideHeader>
      <div className="space-y-2.5 p-2.5">
        <div className="grid gap-1.5">
          <label className="text-[10px] font-semibold tracking-[0.16em] text-[var(--text-secondary)] uppercase">
            {copy.leftDock.gameDirectory}
          </label>
          <input
            className="control-input h-9"
            value={gameDirectory}
            onChange={(event) => onGameDirectoryChange(event.target.value)}
            placeholder={copy.leftDock.directoryPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="control-button h-8" onClick={onChooseDirectory}>
            {copy.controls.browse}
          </button>
          <button type="button" className="control-button h-8" onClick={onUseKnownPath}>
            {copy.controls.useKnownPath}
          </button>
          <button type="button" className="control-button h-8" onClick={onValidateOnly}>
            {copy.controls.validateOnly}
          </button>
          <button type="button" className="control-button control-button-primary h-8" onClick={onScanAndOpenTown}>
            {copy.controls.scanAndOpenTown}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <div className="metric-card compact-metric-card">
            <span className="metric-label">{copy.leftDock.hostMode}</span>
            <strong className="metric-value">{desktopHost ? copy.leftDock.desktopHost : copy.leftDock.browserHost}</strong>
          </div>
          <div className="metric-card compact-metric-card">
            <span className="metric-label">{copy.leftDock.preferredFormat}</span>
            <strong className="metric-value">{directoryInfo ? 'XNB' : copy.common.none}</strong>
          </div>
          <div className="metric-card compact-metric-card">
            <span className="metric-label">{copy.leftDock.detectedMaps}</span>
            <strong className="metric-value">{mapAssets.length || directoryInfo?.mapCount || 0}</strong>
          </div>
          <div className="metric-card compact-metric-card">
            <span className="metric-label">{copy.leftDock.sceneFocus}</span>
            <strong className="metric-value">
              {workspaceMode === 'map' ? activeAssetName : getWorkspaceModeLabel(locale, copy, workspaceMode)}
            </strong>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2.5 py-1.5">
          <div className="kv-row compact-kv-row">
            <span>{copy.leftDock.installState}</span>
            <span>{directoryInfo ? copy.statusTone.ready : copy.statusTone.idle}</span>
          </div>
          <div className="kv-row compact-kv-row">
            <span>{copy.leftDock.preferredMaps}</span>
            <span>{directoryInfo?.mapsPath ?? copy.common.none}</span>
          </div>
        </div>
      </div>
    </PanelFrame>
  )
}
