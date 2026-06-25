import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import WorkbenchLaunchpadDock from './WorkbenchLaunchpadDock'

function renderDock(overrides: Partial<Parameters<typeof WorkbenchLaunchpadDock>[0]> = {}) {
  const props: Parameters<typeof WorkbenchLaunchpadDock>[0] = {
    homeActive: true,
    dockPlacement: 'titlebar',
    workspaceMode: 'mods',
    workspaceViewMode: 'edit',
    recentPages: [],
    devViews: [],
    onToggleHome: vi.fn(),
    onRootWorkspaceOpen: vi.fn(),
    onProjectWorkspaceOpen: vi.fn(),
    onOpenProjectPage: vi.fn(),
    onDevViewOpen: vi.fn(),
    ...overrides,
  }

  return renderWithLocale(<WorkbenchLaunchpadDock {...props} />)
}

describe('WorkbenchLaunchpadDock', () => {
  it('does not render an orphan separator when there are no recent pages', () => {
    const { container } = renderDock()
    const dock = screen.getByRole('navigation', { name: 'Recent pages' })

    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(dock.querySelector('.workbench-dock-separator')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Project Library' })).toBeNull()
    expect(container.querySelectorAll('.workbench-dock-item')).toHaveLength(1)
  })

  it('renders a separator only when recent pages are available', () => {
    const { container } = renderDock({
      recentPages: [{ kind: 'root', mode: 'map' }],
    })

    expect(container.querySelector('.workbench-dock-separator')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Map' })).toBeTruthy()
  })
})
