import type { CSSProperties } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useLauncherImage } from '@features/launcher'
import { LauncherArtworkCover } from '@features/launcher/ui/cards/LauncherArtworkCover'

vi.mock('@features/launcher/model/imageLoader', () => ({
  useLauncherImage: vi.fn(),
}))

const useLauncherImageMock = vi.mocked(useLauncherImage)

const coverStyle = {
  '--launcher-cover-bright': '#d6e8ff',
  '--launcher-cover-base': '#8eb0e8',
  '--launcher-cover-dark': '#5274a8',
  '--launcher-cover-edge': '#e4f0ff',
  '--launcher-cover-glow': 'rgba(142,176,232,0.22)',
  '--launcher-cover-shadow': 'rgba(12,24,48,0.2)',
} as CSSProperties

describe('LauncherArtworkCover', () => {
  it('renders a blurred background layer and contain foreground layer when an image is available', () => {
    useLauncherImageMock.mockReturnValue({
      imageUrl: 'https://example.com/cover.png',
      error: null,
      loading: false,
    })

    const { container } = render(
      <LauncherArtworkCover
        title="NPC Adventures"
        imageUrl="https://example.com/cover.png"
        imageModKey="101"
        coverStyle={coverStyle}
        coverWord="NPC"
      />,
    )

    expect(container.querySelector('.launcher-mod-card-cover-image-blur-strip')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-image-blur')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-image-blur-clone')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-image')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-fallback')).toBeNull()
    expect(container.querySelector('.launcher-mod-card-cover-skeleton')).toBeNull()
  })

  it('marks image-backed covers so fallback gradient chrome can be disabled', () => {
    useLauncherImageMock.mockReturnValue({
      imageUrl: 'https://example.com/cover.png',
      error: null,
      loading: false,
    })

    const { container } = render(
      <LauncherArtworkCover
        title="NPC Adventures"
        imageUrl="https://example.com/cover.png"
        imageModKey="101"
        coverStyle={coverStyle}
        coverWord="NPC"
      />,
    )

    expect(container.firstElementChild).toHaveClass('launcher-mod-card-cover-has-image')
  })

  it('keeps the foreground image while disabling the optional blur strip', () => {
    useLauncherImageMock.mockReturnValue({
      imageUrl: 'https://example.com/cover.png',
      error: null,
      loading: false,
    })

    const { container } = render(
      <LauncherArtworkCover
        title="NPC Adventures"
        imageUrl="https://example.com/cover.png"
        imageModKey="101"
        coverStyle={coverStyle}
        coverWord="NPC"
        showBlurStrip={false}
      />,
    )

    expect(container.querySelector('.launcher-mod-card-cover-image-blur-strip')).toBeNull()
    expect(container.querySelector('.launcher-mod-card-cover-image')).toHaveAttribute('src', 'https://example.com/cover.png')
  })

  it('renders fallback presentation without image layers when no image is available', () => {
    useLauncherImageMock.mockReturnValue({
      imageUrl: null,
      error: null,
      loading: false,
    })

    const { container } = render(
      <LauncherArtworkCover title="NPC Adventures" imageUrl={null} imageModKey="101" coverStyle={coverStyle} coverWord="NPC" />,
    )

    expect(container.querySelector('.launcher-mod-card-cover-image-blur')).toBeNull()
    expect(container.querySelector('.launcher-mod-card-cover-image')).toBeNull()
    expect(container.querySelector('.launcher-mod-card-cover-fallback')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-skeleton')).toBeNull()
    expect(container.firstElementChild).not.toHaveAttribute('aria-busy')
  })

  it('renders a full-cover skeleton while the image is loading', () => {
    useLauncherImageMock.mockReturnValue({
      imageUrl: null,
      error: null,
      loading: true,
    })

    const { container } = render(
      <LauncherArtworkCover
        title="NPC Adventures"
        imageUrl="https://example.com/cover.png"
        imageModKey="101"
        coverStyle={coverStyle}
        coverWord="NPC"
      />,
    )

    expect(container.querySelector('.launcher-mod-card-cover-skeleton')).toBeTruthy()
    expect(container.querySelector('.image-skeleton')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-image')).toBeNull()
    expect(container.querySelector('.launcher-mod-card-cover-fallback')).toBeNull()
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps fallback presentation when loading errors', () => {
    useLauncherImageMock.mockReturnValue({
      imageUrl: null,
      error: { url: 'https://example.com/cover.png', error: 'Network error' },
      loading: false,
    })

    const { container } = render(
      <LauncherArtworkCover
        title="NPC Adventures"
        imageUrl="https://example.com/cover.png"
        imageModKey="101"
        coverStyle={coverStyle}
        coverWord="NPC"
      />,
    )

    expect(container.querySelector('.launcher-mod-card-cover-image')).toBeNull()
    expect(container.querySelector('.launcher-mod-card-cover-fallback')).toBeTruthy()
    expect(container.querySelector('.launcher-mod-card-cover-skeleton')).toBeNull()
  })
})
