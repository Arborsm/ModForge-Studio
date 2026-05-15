import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DevDebugOverlay } from './DevDebugOverlay'

vi.mock('@entities/event', () => ({
  getStageMetadataCacheStats: () => ({
    hat: 2,
    hair: 3,
  }),
}))

vi.mock('@shared/lib/desktop', () => ({
  canUseDesktopHost: () => false,
  clearFileCache: vi.fn(),
  getDesktopCacheStats: () => ({
    scanMaps: 1,
    mapAsset: 2,
    textAsset: 3,
    imageDataUrl: 4,
  }),
  getFileCacheStats: vi.fn(),
}))

vi.mock('@shared/lib/maps', () => ({
  getMapViewportCacheStats: () => ({
    images: 5,
    pendingImages: 1,
  }),
}))

const pointerCaptures = new WeakMap<HTMLElement, Set<number>>()

beforeAll(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        const current = pointerCaptures.get(this) ?? new Set<number>()
        current.add(pointerId)
        pointerCaptures.set(this, current)
      },
    })
  }

  if (!HTMLElement.prototype.releasePointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        pointerCaptures.get(this)?.delete(pointerId)
      },
    })
  }

  if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value(this: HTMLElement, pointerId: number) {
        return pointerCaptures.get(this)?.has(pointerId) ?? false
      },
    })
  }
})

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DevDebugOverlay', () => {
  it('keeps the collapse button clickable without starting a drag', () => {
    render(<DevDebugOverlay workspaceMode="events" mapName="Farm" eventName="Intro" currentEventCommandId="say:1" actorCount={2} />)

    const button = screen.getByRole('button', { name: 'Collapse' })
    const overlay = button.closest('.fixed') as HTMLElement | null
    expect(overlay).toBeTruthy()
    expect(overlay?.style.left).toBe('20px')
    expect(overlay?.style.top).toBe('84px')

    fireEvent.pointerDown(button, {
      pointerId: 1,
      clientX: 120,
      clientY: 128,
    })
    fireEvent.pointerMove(overlay as HTMLElement, {
      pointerId: 1,
      clientX: 220,
      clientY: 228,
    })
    fireEvent.pointerUp(overlay as HTMLElement, {
      pointerId: 1,
      clientX: 220,
      clientY: 228,
    })

    expect(overlay?.style.left).toBe('20px')
    expect(overlay?.style.top).toBe('84px')

    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument()
  })

  it('uses the title block as the drag handle and advertises the grab cursor', () => {
    render(<DevDebugOverlay workspaceMode="map" mapName="Town" eventName={null} currentEventCommandId={null} actorCount={0} />)

    const handle = screen.getByText('Dev Debug').parentElement as HTMLElement | null
    const overlay = handle?.closest('.fixed') as HTMLElement | null

    expect(handle).toBeTruthy()
    expect(overlay).toBeTruthy()
    expect(handle?.className).toContain('cursor-grab')
    expect(handle?.className).toContain('active:cursor-grabbing')

    fireEvent.pointerDown(handle as HTMLElement, {
      pointerId: 2,
      clientX: 60,
      clientY: 120,
    })
    fireEvent.pointerMove(overlay as HTMLElement, {
      pointerId: 2,
      clientX: 180,
      clientY: 220,
    })
    fireEvent.pointerUp(overlay as HTMLElement, {
      pointerId: 2,
      clientX: 180,
      clientY: 220,
    })

    expect(overlay?.style.left).toBe('140px')
    expect(overlay?.style.top).toBe('184px')
  })
})
