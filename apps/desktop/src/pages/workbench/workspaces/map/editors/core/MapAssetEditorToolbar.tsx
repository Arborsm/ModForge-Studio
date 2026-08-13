import {
  Eraser,
  Grid2X2,
  Grid3X3,
  Hand,
  MousePointer2,
  Paintbrush,
  PaintBucket,
  PanelRightClose,
  PanelRightOpen,
  Pipette,
  Scan,
} from 'lucide-react'
import type { MapTilesetPaletteSelection } from '@entities/map'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { AssetTool } from './useMapDocumentEditor'

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
 * core editing surfaces available in every session mode, so this toolbar does
 * not take capability gates; management surfaces live in the layers panel and
 * inspector. In the asset editor it floats over the canvas; the optional
 * palette toggle (and its separator) is rendered only when both palette
 * control props are provided, so patch-tiles sessions keep the plain rail.
 * The overlay toggle is rendered the same way and, while the overlay mode is
 * on, every tool button is disabled — the overlay owns the canvas interaction
 * exclusively (painting rules) until it is turned off again.
 */
export function MapAssetEditorToolbar({
  tool,
  paletteSelection,
  onToolChange,
  paletteOpen = false,
  onTogglePalette,
  overlayActive = false,
  onToggleOverlay,
}: {
  tool: AssetTool
  paletteSelection: MapTilesetPaletteSelection | null
  onToolChange: (tool: AssetTool) => void
  /** Whether the tileset palette panel is open; drives the toggle's active state. */
  paletteOpen?: boolean
  /** Toggles the tileset palette panel; when omitted the palette toggle is hidden. */
  onTogglePalette?: () => void
  /** Whether the cell-rule overlay mode is active; disables the painting tools. */
  overlayActive?: boolean
  /** Toggles the cell-rule overlay mode; when omitted the overlay toggle is hidden. */
  onToggleOverlay?: () => void
}) {
  const authoringCopy = useMapAuthoringCopy()
  const copy = authoringCopy.assetEditor
  const editorShell = authoringCopy.editorShell
  return (
    <div className="map-asset-tools" role="toolbar" aria-label={copy.tools} data-map-overlay-active={overlayActive || undefined}>
      {TOOLS.map(({ id, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={cx('icon-button', tool === id && 'is-active')}
          aria-label={copy.toolLabels[id]}
          title={copy.toolLabels[id]}
          aria-pressed={tool === id}
          disabled={overlayActive || ((id === 'brush' || id === 'stamp' || id === 'fill') && !paletteSelection)}
          onClick={() => onToolChange(id)}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
      {onToggleOverlay ? (
        <>
          <span className="map-asset-tools-sep" />
          <button
            type="button"
            className={cx('icon-button', overlayActive && 'is-active')}
            aria-label={copy.overlayToggle}
            title={copy.overlayToggle}
            aria-pressed={overlayActive}
            data-map-overlay-toggle="true"
            onClick={onToggleOverlay}
          >
            <Grid2X2 className="h-4 w-4" />
          </button>
        </>
      ) : null}
      {onTogglePalette ? (
        <>
          <span className="map-asset-tools-sep" />
          <button
            type="button"
            className={cx('icon-button', paletteOpen && 'is-active')}
            aria-label={paletteOpen ? editorShell.hidePalette : editorShell.showPalette}
            title={paletteOpen ? editorShell.hidePalette : editorShell.showPalette}
            aria-pressed={paletteOpen}
            onClick={onTogglePalette}
          >
            {paletteOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </>
      ) : null}
    </div>
  )
}
