import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { vi } from 'vite-plus/test'
import type { MapDocument } from '@shared/contracts'
import { MapViewport } from './MapViewport'

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
        imagePath: null,
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

function renderViewport(onTileClick = vi.fn()) {
  render(
    <MapViewport
      locale="en-US"
      mapDocument={createMapDocument()}
      visibleLayerIds={[1]}
      visibleObjectGroupIds={[]}
      theme="dark"
      accentColor="#3b82f6"
      showGrid
      showStatsChips={false}
      initialZoom={1}
      onTileClick={onTileClick}
      contextMenuEnabled={false}
    />,
  )

  const viewport = document.querySelector('[data-map-viewport-scroll="true"]')
  if (!(viewport instanceof HTMLElement)) {
    throw new Error('Map viewport scroll container was not rendered.')
  }
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 320 })
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 240 })
  viewport.setPointerCapture = vi.fn()
  viewport.hasPointerCapture = vi.fn(() => true)
  viewport.releasePointerCapture = vi.fn()
  viewport.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 240,
      width: 320,
      height: 240,
      toJSON: () => {},
    }) as DOMRect

  return { viewport, onTileClick }
}

describe('MapViewport tile interactions', () => {
  it('shows hover feedback and picks a tile with a left click', async () => {
    const { viewport, onTileClick } = renderViewport()

    fireEvent.pointerMove(viewport, { pointerId: 1, button: -1, clientX: 161, clientY: 161 })

    await waitFor(() => expect(document.querySelector('[data-map-tile-hover="true"]')).toBeInTheDocument())

    fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 161, clientY: 161 })
    fireEvent.pointerUp(viewport, { pointerId: 1, button: 0, clientX: 161, clientY: 161 })

    expect(onTileClick).toHaveBeenCalledWith(4, 3)
    expect(document.querySelector('[data-map-tile-pick="true"]')).toBeInTheDocument()
  })

  it('uses middle mouse for panning without triggering tile pick', () => {
    const { viewport, onTileClick } = renderViewport()

    fireEvent.pointerDown(viewport, { pointerId: 2, button: 1, clientX: 160, clientY: 120 })
    fireEvent.pointerMove(viewport, { pointerId: 2, button: 1, clientX: 132, clientY: 98 })
    fireEvent.pointerUp(viewport, { pointerId: 2, button: 1, clientX: 132, clientY: 98 })

    expect(onTileClick).not.toHaveBeenCalled()
  })
})
