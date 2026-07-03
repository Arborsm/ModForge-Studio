import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocaleAndLaunchers } from '@test/renderWithLocaleAndLaunchers'
import { LauncherModCard } from './LauncherModCard'

describe('LauncherModCard', () => {
  it('opens details on single click and the direct target on double click', () => {
    const onOpenDirectTarget = vi.fn()
    const onOpenDetails = vi.fn()

    renderWithLocaleAndLaunchers(
      <LauncherModCard
        title="Content Patcher"
        meta="Pathoschild · v2.9.0"
        imageUrl={null}
        onOpenDetails={onOpenDetails}
        onOpenDirectTarget={onOpenDirectTarget}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /content patcher/i }))
    expect(onOpenDetails).toHaveBeenCalledTimes(1)
    expect(onOpenDirectTarget).not.toHaveBeenCalled()

    fireEvent.doubleClick(screen.getByRole('button', { name: /content patcher/i }))
    expect(onOpenDirectTarget).toHaveBeenCalledTimes(1)
    expect(onOpenDetails).toHaveBeenCalledTimes(1)
  })

  it('uses selected card styling only while selection mode is active', () => {
    const { rerender } = renderWithLocaleAndLaunchers(
      <LauncherModCard title="Content Patcher" meta="Pathoschild · v2.9.0" imageUrl={null} selected onSelect={vi.fn()} />,
    )

    expect(screen.getByRole('article', { name: /content patcher/i })).not.toHaveClass('launcher-mod-card-selected')

    rerender(
      <LauncherModCard title="Content Patcher" meta="Pathoschild · v2.9.0" imageUrl={null} selectionMode selected onSelect={vi.fn()} />,
    )

    expect(screen.getByRole('article', { name: /content patcher/i })).toHaveClass('launcher-mod-card-selected')
  })

  it('toggles selection immediately in selection mode', () => {
    const onSelect = vi.fn()

    renderWithLocaleAndLaunchers(
      <LauncherModCard
        title="Content Patcher"
        meta="Pathoschild · v2.9.0"
        imageUrl={null}
        selectionMode
        selected={false}
        onSelect={onSelect}
        onOpenDetails={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('article', { name: /content patcher/i }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /content patcher/i }))
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('renders updated versions as a blue affordance with an update tooltip', () => {
    renderWithLocaleAndLaunchers(
      <LauncherModCard
        title="Content Patcher"
        meta="Pathoschild · v1.0.5"
        author="Pathoschild"
        version="1.0.5"
        latestVersion="1.1.0"
        imageUrl={null}
      />,
      'zh-CN',
    )

    const updateBadge = screen.getByLabelText('新版本 v1.1.0 可用')
    expect(updateBadge).toHaveClass('launcher-mod-card-version-update')
    expect(updateBadge).not.toHaveAttribute('title')
    expect(updateBadge).toHaveAttribute('data-tooltip', '新版本 v1.1.0 可用')
    expect(updateBadge.textContent).toContain('v1.0.5')
    expect(updateBadge.querySelector('svg')).toBeTruthy()
  })

  it('keeps author and version in fixed footer slots with custom hover labels', () => {
    renderWithLocaleAndLaunchers(
      <LauncherModCard
        title="Content Patcher"
        meta="Pathoschild · v2.9.0"
        author="A very long author name that should truncate"
        version="123.456.789-long-build"
        imageUrl={null}
      />,
    )

    const meta = screen.getByText('A very long author name that should truncate').closest('.launcher-mod-card-meta')
    expect(meta).not.toBeNull()
    expect(meta?.querySelector('[aria-hidden="true"]')).toBeNull()
    expect(meta?.querySelector('.launcher-mod-card-author')).toHaveAttribute('data-tooltip', 'A very long author name that should truncate')
    expect(meta?.querySelector('.launcher-mod-card-version')).toHaveAttribute('data-tooltip', 'v123.456.789-long-build')
    expect(meta?.querySelector('.launcher-mod-card-author')).not.toHaveAttribute('title')
    expect(meta?.querySelector('.launcher-mod-card-version')).not.toHaveAttribute('title')
  })

  it('does not show native browser tooltips for the card or title', () => {
    renderWithLocaleAndLaunchers(
      <LauncherModCard
        title="Content Patcher"
        titleTooltip="Content Patcher tooltip"
        meta="Pathoschild · v1.0.5"
        author="Pathoschild"
        version="1.0.5"
        latestVersion="1.1.0"
        imageUrl={null}
      />,
      'zh-CN',
    )

    expect(screen.getByRole('button', { name: /content patcher/i })).not.toHaveAttribute('title')
    expect(screen.getByText('Content Patcher')).not.toHaveAttribute('title')
    expect(screen.getByLabelText('新版本 v1.1.0 可用')).toHaveAttribute('data-tooltip', '新版本 v1.1.0 可用')
  })
})
