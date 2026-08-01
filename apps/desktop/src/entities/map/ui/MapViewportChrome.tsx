import * as ContextMenu from '@radix-ui/react-context-menu'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { useEditorCopy } from '@locales/provider'
import type { ThemeMode } from '@locales/api'
import type { TileHoverInfo } from '@entities/map'
import type { MapDocument, MapLayer, MapObjectGroup } from '@entities/map'
import { rgbaFromHex } from './mapViewportHelpers'

type MapViewportEmptyStateProps = {
  theme: ThemeMode
  accentColor: string
  viewportBackdropStyle: CSSProperties
}

export function MapViewportEmptyState({ theme, accentColor, viewportBackdropStyle }: MapViewportEmptyStateProps) {
  const labels = useEditorCopy().viewportLabels

  return (
    <div className="panel-canvas relative h-full" style={viewportBackdropStyle}>
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === 'light'
              ? `radial-gradient(circle at center, ${rgbaFromHex(accentColor, 0.06)}, transparent 38%)`
              : `radial-gradient(circle at center, ${rgbaFromHex(accentColor, 0.08)}, transparent 38%)`,
        }}
      />
      <div className="relative flex h-full items-center justify-center p-10">
        <div className="panel-overlay-card max-w-md px-6 py-5 text-center">
          <p className="text-xs font-semibold tracking-[0.24em] text-(--text-tertiary) uppercase">{labels.fitMap}</p>
          <p className="mt-3 text-base font-semibold text-(--text-primary)">{labels.loadPrompt}</p>
        </div>
      </div>
    </div>
  )
}

type MapViewportStatsChipsProps = {
  mapDocument: MapDocument
  tilesetImageCount: number
  visibleLayers: MapLayer[]
  visibleObjectGroups: MapObjectGroup[]
  zoom: number
}

export function MapViewportStatsChips({
  mapDocument,
  tilesetImageCount,
  visibleLayers,
  visibleObjectGroups,
  zoom,
}: MapViewportStatsChipsProps) {
  const labels = useEditorCopy().viewportLabels

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2">
      <span className="dock-chip">
        {mapDocument.width} x {mapDocument.height} {labels.tilesLabel}
      </span>
      <span className="dock-chip">{labels.tilesetsLoadedLabel(tilesetImageCount, mapDocument.tilesets.length)}</span>
      <span className="dock-chip">{labels.layersVisibleLabel(visibleLayers.length, mapDocument.layers.length)}</span>
      <span className="dock-chip">{labels.objectGroupsVisibleLabel(visibleObjectGroups.length, mapDocument.objectGroups.length)}</span>
      <span className="dock-chip">{labels.zoomLabel(zoom)}</span>
    </div>
  )
}

export function MapViewportImageError({ error }: { error: string }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-lg border border-[color-mix(in_srgb,var(--danger)_32%,transparent)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-xs text-(--danger)">
      {error}
    </div>
  )
}

type MapViewportCanvasLayersProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  foregroundCanvasRef: RefObject<HTMLCanvasElement | null>
  viewportSize: { width: number; height: number }
  foregroundLayerCount: number
}

export function MapViewportCanvasLayers({
  canvasRef,
  foregroundCanvasRef,
  viewportSize,
  foregroundLayerCount,
}: MapViewportCanvasLayersProps) {
  const visible = viewportSize.width > 0 && viewportSize.height > 0

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-1 [image-rendering:pixelated]"
        style={{
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          display: visible ? 'block' : 'none',
        }}
      />

      <canvas
        ref={foregroundCanvasRef}
        className="pointer-events-none absolute inset-0 z-3 [image-rendering:pixelated]"
        style={{
          width: `${viewportSize.width}px`,
          height: `${viewportSize.height}px`,
          display: visible && foregroundLayerCount > 0 ? 'block' : 'none',
        }}
      />
    </>
  )
}

type MapViewportContextMenuProps = {
  viewportContent: ReactNode
  contextMenuHover: TileHoverInfo | null
  contextMenuExtraItems?: ReactNode | ((hover: TileHoverInfo | null) => ReactNode)
  onOpen: () => void
  onFitZoom: () => void
  onOneToOneZoom: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onCenterView: () => void
  onResetPan: () => void
  onExportPng?: () => void
  onAddObjectHere?: (tileX: number, tileY: number) => void
}

export function MapViewportContextMenu({
  viewportContent,
  contextMenuHover,
  contextMenuExtraItems,
  onOpen,
  onFitZoom,
  onOneToOneZoom,
  onZoomIn,
  onZoomOut,
  onCenterView,
  onResetPan,
  onExportPng,
  onAddObjectHere,
}: MapViewportContextMenuProps) {
  const labels = useEditorCopy().viewportLabels

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        if (open) {
          onOpen()
        }
      }}
    >
      <ContextMenu.Trigger asChild>{viewportContent}</ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="context-menu-content" collisionPadding={12}>
          <ContextMenu.Item className="context-menu-item" onSelect={onFitZoom}>
            {labels.fitMap}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={onOneToOneZoom}>
            {labels.setOneToOne}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={onZoomIn}>
            {labels.zoomIn}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={onZoomOut}>
            {labels.zoomOut}
          </ContextMenu.Item>
          <ContextMenu.Separator className="context-menu-separator" />
          <ContextMenu.Item className="context-menu-item" onSelect={onCenterView}>
            {labels.centerView}
          </ContextMenu.Item>
          <ContextMenu.Item className="context-menu-item" onSelect={onResetPan}>
            {labels.resetPan}
          </ContextMenu.Item>
          {onExportPng ? (
            <ContextMenu.Item className="context-menu-item" onSelect={onExportPng}>
              {labels.exportPng}
            </ContextMenu.Item>
          ) : null}
          {onAddObjectHere ? (
            <>
              <ContextMenu.Separator className="context-menu-separator" />
              <ContextMenu.Item
                className="context-menu-item"
                disabled={!contextMenuHover}
                onSelect={() => {
                  const hover = contextMenuHover
                  if (hover) {
                    onAddObjectHere(hover.tileX, hover.tileY)
                  }
                }}
              >
                {labels.addObjectHere}
                {contextMenuHover ? ` (${contextMenuHover.tileX}, ${contextMenuHover.tileY})` : ''}
              </ContextMenu.Item>
            </>
          ) : null}
          {typeof contextMenuExtraItems === 'function' ? contextMenuExtraItems(contextMenuHover) : contextMenuExtraItems}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
