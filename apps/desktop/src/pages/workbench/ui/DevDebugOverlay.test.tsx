import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { getFileCacheStats } from '@platform/host'
import { DevDebugOverlay } from './DevDebugOverlay'

const desktopMockState = vi.hoisted(() => ({
  canUseDesktopHost: false,
}))

vi.mock('@entities/event', () => ({
  getStageMetadataCacheStats: () => ({
    hat: 2,
    hair: 3,
  }),
}))

vi.mock('@platform/host', () => ({
  canUseDesktopHost: () => desktopMockState.canUseDesktopHost,
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
  desktopMockState.canUseDesktopHost = false
  vi.mocked(getFileCacheStats).mockReset()
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

  it('keeps the draggable overlay below the title bar', () => {
    render(<DevDebugOverlay workspaceMode="map" mapName="Town" eventName={null} currentEventCommandId={null} actorCount={0} />)

    const handle = screen.getByText('Dev Debug').parentElement as HTMLElement | null
    const overlay = handle?.closest('.fixed') as HTMLElement | null

    fireEvent.pointerDown(handle as HTMLElement, {
      pointerId: 3,
      clientX: 60,
      clientY: 120,
    })
    fireEvent.pointerMove(overlay as HTMLElement, {
      pointerId: 3,
      clientX: 0,
      clientY: 0,
    })
    fireEvent.pointerUp(overlay as HTMLElement, {
      pointerId: 3,
      clientX: 0,
      clientY: 0,
    })

    expect(overlay?.style.left).toBe('12px')
    expect(overlay?.style.top).toBe('69px')
  })

  it('loads file cache stats once and refreshes manually without polling', async () => {
    desktopMockState.canUseDesktopHost = true
    vi.mocked(getFileCacheStats)
      .mockResolvedValueOnce({
        rootPath: 'C:/cache/assets-v1',
        entryCount: 2,
        totalSizeBytes: 2048,
      })
      .mockResolvedValueOnce({
        rootPath: 'C:/cache/assets-v1',
        entryCount: 3,
        totalSizeBytes: 4096,
      })
    const setIntervalSpy = vi.spyOn(window, 'setInterval')

    render(<DevDebugOverlay workspaceMode="map" mapName="Town" eventName={null} currentEventCommandId={null} actorCount={0} />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(getFileCacheStats).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
      await Promise.resolve()
    })

    expect(getFileCacheStats).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/3 entries/)).toBeInTheDocument()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })
})
