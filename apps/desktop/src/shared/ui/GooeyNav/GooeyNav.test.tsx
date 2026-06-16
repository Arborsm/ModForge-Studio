import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import GooeyNav from './GooeyNav'

describe('GooeyNav', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('cancels queued particle timers when unmounted during a route switch', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderWithLocale(
      <GooeyNav ariaLabel="Launcher navigation" particleCount={4} items={[{ label: 'Library' }, { label: 'Discover' }]} />,
    )

    fireEvent.click(screen.getByRole('link', { name: 'Discover' }))
    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
