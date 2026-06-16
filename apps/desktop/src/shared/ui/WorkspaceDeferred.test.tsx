import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { DeferredWorkspaceCrossfade, DeferredWorkspaceReveal } from '@shared/ui/WorkspaceDeferred'

describe('DeferredWorkspaceReveal', () => {
  it('schedules a reveal on mount', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })

    render(
      <DeferredWorkspaceReveal>
        <div>Content</div>
      </DeferredWorkspaceReveal>,
    )

    expect(raf).toHaveBeenCalled()
    raf.mockRestore()
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
