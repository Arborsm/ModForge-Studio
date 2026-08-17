import { Eraser, Grid2X2, Grid3X3, Hand, MousePointer2, Paintbrush, PaintBucket, Pipette, Scan } from 'lucide-react'
import type { MapTilesetPaletteSelection } from '@entities/map'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { shortcutDescriptionForTool } from '../../model/mapShortcuts'
import type { AssetTool, MapEditorCapabilities } from './useMapDocumentEditor'

const TOOLS: Array<{ id: AssetTool; icon: typeof MousePointer2 }> = [
  { id: 'inspect', icon: MousePointer2 },
  { id: 'brush', icon: Paintbrush },
  { id: 'stamp', icon: Grid3X3 },
  { id: 'fill', icon: PaintBucket },
  { id: 'erase', icon: Eraser },
  { id: 'rectangle', icon: Scan },
  { id: 'eyedropper', icon: Pipette },
  { id: 'hand', icon: Hand },
]

/**
 * Tool switching rail for the map editor canvas. Painting/navigation tools are
 * core editing surfaces available in every session mode. The rectangle tool
 * requires `flipRotate` capability (it produces a stamp transform) and is
 * hidden when that capability is off, e.g. in the patch-tiles session. In the
 * asset editor it floats over the canvas; the optional palette toggle (and its
 * separator) is rendered only when both palette control props are provided, so
 * patch-tiles sessions keep the plain rail. The overlay toggle is rendered the
 * same way and, while the overlay mode is on, every tool button is disabled —
 * the overlay owns the canvas interaction exclusively (painting rules) until
 * it is turned off again.
 */
export function MapAssetEditorToolbar({
  tool,
  paletteSelection,
  onToolChange,
  overlayActive = false,
  onToggleOverlay,
  capabilities,
}: {
  tool: AssetTool
  paletteSelection: MapTilesetPaletteSelection | null
  onToolChange: (tool: AssetTool) => void
  /** Whether the cell-rule overlay mode is active; disables the painting tools. */
  overlayActive?: boolean
  /** Toggles the cell-rule overlay mode; when omitted the overlay toggle is hidden. */
  onToggleOverlay?: () => void
  /** Capability gates; when omitted all tools are shown (full asset editor mode). */
  capabilities?: MapEditorCapabilities
}) {
  const authoringCopy = useMapAuthoringCopy()
  const copy = authoringCopy.assetEditor
  const shortcutsCopy = authoringCopy.shortcuts
  /** Resolves the disabled reason for a painting tool, or undefined when the tool is available. */
  function toolDisabledReason(id: AssetTool): string | undefined {
    if (overlayActive) return copy.toolDisabledOverlayActive
    if ((id === 'brush' || id === 'stamp' || id === 'fill') && !paletteSelection) return copy.toolDisabledNoPalette
    return undefined
  }
  /** Whether a tool should be visible given the current capability gates. */
  function toolVisible(id: AssetTool): boolean {
    if (!capabilities) return true
    // The rectangle tool produces a stamp transform; hide it when flipRotate is off.
    if (id === 'rectangle' && !capabilities.flipRotate) return false
    return true
  }
  return (
    <div className="map-asset-tools" role="toolbar" aria-label={copy.tools} data-map-overlay-active={overlayActive || undefined}>
      {TOOLS.filter(({ id }) => toolVisible(id)).map(({ id, icon: Icon }) => {
        const disabledReason = toolDisabledReason(id)
        const disabled = disabledReason !== undefined
        const shortcutHint = shortcutDescriptionForTool(id, shortcutsCopy)
        const baseTitle = copy.toolLabels[id]
        const title = disabled ? `${baseTitle} — ${disabledReason}` : shortcutHint ? `${baseTitle} (${shortcutHint})` : baseTitle
        return (
          <button
            key={id}
            type="button"
            className={cx('icon-button', tool === id && 'is-active')}
            aria-label={baseTitle}
            title={title}
            aria-pressed={tool === id}
            disabled={disabled}
            onClick={() => onToolChange(id)}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
      {onToggleOverlay ? (
        <>
          <span className="map-asset-tools-sep" />
          <button
            type="button"
            className={cx('icon-button', overlayActive && 'is-active')}
            aria-label={copy.overlayToggle}
            title={copy.overlayToggleHint}
            aria-pressed={overlayActive}
            data-map-overlay-toggle="true"
            onClick={onToggleOverlay}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  )
}
