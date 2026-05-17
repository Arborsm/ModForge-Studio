import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithLocaleAndLaunchers } from '@test/renderWithLocaleAndLaunchers'
import { LauncherModCard } from './LauncherModCard'

describe('LauncherModCard', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens details on double click without replacing single-click selection', () => {
    vi.useFakeTimers()
    const onSelect = vi.fn()
    const onOpenDetails = vi.fn()

    renderWithLocaleAndLaunchers(
      <LauncherModCard
        title="Content Patcher"
        meta="Pathoschild · v2.9.0"
        imageUrl={null}
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /content patcher/i }))
    expect(onSelect).not.toHaveBeenCalled()
    vi.advanceTimersByTime(180)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onOpenDetails).not.toHaveBeenCalled()

    fireEvent.doubleClick(screen.getByRole('button', { name: /content patcher/i }))
    expect(onOpenDetails).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('cancels delayed single-click selection when the card unmounts', () => {
    vi.useFakeTimers()
    const onSelect = vi.fn()

    const { unmount } = renderWithLocaleAndLaunchers(
      <LauncherModCard title="Content Patcher" meta="Pathoschild · v2.9.0" imageUrl={null} onSelect={onSelect} onOpenDetails={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /content patcher/i }))
    unmount()
    vi.advanceTimersByTime(180)

    expect(onSelect).not.toHaveBeenCalled()
  })
})
