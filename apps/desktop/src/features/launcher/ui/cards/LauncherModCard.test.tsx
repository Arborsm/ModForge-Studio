import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithLocaleAndLaunchers } from '@test/renderWithLocaleAndLaunchers'
import { LauncherModCard } from './LauncherModCard'

describe('LauncherModCard', () => {
  it('opens details on double click without replacing single-click selection', () => {
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
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onOpenDetails).not.toHaveBeenCalled()

    fireEvent.doubleClick(screen.getByRole('button', { name: /content patcher/i }))
    expect(onOpenDetails).toHaveBeenCalledTimes(1)
  })
})
