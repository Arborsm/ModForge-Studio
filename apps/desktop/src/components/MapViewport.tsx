import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { resolveTilesetImagePath, toAssetUrl } from '../lib/maps/assets'
import type { MapDocument, MapPropertyValue, MapTileset } from '../lib/maps/types'

type MapViewportProps = {
  mapDocument: MapDocument | null
  visibleLayerIds: number[]
  onHoverChange?: (info: TileHoverInfo | null) => void
}

type TilesetImageState = {
  sourcePath: string | null
  items: Record<number, LoadedTilesetImage>
  error: string | null
}

type LoadedTilesetImage = {
  image: HTMLImageElement
  tileset: MapTileset
}

export type TileHoverInfo = {
  tileX: number
  tileY: number
  pixelX: number
  pixelY: number
  layerName: string | null
  gid: number | null
  tilesetName: string | null
  tileId: number | null
  tileProperties: Record<string, MapPropertyValue> | null
}

type DragState = {
  startX: number
  startY: number
  scrollLeft: number
  scrollTop: number
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000
const FLIPPED_VERTICALLY_FLAG = 0x40000000
const FLIPPED_DIAGONALLY_FLAG = 0x20000000
const ROTATED_HEXAGONAL_120_FLAG = 0x10000000
const TILE_ID_MASK = ~(
  FLIPPED_HORIZONTALLY_FLAG |
  FLIPPED_VERTICALLY_FLAG |
  FLIPPED_DIAGONALLY_FLAG |
  ROTATED_HEXAGONAL_120_FLAG
)

function loadImage(path: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load tileset image: ${path}`))
    image.src = toAssetUrl(path)
  })
}

function findTileset(tilesets: MapTileset[], gid: number) {
  for (let index = tilesets.length - 1; index >= 0; index -= 1) {
    const tileset = tilesets[index]
    if (gid >= tileset.firstGid) {
      return tileset
    }
  }

  return null
}

function buildHoverInfo(
  mapDocument: MapDocument,
  visibleLayerIds: number[],
  tileX: number,
  tileY: number,
) {
  if (tileX < 0 || tileY < 0 || tileX >= mapDocument.width || tileY >= mapDocument.height) {
    return null
  }

  const visibleLayers = mapDocument.layers.filter((layer) => layer.visible && visibleLayerIds.includes(layer.id))
  const tileIndex = tileY * mapDocument.width + tileX

  for (let index = visibleLayers.length - 1; index >= 0; index -= 1) {
    const layer = visibleLayers[index]
    const rawGid = layer.gids[tileIndex] >>> 0
    const gid = rawGid & TILE_ID_MASK
    if (gid === 0) {
      continue
    }

    const tileset = findTileset(mapDocument.tilesets, gid)
    const tileId = tileset ? gid - tileset.firstGid : null

    return {
      tileX,
      tileY,
      pixelX: tileX * mapDocument.tileWidth,
      pixelY: tileY * mapDocument.tileHeight,
      layerName: layer.name,
      gid,
      tilesetName: tileset?.name ?? null,
      tileId,
      tileProperties:
        tileset && tileId !== null ? tileset.tileProperties[tileId] ?? null : null,
    } satisfies TileHoverInfo
  }

  return {
    tileX,
    tileY,
    pixelX: tileX * mapDocument.tileWidth,
    pixelY: tileY * mapDocument.tileHeight,
    layerName: null,
    gid: null,
    tilesetName: null,
    tileId: null,
    tileProperties: null,
  } satisfies TileHoverInfo
}

export function MapViewport({ mapDocument, visibleLayerIds, onHoverChange }: MapViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const [tilesetImageState, setTilesetImageState] = useState<TilesetImageState>({
    sourcePath: null,
    items: {},
    error: null,
  })
  const [zoom, setZoom] = useState(2)

  useEffect(() => {
    if (!mapDocument) {
      return
    }

    let disposed = false

    void (async () => {
      try {
        const entries = await Promise.all(
          mapDocument.tilesets.map(async (tileset) => {
            const imagePath = resolveTilesetImagePath(mapDocument, tileset)
            if (!imagePath) {
              return null
            }

            const image = await loadImage(imagePath)
            return [tileset.firstGid, { image, tileset }] as const
          }),
        )

        if (disposed) {
          return
        }

        setTilesetImageState({
          sourcePath: mapDocument.sourcePath,
          items: Object.fromEntries(
            entries.filter((entry): entry is readonly [number, LoadedTilesetImage] => entry !== null),
          ),
          error: null,
        })
      } catch (error) {
        if (!disposed) {
          setTilesetImageState({
            sourcePath: mapDocument.sourcePath,
            items: {},
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })()

    return () => {
      disposed = true
    }
  }, [mapDocument])

  const tilesetImages = useMemo(
    () =>
      mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath
        ? tilesetImageState.items
        : {},
    [mapDocument, tilesetImageState],
  )
  const imageError = useMemo(
    () =>
      mapDocument && tilesetImageState.sourcePath === mapDocument.sourcePath
        ? tilesetImageState.error
        : null,
    [mapDocument, tilesetImageState],
  )
  const visibleLayers = useMemo(
    () =>
      mapDocument
        ? mapDocument.layers.filter((layer) => layer.visible && visibleLayerIds.includes(layer.id))
        : [],
    [mapDocument, visibleLayerIds],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mapDocument) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const width = mapDocument.width * mapDocument.tileWidth * zoom
    const height = mapDocument.height * mapDocument.tileHeight * zoom
    canvas.width = width
    canvas.height = height

    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#f4efe2'
    context.fillRect(0, 0, width, height)

    const sortedTilesets = [...mapDocument.tilesets].sort((left, right) => left.firstGid - right.firstGid)

    for (const layer of visibleLayers) {
      context.globalAlpha = layer.opacity

      for (let index = 0; index < layer.gids.length; index += 1) {
        const rawGid = layer.gids[index] >>> 0
        const gid = rawGid & TILE_ID_MASK
        if (gid === 0) {
          continue
        }

        const tileset = findTileset(sortedTilesets, gid)
        if (!tileset) {
          continue
        }

        const loadedTileset = tilesetImages[tileset.firstGid]
        if (!loadedTileset) {
          continue
        }

        const tileId = gid - tileset.firstGid
        const sourceX = (tileId % tileset.columns) * tileset.tileWidth
        const sourceY = Math.floor(tileId / tileset.columns) * tileset.tileHeight
        const tileX = (index % layer.width) * mapDocument.tileWidth + layer.offsetX
        const tileY = Math.floor(index / layer.width) * mapDocument.tileHeight + layer.offsetY
        const destinationX = tileX * zoom
        const destinationY = tileY * zoom
        const destinationWidth = mapDocument.tileWidth * zoom
        const destinationHeight = mapDocument.tileHeight * zoom

        const flipHorizontally = (rawGid & FLIPPED_HORIZONTALLY_FLAG) !== 0
        const flipVertically = (rawGid & FLIPPED_VERTICALLY_FLAG) !== 0
        const flipDiagonally = (rawGid & FLIPPED_DIAGONALLY_FLAG) !== 0

        if (!flipHorizontally && !flipVertically && !flipDiagonally) {
          context.drawImage(
            loadedTileset.image,
            sourceX,
            sourceY,
            tileset.tileWidth,
            tileset.tileHeight,
            destinationX,
            destinationY,
            destinationWidth,
            destinationHeight,
          )
          continue
        }

        context.save()
        context.translate(destinationX + destinationWidth / 2, destinationY + destinationHeight / 2)

        if (flipDiagonally) {
          context.rotate(-Math.PI / 2)
          context.scale(flipHorizontally ? -1 : 1, flipVertically ? -1 : 1)
        } else {
          context.scale(flipHorizontally ? -1 : 1, flipVertically ? -1 : 1)
        }

        context.drawImage(
          loadedTileset.image,
          sourceX,
          sourceY,
          tileset.tileWidth,
          tileset.tileHeight,
          -destinationWidth / 2,
          -destinationHeight / 2,
          destinationWidth,
          destinationHeight,
        )
        context.restore()
      }
    }

    context.globalAlpha = 1
  }, [mapDocument, tilesetImages, visibleLayers, zoom])

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    }
    viewport.style.cursor = 'grabbing'
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const viewport = viewportRef.current
    if (!viewport || !mapDocument) {
      return
    }

    if (dragStateRef.current) {
      const deltaX = event.clientX - dragStateRef.current.startX
      const deltaY = event.clientY - dragStateRef.current.startY
      viewport.scrollLeft = dragStateRef.current.scrollLeft - deltaX
      viewport.scrollTop = dragStateRef.current.scrollTop - deltaY
    }

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }

    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top
    const tileX = Math.floor(canvasX / (mapDocument.tileWidth * zoom))
    const tileY = Math.floor(canvasY / (mapDocument.tileHeight * zoom))
    onHoverChange?.(buildHoverInfo(mapDocument, visibleLayerIds, tileX, tileY))
  }

  function handleMouseUp() {
    const viewport = viewportRef.current
    dragStateRef.current = null
    if (viewport) {
      viewport.style.cursor = 'grab'
    }
  }

  function handleMouseLeave() {
    const viewport = viewportRef.current
    dragStateRef.current = null
    if (viewport) {
      viewport.style.cursor = 'grab'
    }
    onHoverChange?.(null)
  }

  if (!mapDocument) {
    return <p className="placeholder">Load a TMX map to preview its visible tile layers.</p>
  }

  return (
    <div className="viewport-shell">
      <div className="viewport-meta">
        <span>{mapDocument.width} x {mapDocument.height} tiles</span>
        <span>
          {Object.keys(tilesetImages).length}/{mapDocument.tilesets.length} tilesets loaded
        </span>
        <span>{visibleLayers.length}/{mapDocument.layers.length} layers visible</span>
        <span>{zoom}x zoom</span>
      </div>
      <div className="viewport-actions">
        <button type="button" onClick={() => setZoom((current) => Math.max(1, current - 1))}>
          Zoom out
        </button>
        <button type="button" onClick={() => setZoom(2)}>
          Reset
        </button>
        <button type="button" onClick={() => setZoom((current) => Math.min(6, current + 1))}>
          Zoom in
        </button>
      </div>
      {imageError ? <p className="error">{imageError}</p> : null}
      <div
        ref={viewportRef}
        className="viewport-scroll"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} className="viewport-canvas" />
      </div>
    </div>
  )
}
