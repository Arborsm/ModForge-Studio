import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  LoadingMotionFallback,
  LoadingMotionHost,
  LoadingMotionReveal,
  getLoadingMotionChildRevealProps,
  getLoadingMotionRevealProps,
  useLoadingMotionConfig,
} from './LoadingMotionHost'
import { DEFAULT_LOADING_MOTION_PREFERENCE } from '@shared/lib/loading-motion'

const defaultConfig = {
  ...DEFAULT_LOADING_MOTION_PREFERENCE,
  revealOrder: null,
  anchors: ['placeholder' as string],
} as const

/* ------------------------------------------------------------------ */
/*  Host adapter tests                                                 */
/* ------------------------------------------------------------------ */

describe('useLoadingMotionConfig', () => {
  it('returns default config when no preference is given', () => {
    const { config } = useLoadingMotionConfig({
      stage: 'loading',
    })

    expect(config.styleId).toBe('softFadeIn')
    expect(config.intensityId).toBe('standard')
    expect(config.revealOrder).toBeNull()
    expect(config.anchors).toEqual([])
  })

  it('passes through reveal order when provided', () => {
    const order = ['header', 'footer'] as const
    const { config } = useLoadingMotionConfig({
      stage: 'ready',
      revealOrder: order,
    })

    expect(config.revealOrder).toEqual(order)
  })

  it('caps anchors to at most 2', () => {
    const { config } = useLoadingMotionConfig({
      stage: 'ready',
      anchors: ['a', 'b', 'c'],
    })

    expect(config.anchors).toHaveLength(2)
    expect(config.anchors[0]).toBe('a')
    expect(config.anchors[1]).toBe('b')
  })

  it('passes through reveal items', () => {
    const items = [{ itemId: 'header', priority: 1 }]
    const { items: result } = useLoadingMotionConfig({
      stage: 'ready',
      revealItems: items,
    })

    expect(result).toEqual(items)
  })
})

/* ------------------------------------------------------------------ */
/*  Section reveal contract tests                                      */
/* ------------------------------------------------------------------ */

describe('getLoadingMotionRevealProps', () => {
  it('exposes style, intensity, section id, and stagger delay as DOM hooks', () => {
    const props = getLoadingMotionRevealProps({
      itemId: 'library-list',
      index: 2,
      preference: {
        styleId: 'layeredFadeIn',
        intensityId: 'strong',
        speedMode: 'preset',
        speedId: 'standard',
        speedMultiplier: 1,
      },
    })

    expect(props.className).toBe('loading-motion-reveal')
    expect(props['data-loading-style']).toBe('layeredFadeIn')
    expect(props['data-loading-intensity']).toBe('strong')
    expect(props['data-loading-speed']).toBe('standard')
    expect(props['data-loading-section']).toBe('library-list')
    expect(props.style?.['--loading-motion-reveal-index']).toBe(2)
    expect(props.style?.['--loading-motion-speed-multiplier']).toBe(1)
  })

  it('exposes custom speed as DOM hooks for CSS timing', () => {
    const props = getLoadingMotionRevealProps({
      itemId: 'workbench-project-mode',
      index: 1,
      preference: {
        styleId: 'slideInPush',
        intensityId: 'standard',
        speedMode: 'custom',
        speedId: 'fast',
        speedMultiplier: 2.4,
      },
    })

    expect(props['data-loading-speed']).toBe('fast')
    expect(props.style?.['--loading-motion-speed-multiplier']).toBe(2.4)
  })
})

describe('getLoadingMotionChildRevealProps', () => {
  it('exposes a child reveal class and stagger index for list items', () => {
    const props = getLoadingMotionChildRevealProps({
      index: 4,
      className: 'asset-row',
    })

    expect(props.className).toBe('loading-motion-child-reveal asset-row')
    expect(props.style?.['--loading-motion-child-index']).toBe(4)
  })
})

describe('LoadingMotionReveal', () => {
  it('wraps a section with the shared reveal contract', () => {
    render(
      <LoadingMotionReveal
        itemId="library-grid"
        index={3}
        preference={{
          styleId: 'slideInPush',
          intensityId: 'standard',
          speedMode: 'preset',
          speedId: 'standard',
          speedMultiplier: 1,
        }}
      >
        <div>Grid</div>
      </LoadingMotionReveal>,
    )

    const reveal = screen.getByText('Grid').parentElement
    expect(reveal).toHaveClass('loading-motion-reveal')
    expect(reveal).toHaveAttribute('data-loading-style', 'slideInPush')
    expect(reveal).toHaveAttribute('data-loading-intensity', 'standard')
    expect(reveal).toHaveAttribute('data-loading-speed', 'standard')
    expect(reveal).toHaveAttribute('data-loading-section', 'library-grid')
  })
})

/* ------------------------------------------------------------------ */
/*  Renderer contract tests                                            */
/* ------------------------------------------------------------------ */

describe('LoadingMotionHost', () => {
  it('renders children when stage is ready', () => {
    render(
      <LoadingMotionHost stage="ready" config={defaultConfig}>
        <div>Content</div>
      </LoadingMotionHost>,
    )

    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders children when stage is idle', () => {
    render(
      <LoadingMotionHost stage="idle" config={defaultConfig}>
        <div>Idle Content</div>
      </LoadingMotionHost>,
    )

    expect(screen.getByText('Idle Content')).toBeInTheDocument()
  })

  it('renders placeholder when stage is loading and placeholder is provided', () => {
    render(
      <LoadingMotionHost stage="loading" config={defaultConfig} placeholder={<div>Loading...</div>}>
        <div>Content</div>
      </LoadingMotionHost>,
    )

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders children when stage is loading but no placeholder', () => {
    render(
      <LoadingMotionHost stage="loading" config={defaultConfig}>
        <div>Content</div>
      </LoadingMotionHost>,
    )

    // Fallback to children when no placeholder
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders placeholder when stage is entering and placeholder is provided', () => {
    render(
      <LoadingMotionHost stage="entering" config={defaultConfig} placeholder={<div>Entering...</div>}>
        <div>Content</div>
      </LoadingMotionHost>,
    )

    expect(screen.getByText('Entering...')).toBeInTheDocument()
  })

  /* ------------------------------------------------------------------ */
  /*  LoadingMotionFallback tests                                      */
  /* ------------------------------------------------------------------ */

  describe('LoadingMotionFallback', () => {
    it('renders with data attributes for the given style and intensity', () => {
      render(
        <div>
          <LoadingMotionFallback styleId="bounceIn" intensityId="strong" speedMode="preset" speedId="fast" speedMultiplier={0.72} />
        </div>,
      )
      const el = document.querySelector('[data-loading-style]')
      expect(el).toBeTruthy()
      expect(el?.getAttribute('data-loading-style')).toBe('bounceIn')
      expect(el?.getAttribute('data-loading-intensity')).toBe('strong')
      expect(el?.getAttribute('data-loading-speed')).toBe('fast')
      expect((el as HTMLElement | null)?.style.getPropertyValue('--loading-motion-speed-multiplier')).toBe('0.72')
    })

    it('renders a style-addressable layered visual instead of a generic pulse dot', () => {
      const { container } = render(<LoadingMotionFallback styleId="layeredFadeIn" intensityId="standard" />)

      expect(container.querySelector('.loading-motion-fallback')).toBeTruthy()
      expect(container.querySelector('.loading-motion-visual')).toBeTruthy()
      expect(container.querySelectorAll('.loading-motion-layer')).toHaveLength(3)
      expect(container.querySelector('.animate-pulse')).toBeNull()
    })

    it('updates data attributes when props change', () => {
      const { rerender } = render(<LoadingMotionFallback styleId="softFadeIn" intensityId="standard" />)
      let el = document.querySelector('[data-loading-style]')
      expect(el?.getAttribute('data-loading-style')).toBe('softFadeIn')
      expect(el?.getAttribute('data-loading-intensity')).toBe('standard')
      expect(el?.getAttribute('data-loading-speed')).toBe('standard')

      rerender(<LoadingMotionFallback styleId="bounceIn" intensityId="light" speedMode="custom" speedId="fast" speedMultiplier={2.2} />)
      el = document.querySelector('[data-loading-style]')
      expect(el?.getAttribute('data-loading-style')).toBe('bounceIn')
      expect(el?.getAttribute('data-loading-intensity')).toBe('light')
      expect(el?.getAttribute('data-loading-speed')).toBe('fast')
      expect((el as HTMLElement | null)?.style.getPropertyValue('--loading-motion-speed-multiplier')).toBe('2.2')
    })

    it('renders a visible placeholder element', () => {
      const { container } = render(<LoadingMotionFallback styleId="quietSimplify" intensityId="light" />)
      expect(container.querySelector('.loading-motion-layer-primary')).toBeTruthy()
    })
  })
  it('renders children when stage is exiting (no exit animation in Phase 2)', () => {
    render(
      <LoadingMotionHost stage="exiting" config={defaultConfig}>
        <div>Exiting Content</div>
      </LoadingMotionHost>,
    )

    expect(screen.getByText('Exiting Content')).toBeInTheDocument()
  })
})
