/**
 * @file Map viewport canvas drawing routines: renders tiles, objects, overlays,
 * warp routes, and inspector highlights onto the viewport's 2D canvas context.
 */

import { getObjectInteractionTag, isLightMarkerObject } from '@entities/map'
import type { ThemeMode } from '@locales/api'
import type {
  CellOverlayCell,
  MapAtlasPlacement,
  MapAtlasPortal,
  MapAtlasWarpRoute,
  MapDocument,
  MapInspectorHighlight,
  MapObject,
  MapObjectGroup,
} from '@entities/map'
import type { MapContentBounds } from '../lib/mapContentBounds'
import { CELL_OVERLAY_COLORS, CELL_OVERLAY_STROKE_COLORS, DAY_NIGHT_HIGHLIGHT_COLOR, DAY_NIGHT_HIGHLIGHT_FILL } from '../lib/cellProperties'
import {
  drawAtlasPortal,
  drawWarpRoute,
  getCanvasRenderScale,
  getGroupColor,
  getObjectBounds,
  getObjectDisplayLabel,
} from './mapViewportHelpers'

/** TileData rule objects whose rectangle markers overlay-driven editors hide from the canvas. */
function isRuleTileDataObject(object: MapObject) {
  return object.name === 'TileData' && !isLightMarkerObject(object)
}

export type MapCanvasDrawParams = {
  canvas: HTMLCanvasElement
  rasterCanvas: HTMLCanvasElement | null
  mapDocument: MapDocument | null
  viewportSize: { width: number; height: number }
  directFitDisplayRect: { left: number; top: number; width: number; height: number } | null
  fitBounds: MapContentBounds | null
  viewportCanvasRect: { left: number; top: number; width: number; height: number }
  zoom: number
  mapDisplayOffset: { left: number; top: number }
  canvasLogicalSize: { width: number; height: number }
  theme: ThemeMode
  accentColor: string
  showGrid: boolean
  hideRuleTileDataObjects: boolean
  cellOverlay: { layerId: number; width: number; height: number; cells: Record<number, CellOverlayCell> } | null | undefined
  dayNightHighlight: { width: number; height: number; cells: Array<{ x: number; y: number }> } | null | undefined
  inspectorHighlight: MapInspectorHighlight | null
  visibleObjectGroups: MapObjectGroup[]
  atlasPlacements: MapAtlasPlacement[]
  atlasPortals: MapAtlasPortal[]
  atlasWarpRoutes: MapAtlasWarpRoute[]
  highlightedObject: { group: MapObjectGroup; object: MapObject } | null
}

/**
 * Draws the main map viewport canvas: background fill, rasterized tile layers,
 * grid, cell-rule overlay, day/night highlight, object markers, atlas portals,
 * warp routes and highlighted objects. Extracted from MapViewport so the
 * animation rAF loop can invoke it directly without triggering React renders.
 */
export function drawMapCanvas(params: MapCanvasDrawParams) {
  const {
    canvas,
    rasterCanvas,
    mapDocument,
    viewportSize,
    directFitDisplayRect,
    fitBounds,
    viewportCanvasRect,
    zoom,
    mapDisplayOffset,
    canvasLogicalSize,
    theme,
    accentColor,
    showGrid,
    hideRuleTileDataObjects,
    cellOverlay,
    dayNightHighlight,
    inspectorHighlight,
    visibleObjectGroups,
    atlasPlacements,
    atlasPortals,
    atlasWarpRoutes,
    highlightedObject,
  } = params

  if (!mapDocument || !viewportSize.width || !viewportSize.height) {
    return
  }

  const context = canvas.getContext('2d')
  if (!context) {
    return
  }

  const pixelRatio =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1
  const logicalWidth = Math.max(1, viewportSize.width)
  const logicalHeight = Math.max(1, viewportSize.height)
  const renderScale = getCanvasRenderScale(logicalWidth, logicalHeight, pixelRatio)
  const width = Math.max(1, Math.ceil(logicalWidth * pixelRatio * renderScale))
  const height = Math.max(1, Math.ceil(logicalHeight * pixelRatio * renderScale))
  const worldLeft = directFitDisplayRect && fitBounds ? fitBounds.x : viewportCanvasRect.left / zoom
  const worldTop = directFitDisplayRect && fitBounds ? fitBounds.y : viewportCanvasRect.top / zoom
  const worldWidth = directFitDisplayRect && fitBounds ? fitBounds.width : viewportCanvasRect.width / zoom
  const worldHeight = directFitDisplayRect && fitBounds ? fitBounds.height : viewportCanvasRect.height / zoom

  canvas.width = width
  canvas.height = height

  const canvasFill = theme === 'light' ? '#f8fafc' : '#12151c'
  const overlayLabelFill = theme === 'light' ? '#ffffff' : '#080a10'
  const overlayLabelText = theme === 'light' ? '#101724' : '#eef4ff'
  const visibleMapLeft = directFitDisplayRect?.left ?? mapDisplayOffset.left + viewportCanvasRect.left
  const visibleMapTop = directFitDisplayRect?.top ?? mapDisplayOffset.top + viewportCanvasRect.top
  const visibleMapWidth = directFitDisplayRect?.width ?? viewportCanvasRect.width
  const visibleMapHeight = directFitDisplayRect?.height ?? viewportCanvasRect.height

  context.imageSmoothingEnabled = false
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, width, height)
  context.setTransform(pixelRatio * renderScale, 0, 0, pixelRatio * renderScale, 0, 0)
  context.save()
  context.beginPath()
  context.rect(visibleMapLeft, visibleMapTop, visibleMapWidth, visibleMapHeight)
  context.clip()
  context.fillStyle = canvasFill
  context.fillRect(visibleMapLeft, visibleMapTop, visibleMapWidth, visibleMapHeight)

  if (rasterCanvas && worldWidth > 0 && worldHeight > 0) {
    context.drawImage(
      rasterCanvas,
      worldLeft,
      worldTop,
      worldWidth,
      worldHeight,
      visibleMapLeft,
      visibleMapTop,
      visibleMapWidth,
      visibleMapHeight,
    )
  }

  if (showGrid) {
    const gridColor = theme === 'light' ? 'rgba(20, 28, 40, 0.22)' : 'rgba(244, 244, 245, 0.18)'
    const hairline = 1 / Math.max(pixelRatio * renderScale, 1)
    const tileWidth = mapDocument.tileWidth * zoom
    const tileHeight = mapDocument.tileHeight * zoom

    context.fillStyle = gridColor

    for (
      let x = Math.max(tileWidth, Math.ceil(viewportCanvasRect.left / tileWidth) * tileWidth);
      x < viewportCanvasRect.left + viewportCanvasRect.width;
      x += tileWidth
    ) {
      context.fillRect(mapDisplayOffset.left + x - hairline / 2, visibleMapTop, hairline, visibleMapHeight)
    }

    for (
      let y = Math.max(tileHeight, Math.ceil(viewportCanvasRect.top / tileHeight) * tileHeight);
      y < viewportCanvasRect.top + viewportCanvasRect.height;
      y += tileHeight
    ) {
      context.fillRect(visibleMapLeft, mapDisplayOffset.top + y - hairline / 2, visibleMapWidth, hairline)
    }
  }
  context.restore()

  context.globalAlpha = 1
  context.save()
  context.beginPath()
  context.rect(mapDisplayOffset.left, mapDisplayOffset.top, canvasLogicalSize.width, canvasLogicalSize.height)
  context.clip()
  context.translate(mapDisplayOffset.left, mapDisplayOffset.top)

  // Cell-rule overlay: colored fills for the active layer's cell properties,
  // each outlined by a solid rule-colored inner stroke so the four rules stay
  // readable at a glance over any tile art. Drawn under the object markers so
  // markers stay readable while painting. Tileset definition-level rules
  // (inherited from the tile's tileset, not painted on this map) render dimmer
  // and dashed so they read as shared rather than authored here.
  if (cellOverlay) {
    const tileWidth = mapDocument.tileWidth * zoom
    const tileHeight = mapDocument.tileHeight * zoom
    // 2 screen-pixel inner stroke (coordinates here are already zoom-scaled).
    const strokeWidth = 2 / Math.max(pixelRatio * renderScale, 1)
    // Dash period sized in the same scaled units as the stroke.
    const dash = 4 / Math.max(pixelRatio * renderScale, 1)
    context.lineWidth = strokeWidth
    for (const [indexKey, cell] of Object.entries(cellOverlay.cells)) {
      const index = Number(indexKey)
      if (!Number.isInteger(index) || cell.rule === 'walkable') continue
      const cellX = (index % cellOverlay.width) * tileWidth
      const cellY = Math.floor(index / cellOverlay.width) * tileHeight
      if (cell.tilesetDerived) {
        context.save()
        context.globalAlpha = 0.55
        context.setLineDash([dash, dash])
        context.fillStyle = CELL_OVERLAY_COLORS[cell.rule]
        context.fillRect(cellX, cellY, tileWidth, tileHeight)
        context.strokeStyle = CELL_OVERLAY_STROKE_COLORS[cell.rule]
        context.strokeRect(cellX + strokeWidth / 2, cellY + strokeWidth / 2, tileWidth - strokeWidth, tileHeight - strokeWidth)
        context.restore()
      } else {
        context.fillStyle = CELL_OVERLAY_COLORS[cell.rule]
        context.fillRect(cellX, cellY, tileWidth, tileHeight)
        context.strokeStyle = CELL_OVERLAY_STROKE_COLORS[cell.rule]
        context.strokeRect(cellX + strokeWidth / 2, cellY + strokeWidth / 2, tileWidth - strokeWidth, tileHeight - strokeWidth)
      }
    }
  }

  // Day/night swap highlight: purple dashed borders on cells with DayTiles/NightTiles.
  if (dayNightHighlight && dayNightHighlight.cells.length > 0) {
    const tileWidth = mapDocument.tileWidth * zoom
    const tileHeight = mapDocument.tileHeight * zoom
    const strokeWidth = 2 / Math.max(pixelRatio * renderScale, 1)
    const dash = 4 / Math.max(pixelRatio * renderScale, 1)
    context.save()
    context.lineWidth = strokeWidth
    context.setLineDash([dash, dash])
    context.strokeStyle = DAY_NIGHT_HIGHLIGHT_COLOR
    context.fillStyle = DAY_NIGHT_HIGHLIGHT_FILL
    for (const cell of dayNightHighlight.cells) {
      const cellX = cell.x * tileWidth
      const cellY = cell.y * tileHeight
      context.fillRect(cellX, cellY, tileWidth, tileHeight)
      context.strokeRect(cellX + strokeWidth / 2, cellY + strokeWidth / 2, tileWidth - strokeWidth, tileHeight - strokeWidth)
    }
    context.restore()
  }

  const inspectorObjectIds = inspectorHighlight && inspectorHighlight.objectIds.length > 0 ? new Set(inspectorHighlight.objectIds) : null

  for (const group of visibleObjectGroups) {
    const color = getGroupColor(group.name)

    for (const object of group.objects) {
      if (hideRuleTileDataObjects && isRuleTileDataObject(object)) {
        continue
      }
      const interactionTag = getObjectInteractionTag(object)
      const label = getObjectDisplayLabel(object)
      const bounds = getObjectBounds(object, 12 / zoom)
      const destinationX = bounds.x * zoom
      const destinationY = bounds.y * zoom
      const destinationWidth = bounds.width * zoom
      const destinationHeight = bounds.height * zoom
      const centerX = (bounds.x + bounds.width / 2) * zoom
      const centerY = (bounds.y + bounds.height / 2) * zoom
      const fillAlpha = interactionTag
        ? Math.max(0.22, Math.min(0.42, group.opacity * 0.42))
        : Math.max(0.12, Math.min(0.28, group.opacity * 0.24))
      const strokeAlpha = interactionTag
        ? Math.max(0.76, Math.min(0.98, group.opacity + 0.12))
        : Math.max(0.48, Math.min(0.82, group.opacity * 0.84))

      context.save()
      context.strokeStyle = color
      context.fillStyle = color
      context.globalAlpha = fillAlpha
      context.fillRect(destinationX, destinationY, destinationWidth, destinationHeight)
      context.globalAlpha = strokeAlpha
      context.lineWidth = Math.max(interactionTag ? 1.8 : 1.25, zoom * (interactionTag ? 0.18 : 0.1))
      if (interactionTag) {
        context.setLineDash([Math.max(5, 8 * zoom), Math.max(3, 5 * zoom)])
      }
      context.strokeRect(destinationX, destinationY, destinationWidth, destinationHeight)
      context.setLineDash([])

      if (bounds.isPoint) {
        context.beginPath()
        context.globalAlpha = interactionTag ? 1 : 0.92
        context.shadowBlur = interactionTag ? Math.max(8, 14 * zoom) : 0
        context.shadowColor = interactionTag ? color : 'transparent'
        context.arc(object.x * zoom, object.y * zoom, Math.max(interactionTag ? 5 : 4, 5.5 * zoom), 0, Math.PI * 2)
        context.fill()
        context.shadowBlur = 0
      } else {
        context.beginPath()
        context.globalAlpha = interactionTag ? 0.94 : 0.72
        context.arc(centerX, centerY, Math.max(interactionTag ? 3.5 : 2.5, 3.5 * zoom), 0, Math.PI * 2)
        context.fill()
      }

      if (interactionTag) {
        const markerRadius = Math.max(6, 8 * zoom)

        context.globalAlpha = 0.92
        context.strokeStyle = 'rgba(255,255,255,0.96)'
        context.lineWidth = Math.max(1.2, 1.8 * zoom)
        context.beginPath()
        context.moveTo(centerX, centerY - markerRadius)
        context.lineTo(centerX + markerRadius, centerY)
        context.lineTo(centerX, centerY + markerRadius)
        context.lineTo(centerX - markerRadius, centerY)
        context.closePath()
        context.stroke()
      }

      const labelThreshold = interactionTag || bounds.isPoint ? 0.28 : 0.45
      if (zoom >= labelThreshold) {
        const secondaryLabel = interactionTag ?? object.type
        context.font = `${Math.max(10, Math.round(11 * Math.min(zoom, 1.3)))}px "Segoe UI", sans-serif`
        const primaryWidth = context.measureText(label).width
        const secondaryWidth = secondaryLabel ? context.measureText(secondaryLabel).width : 0
        const labelWidth = Math.max(primaryWidth, secondaryWidth) + 12
        const labelHeight = secondaryLabel ? 30 : 18
        const labelX = bounds.isPoint ? centerX + 10 : destinationX
        const labelY = bounds.isPoint ? centerY - labelHeight / 2 : Math.max(4, destinationY - labelHeight)

        context.globalAlpha = 0.88
        context.fillStyle = overlayLabelFill
        context.fillRect(labelX, labelY, labelWidth, labelHeight)
        context.globalAlpha = 1
        context.strokeStyle = color
        context.strokeRect(labelX, labelY, labelWidth, labelHeight)
        context.fillStyle = overlayLabelText
        context.fillText(label, labelX + 5, labelY + 12.5)
        if (secondaryLabel) {
          context.fillStyle = theme === 'light' ? '#475569' : '#cbd5e1'
          context.fillText(secondaryLabel, labelX + 5, labelY + 24)
        }
      }

      if (inspectorObjectIds?.has(object.id)) {
        context.globalAlpha = 0.95
        context.strokeStyle = accentColor
        context.lineWidth = Math.max(2, 2.2 * zoom)
        context.setLineDash([Math.max(5, 7 * zoom), Math.max(3, 5 * zoom)])
        context.strokeRect(destinationX - 1.5, destinationY - 1.5, destinationWidth + 3, destinationHeight + 3)
        context.setLineDash([])
      }
      context.restore()
    }
  }

  if (atlasWarpRoutes.length) {
    for (const route of atlasWarpRoutes) {
      drawWarpRoute(context, route, mapDocument.tileWidth, mapDocument.tileHeight, zoom)
    }
  }

  if (highlightedObject) {
    const bounds = getObjectBounds(highlightedObject.object, 12 / zoom)
    const destinationX = bounds.x * zoom
    const destinationY = bounds.y * zoom
    const destinationWidth = bounds.width * zoom
    const destinationHeight = bounds.height * zoom
    const centerX = (bounds.x + bounds.width / 2) * zoom
    const centerY = (bounds.y + bounds.height / 2) * zoom
    const highlightColor = theme === 'light' ? 'rgba(245, 158, 11, 0.96)' : 'rgba(250, 204, 21, 0.98)'
    const haloColor = theme === 'light' ? 'rgba(249, 115, 22, 0.24)' : 'rgba(250, 204, 21, 0.28)'

    context.save()
    context.globalAlpha = 1
    context.shadowBlur = Math.max(14, 22 * zoom)
    context.shadowColor = haloColor
    context.fillStyle = haloColor
    context.fillRect(destinationX - 4, destinationY - 4, destinationWidth + 8, destinationHeight + 8)
    context.shadowBlur = 0
    context.strokeStyle = highlightColor
    context.lineWidth = Math.max(2, 3 * zoom)
    context.setLineDash([Math.max(8, 10 * zoom), Math.max(4, 6 * zoom)])
    context.strokeRect(destinationX - 2, destinationY - 2, destinationWidth + 4, destinationHeight + 4)
    context.setLineDash([])

    context.beginPath()
    context.fillStyle = highlightColor
    context.arc(centerX, centerY, Math.max(4.5, 6 * zoom), 0, Math.PI * 2)
    context.fill()

    context.beginPath()
    context.strokeStyle = 'rgba(255,255,255,0.96)'
    context.lineWidth = Math.max(1.5, 2 * zoom)
    context.moveTo(centerX - Math.max(8, 12 * zoom), centerY)
    context.lineTo(centerX + Math.max(8, 12 * zoom), centerY)
    context.moveTo(centerX, centerY - Math.max(8, 12 * zoom))
    context.lineTo(centerX, centerY + Math.max(8, 12 * zoom))
    context.stroke()
    context.restore()
  }

  if (atlasPortals.length) {
    for (const portal of atlasPortals) {
      drawAtlasPortal(context, portal, mapDocument.tileWidth, mapDocument.tileHeight, zoom, theme, accentColor)
    }
  }

  if (atlasPlacements.length && mapDocument.format === 'atlas') {
    context.save()
    context.textBaseline = 'top'
    context.setLineDash([8, 8])

    for (const placement of atlasPlacements) {
      const x = placement.offsetX * mapDocument.tileWidth * zoom
      const y = placement.offsetY * mapDocument.tileHeight * zoom
      const width = placement.width * mapDocument.tileWidth * zoom
      const height = placement.height * mapDocument.tileHeight * zoom

      context.globalAlpha = 0.04
      context.fillStyle = theme === 'light' ? '#3b82f6' : '#60a5fa'
      context.fillRect(x, y, width, height)

      context.globalAlpha = 0.38
      context.lineWidth = Math.max(1.5, zoom * 0.12)
      context.strokeStyle = theme === 'light' ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.28)'
      context.strokeRect(x, y, width, height)

      if (zoom >= 0.28) {
        const label = placement.mapName
        context.font = `${Math.max(10, Math.round(12 * Math.min(zoom, 1.2)))}px "Segoe UI", sans-serif`
        const labelWidth = context.measureText(label).width + 12
        context.fillStyle = theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(8,10,16,0.9)'
        context.fillRect(x + 4, y + 4, labelWidth, 20)
        context.strokeStyle = theme === 'light' ? 'rgba(15,23,42,0.4)' : 'rgba(255,255,255,0.28)'
        context.strokeRect(x + 4, y + 4, labelWidth, 20)
        context.fillStyle = theme === 'light' ? '#0f172a' : '#f8fafc'
        context.fillText(label, x + 10, y + 8)
      }
    }

    context.restore()
  }

  context.globalAlpha = 1
  context.restore()
}
