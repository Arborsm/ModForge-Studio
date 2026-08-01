import { Eraser, Grid3X3, Hand, MousePointer2, Paintbrush, PaintBucket, Pipette, Scan } from 'lucide-react'
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
 * Tool switching bar for the map editor canvas. Painting/navigation tools are
 * core editing surfaces available in every session mode, so this toolbar does
 * not take capability gates; management surfaces live in the layers panel and
 * inspector.
 */
export function MapAssetEditorToolbar({
  tool,
  paletteSelection,
  onToolChange,
}: {
  tool: AssetTool
  paletteSelection: MapTilesetPaletteSelection | null
  onToolChange: (tool: AssetTool) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor
  return (
    <div className="map-asset-tools" role="toolbar" aria-label={copy.tools}>
      {TOOLS.map(({ id, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={cx('icon-button', tool === id && 'is-active')}
          aria-label={copy.toolLabels[id]}
          title={copy.toolLabels[id]}
          aria-pressed={tool === id}
          disabled={(id === 'brush' || id === 'stamp' || id === 'fill') && !paletteSelection}
          onClick={() => onToolChange(id)}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
