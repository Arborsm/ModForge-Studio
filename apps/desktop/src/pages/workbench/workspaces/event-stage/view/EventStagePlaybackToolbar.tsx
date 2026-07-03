import { Grid2x2, Maximize, Pause, Play, RotateCcw, Route, Settings2, SkipForward } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEventStageCopy, useEditorCopy, useSettingsMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'

type EventStagePlaybackToolbarProps = {
  autoPlay: boolean
  canPlay: boolean
  showGrid: boolean
  showPaths: boolean
  gridDisabled?: boolean
  pathsDisabled?: boolean
  onStep: () => void
  onTogglePlay: () => void
  onReset: () => void
  onResetView: () => void
  onToggleGrid: () => void
  onTogglePaths: () => void
  extraControls?: ReactNode
}

export function EventStagePlaybackToolbar({
  autoPlay,
  canPlay,
  showGrid,
  showPaths,
  gridDisabled = false,
  pathsDisabled = false,
  onStep,
  onTogglePlay,
  onReset,
  onResetView,
  onToggleGrid,
  onTogglePaths,
  extraControls,
}: EventStagePlaybackToolbarProps) {
  const labels = useEventStageCopy()
  const viewportLabels = useEditorCopy().viewportLabels
  const settingsCopy = useSettingsMenuCopy()

  return (
    <div
      className="workspace-viewport-toolbar"
      role="toolbar"
      aria-label={labels.scene}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="workspace-viewport-toolbar-group">
        <button
          type="button"
          className="workspace-viewport-toolbar-icon-button"
          onClick={onStep}
          title={labels.step}
          aria-label={labels.step}
          disabled={!canPlay}
        >
          <SkipForward className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cx('workspace-viewport-toolbar-icon-button', autoPlay && 'workspace-viewport-toolbar-button-active')}
          onClick={onTogglePlay}
          title={autoPlay ? labels.pause : labels.play}
          aria-label={autoPlay ? labels.pause : labels.play}
          aria-pressed={autoPlay}
          disabled={!canPlay}
        >
          {autoPlay ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="workspace-viewport-toolbar-icon-button"
          onClick={onReset}
          title={labels.reset}
          aria-label={labels.reset}
          disabled={!canPlay}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="workspace-viewport-toolbar-group workspace-viewport-toolbar-group-push">
        <button
          type="button"
          className="workspace-viewport-toolbar-icon-button"
          title={viewportLabels.fitMap}
          aria-label={viewportLabels.fitMap}
          onClick={onResetView}
        >
          <Maximize className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cx('workspace-viewport-toolbar-icon-button', showGrid && 'workspace-viewport-toolbar-button-active')}
          title={labels.toggleGrid}
          aria-label={labels.toggleGrid}
          aria-pressed={showGrid}
          disabled={gridDisabled}
          onClick={onToggleGrid}
        >
          <Grid2x2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={cx('workspace-viewport-toolbar-icon-button', showPaths && 'workspace-viewport-toolbar-button-active')}
          title={labels.showPathsLayer}
          aria-label={labels.showPathsLayer}
          aria-pressed={showPaths}
          disabled={pathsDisabled}
          onClick={onTogglePaths}
        >
          <Route className="h-4 w-4" />
        </button>
        {extraControls ? (
          <details className="workspace-viewport-toolbar-more">
            <summary
              className="workspace-viewport-toolbar-icon-button"
              title={settingsCopy.title}
              aria-label={settingsCopy.title}
              onClick={(event) => event.stopPropagation()}
            >
              <Settings2 className="h-4 w-4" />
            </summary>
            <div className="workspace-viewport-toolbar-menu">{extraControls}</div>
          </details>
        ) : null}
      </div>
    </div>
  )
}
