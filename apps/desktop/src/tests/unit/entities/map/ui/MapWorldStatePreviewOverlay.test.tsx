import { describe, expect, it } from 'vite-plus/test'
import { render } from '@testing-library/react'
import MapWorldStatePreviewOverlay from '@entities/map/ui/MapWorldStatePreviewOverlay'
import type { MapDocument, MapWorldOverlaySprite } from '@entities/map'

describe('MapWorldStatePreviewOverlay loading skeleton', () => {
  it('renders skeleton placeholders for sprites whose texture has not resolved yet', () => {
    const mapDocument = { tileWidth: 16 } as MapDocument
    const sprites: MapWorldOverlaySprite[] = [
      {
        id: 'sprite-1',
        textureName: 'missing-texture',
        sourceX: 0,
        sourceY: 0,
        sourceWidth: 16,
        sourceHeight: 16,
        pixelX: 64,
        pixelY: 64,
        width: 16,
        height: 16,
        zIndex: 1,
      },
    ]

    const { container } = render(
      <MapWorldStatePreviewOverlay mapDocument={mapDocument} viewportZoom={1} sprites={sprites} textureAssets={{}} />,
    )

    expect(container.querySelector('.map-overlay-sprite-skeleton')).toBeTruthy()
    expect(container.querySelector('.image-skeleton')).toBeTruthy()
  })

  it('renders the actual sprite when the texture has resolved', () => {
    const mapDocument = { tileWidth: 16 } as MapDocument
    const sprites: MapWorldOverlaySprite[] = [
      {
        id: 'sprite-2',
        textureName: 'resolved-texture',
        sourceX: 0,
        sourceY: 0,
        sourceWidth: 16,
        sourceHeight: 16,
        pixelX: 64,
        pixelY: 64,
        width: 16,
        height: 16,
        zIndex: 1,
      },
    ]

    const { container } = render(
      <MapWorldStatePreviewOverlay
        mapDocument={mapDocument}
        viewportZoom={1}
        sprites={sprites}
        textureAssets={{ 'resolved-texture': { url: 'data:image/png;base64,abc' } }}
      />,
    )

    expect(container.querySelector('.map-overlay-sprite-skeleton')).toBeNull()
    expect(container.querySelector('.image-skeleton')).toBeNull()
    const outerSprite = container.firstElementChild?.firstElementChild as HTMLElement | null
    const renderedSprite = outerSprite?.firstElementChild as HTMLElement | null
    expect(outerSprite).toHaveStyle({ transform: 'translate(16px, 16px)', width: '4px', height: '4px', zIndex: '1' })
    expect(renderedSprite).toHaveStyle({
      width: '16px',
      height: '16px',
      transform: 'scale(0.25, 0.25)',
      backgroundImage: 'url("data:image/png;base64,abc")',
      backgroundPosition: '-0px -0px',
      backgroundRepeat: 'no-repeat',
      imageRendering: 'pixelated',
    })
  })
})
