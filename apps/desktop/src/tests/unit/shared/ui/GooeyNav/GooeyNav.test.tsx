import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import GooeyNav from '@shared/ui/GooeyNav/GooeyNav'

describe('GooeyNav', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('cancels queued particle timers when unmounted during a route switch', async () => {
    vi.useFakeTimers()
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const { unmount } = renderWithLocale(
      <GooeyNav ariaLabel="Launcher navigation" particleCount={4} items={[{ label: 'Library' }, { label: 'Discover' }]} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Discover' }))
    unmount()
    await act(() => vi.runAllTimers())

    expect(document.querySelector('.particle')).toBeNull()
    expect(raf).not.toHaveBeenCalled()
    raf.mockRestore()
  })

  it('renders action-only items as buttons so they do not expose draggable placeholder links', () => {
    renderWithLocale(<GooeyNav ariaLabel="Launcher navigation" items={[{ label: 'Library' }, { label: 'Discover' }]} />)

    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Library' })).toBeNull()
  })

  it('keeps real href items as non-draggable links', () => {
    renderWithLocale(<GooeyNav ariaLabel="External navigation" items={[{ label: 'Docs', href: 'https://example.test/docs' }]} />)

    const docsLink = screen.getByRole('link', { name: 'Docs' })

    expect(docsLink.getAttribute('href')).toBe('https://example.test/docs')
    expect(docsLink.getAttribute('draggable')).toBe('false')
  })
})
