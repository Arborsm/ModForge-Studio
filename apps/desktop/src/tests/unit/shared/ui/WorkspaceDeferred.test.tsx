import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { DeferredWorkspaceCrossfade, DeferredWorkspacePlaceholder, DeferredWorkspaceReveal } from '@shared/ui/WorkspaceDeferred'

describe('DeferredWorkspacePlaceholder', () => {
  it('renders the shared empty-state card presentation', () => {
    const { container } = render(<DeferredWorkspacePlaceholder title="Viewport" subtitle="Active document" lines={5} />)

    expect(container.querySelector('.empty-state-card')).not.toBeNull()
    expect(screen.getAllByText('Viewport')).toHaveLength(2)
    expect(screen.getAllByText('Active document')).toHaveLength(2)
  })
})

describe('DeferredWorkspaceReveal', () => {
  it('reveals after the scheduled animation frame', () => {
    let reveal: FrameRequestCallback | null = null
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      reveal = callback
      return 7
    })

    const { container } = render(
      <DeferredWorkspaceReveal>
        <div>Content</div>
      </DeferredWorkspaceReveal>,
    )

    expect(container.firstElementChild).toHaveClass('translate-y-1.5', 'opacity-0')
    act(() => reveal?.(0))
    expect(container.firstElementChild).toHaveClass('translate-y-0', 'opacity-100')
    raf.mockRestore()
  })

  it('cancels a pending reveal when unmounted', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(9)
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const { unmount } = render(
      <DeferredWorkspaceReveal>
        <div>Content</div>
      </DeferredWorkspaceReveal>,
    )

    unmount()

    expect(cancel).toHaveBeenCalledWith(9)
    raf.mockRestore()
    cancel.mockRestore()
  })
})

describe('DeferredWorkspaceCrossfade', () => {
  it('crossfades from placeholder to content', () => {
    vi.useFakeTimers()
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })

    const { rerender } = render(
      <DeferredWorkspaceCrossfade ready={false} placeholder={<div>Placeholder</div>}>
        <div>Content</div>
      </DeferredWorkspaceCrossfade>,
    )

    expect(screen.getByText('Placeholder')).toBeInTheDocument()
    expect(screen.queryByText('Content')).toBeNull()

    rerender(
      <DeferredWorkspaceCrossfade ready={true} placeholder={<div>Placeholder</div>}>
        <div>Content</div>
      </DeferredWorkspaceCrossfade>,
    )

    expect(screen.getByText('Placeholder')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(240)
    })

    expect(screen.queryByText('Placeholder')).toBeNull()
    expect(screen.getByText('Content')).toBeInTheDocument()

    raf.mockRestore()
    vi.useRealTimers()
  })
})
