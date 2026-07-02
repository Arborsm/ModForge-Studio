import { describe, expect, it } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { AtlasSprite } from '@pages/workbench/workspaces/item/entities/item'

describe('AtlasSprite loading skeleton', () => {
  it('renders a skeleton overlay while the texture is loading', () => {
    const { container } = renderWithLocale(
      <AtlasSprite texture={{ loading: true, url: null, width: null, height: null }} sourceRect={{ x: 0, y: 0, width: 16, height: 16 }} />,
    )

    expect(container.querySelector('.image-skeleton')).toBeTruthy()
  })

  it('renders the sprite once the texture has resolved', () => {
    const { container } = renderWithLocale(
      <AtlasSprite
        texture={{ loading: false, url: 'data:image/png;base64,abc', width: 64, height: 64 }}
        sourceRect={{ x: 0, y: 0, width: 16, height: 16 }}
      />,
    )

    expect(container.querySelector('.image-skeleton')).toBeNull()
    expect(container.querySelector('[style*="data:image/png;base64,abc"]')).toBeTruthy()
  })
})
