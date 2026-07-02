import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MapDocument } from '@entities/map'
import { MapViewport } from '@entities/map/ui/MapViewport'

vi.mock('../../../../../entities/map/ui/mapViewportHelpers', async () => {
  const actual = await vi.importActual<typeof import('../../../../../entities/map/ui/mapViewportHelpers')>(
    '../../../../../entities/map/ui/mapViewportHelpers',
  )
  return {
    ...actual,
    loadImage: vi.fn(() => new Promise(() => {})),
  }
})

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy(
      {},
      {
        get: (_target, property) => {
          if (property === 'canvas') {
            return document.createElement('canvas')
          }
          if (property === 'measureText') {
            return () => ({ width: 24 })
          }
          if (property === 'getImageData') {
            return () => ({ data: new Uint8ClampedArray(4) })
          }
          return () => {}
        },
      },
    ) as unknown as CanvasRenderingContext2D,
  )
})

function createMapDocument(): MapDocument {
  const width = 8
  const height = 6
  const gids = new Uint32Array(width * height)
  gids.fill(1)

  return {
    name: 'Test',
    sourcePath: 'test://map',
    relativePath: 'Maps/Test.xnb',
    format: 'xnb',
    width,
    height,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width,
        height,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids,
        nonEmptyTiles: gids.length,
      },
    ],
    objectGroups: [],
    tilesets: [
      {
        firstGid: 1,
        name: 'test',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 1,
        columns: 1,
        imageSource: null,
        imagePath: 'test://tileset.png',
        imageWidth: 16,
        imageHeight: 16,
        properties: {},
        tileProperties: {},
        animations: {},
      },
    ],
    properties: {},
  }
}

describe('MapViewport loading skeleton', () => {
  it('renders a viewport skeleton overlay while tileset images are loading', () => {
    render(
      <MapViewport
        locale="en-US"
        mapDocument={createMapDocument()}
        visibleLayerIds={[1]}
        visibleObjectGroupIds={[]}
        theme="dark"
        accentColor="#3b82f6"
        showGrid={false}
        showStatsChips={false}
        initialZoom={1}
        contextMenuEnabled={false}
      />,
    )

    expect(document.querySelector('.map-viewport-skeleton')).toBeInTheDocument()
    expect(document.querySelector('.image-skeleton')).toBeInTheDocument()
  })
})
