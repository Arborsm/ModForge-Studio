import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { editorCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LocaleProvider } from '@locales/provider'
import WorkbenchLaunchpadNavigation from './WorkbenchLaunchpadNavigation'

const copy = editorCopy['en-US'].workbenchNavigation

function renderNavigation(overrides: Partial<ComponentProps<typeof WorkbenchLaunchpadNavigation>> = {}) {
  const props: ComponentProps<typeof WorkbenchLaunchpadNavigation> = {
    open: false,
    workspaceMode: 'mods',
    workspaceViewMode: 'preview',
    hasActiveProject: false,
    projectSummaries: [],
    onOpenChange: vi.fn(),
    onRootWorkspaceOpen: vi.fn(),
    onProjectWorkspaceOpen: vi.fn(),
    onProjectManagementOpen: vi.fn(),
    onProjectCreateOpen: vi.fn(),
    onProjectSelect: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...renderWithLocale(<WorkbenchLaunchpadNavigation {...props} />),
  }
}

describe('WorkbenchLaunchpadNavigation', () => {
  afterEach(() => {
    cleanup()
  })

  it('opens the launchpad from the dock home shortcut without rendering a plus shortcut', () => {
    const { props } = renderNavigation()

    expect(screen.queryByRole('button', { name: copy.openLaunchpad })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: copy.home }))

    expect(props.onOpenChange).toHaveBeenCalledWith(true)
  })

  it('renders home, project manager, and the current root page without adding the fixed project page to recents', () => {
    renderNavigation({ workspaceMode: 'characters' })

    const dock = screen.getByRole('navigation', { name: copy.recentPages })

    expect(within(dock).getByRole('button', { name: copy.home })).toBeTruthy()
    expect(within(dock).getByRole('button', { name: 'Project Manager' })).toBeTruthy()
    expect(within(dock).getByRole('button', { name: 'Characters' })).toBeTruthy()
    expect(within(dock).queryByRole('button', { name: 'Project Page' })).toBeNull()
    expect(within(dock).queryByRole('button', { name: 'Translations' })).toBeNull()
    expect(within(dock).queryByRole('button', { name: 'Events' })).toBeNull()
  })

  it('keeps the project page out of recent pages while it remains a fixed project section entry', () => {
    renderNavigation({ open: true, workspaceMode: 'mods', workspaceViewMode: 'edit', hasActiveProject: true })

    const dock = screen.getByRole('navigation', { name: copy.recentPages })
    const dialog = screen.getByRole('dialog', { name: copy.title })

    expect(within(dock).queryByRole('button', { name: 'Project Page' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: 'Project Page' })).toBeTruthy()
  })

  it('marks the project manager dock entry active only when the launchpad is closed on the project manager page', () => {
    const { rerender, props } = renderNavigation({
      open: true,
      workspaceMode: 'mods',
      workspaceViewMode: 'edit',
      projectManagementActive: true,
    })

    const home = screen.getByRole('button', { name: copy.home })
    const projectManager = screen.getByRole('button', { name: 'Project Manager' })

    expect(home).toHaveAttribute('aria-current', 'page')
    expect(projectManager).not.toHaveAttribute('aria-current')
    expect(projectManager).not.toHaveClass('workbench-dock-item-active')

    rerender(
      <LocaleProvider locale="en-US">
        <WorkbenchLaunchpadNavigation {...props} open={false} projectManagementActive />
      </LocaleProvider>,
    )

    expect(screen.getByRole('button', { name: 'Project Manager' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Project Manager' })).toHaveClass('workbench-dock-item-active')
  })

  it('keeps dock recent order stable when clicking an existing recent page', () => {
    const { props, rerender } = renderNavigation({ open: true, workspaceMode: 'mods' })

    fireEvent.click(within(screen.getByRole('dialog', { name: copy.title })).getByRole('button', { name: 'Map Browser' }))
    rerender(
      <LocaleProvider locale="en-US">
        <WorkbenchLaunchpadNavigation {...props} open workspaceMode="map" />
      </LocaleProvider>,
    )
    fireEvent.click(within(screen.getByRole('dialog', { name: copy.title })).getByRole('button', { name: 'Event Browser' }))
    rerender(
      <LocaleProvider locale="en-US">
        <WorkbenchLaunchpadNavigation {...props} open={false} workspaceMode="events" />
      </LocaleProvider>,
    )

    const dock = screen.getByRole('navigation', { name: copy.recentPages })
    const beforeClick = within(dock)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))

    fireEvent.click(within(dock).getByRole('button', { name: 'Map' }))

    const afterClick = within(dock)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))

    expect(beforeClick).toEqual([copy.home, 'Project Manager', 'Map', 'Events'])
    expect(afterClick).toEqual(beforeClick)
    expect(props.onRootWorkspaceOpen).toHaveBeenLastCalledWith('map')
  })

  it('appends visited root pages and never adds project page to the recent dock list', () => {
    const { props, rerender } = renderNavigation({ open: true, workspaceMode: 'mods' })

    const dialog = screen.getByRole('dialog', { name: copy.title })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Browser' }))
    expect(props.onRootWorkspaceOpen).toHaveBeenCalledWith('map')

    rerender(
      <LocaleProvider locale="en-US">
        <WorkbenchLaunchpadNavigation {...props} open={false} workspaceMode="map" />
      </LocaleProvider>,
    )

    const dock = screen.getByRole('navigation', { name: copy.recentPages })
    const buttons = within(dock)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))

    expect(buttons).toEqual([copy.home, 'Project Manager', 'Map'])
  })

  it('replaces the oldest recent page instead of promoting or growing the dock', () => {
    const { props, rerender } = renderNavigation({ open: true, workspaceMode: 'mods' })
    const visitRootPage = (mode: 'map' | 'events' | 'characters' | 'buildings' | 'items') => {
      fireEvent.click(within(screen.getByRole('dialog', { name: copy.title })).getByRole('button', { name: copy.rootModeLabels[mode] }))
      rerender(
        <LocaleProvider locale="en-US">
          <WorkbenchLaunchpadNavigation {...props} open workspaceMode={mode} />
        </LocaleProvider>,
      )
    }

    visitRootPage('map')
    visitRootPage('events')
    visitRootPage('characters')
    visitRootPage('buildings')
    visitRootPage('items')

    const dock = screen.getByRole('navigation', { name: copy.recentPages })
    const buttons = within(dock)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))

    expect(buttons).toEqual([copy.home, 'Project Manager', 'Events', 'Characters', 'Buildings', 'Items'])
  })

  it('does not render plugin tools or export center entries', () => {
    renderNavigation({ open: true })

    const dialog = screen.getByRole('dialog', { name: copy.title })

    expect(within(dialog).queryByRole('button', { name: 'Plugin Tools' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Export Center' })).toBeNull()
  })

  it('renders the project page as the first project section entry', () => {
    renderNavigation({ open: true })

    const dialog = screen.getByRole('dialog', { name: copy.title })
    const projectSection = within(dialog).getByRole('heading', { name: copy.projectChildren }).closest('section')
    const projectButtons = within(projectSection!)
      .getAllByRole('button')
      .filter((button) => button.classList.contains('workbench-launchpad-card'))

    expect(projectButtons[0]).toHaveAccessibleName('Project Page')
  })

  it('keeps the project page locked when no project is active', () => {
    const { props } = renderNavigation({ open: true })
    const projectPage = within(screen.getByRole('dialog', { name: copy.title })).getByRole('button', { name: 'Project Page' })

    expect(projectPage).toBeDisabled()
    fireEvent.click(projectPage)

    expect(props.onProjectWorkspaceOpen).not.toHaveBeenCalled()
    expect(props.onProjectManagementOpen).not.toHaveBeenCalled()
  })

  it('opens the project page as a project workspace when a project is active', () => {
    const { props } = renderNavigation({ open: true, hasActiveProject: true })

    fireEvent.click(within(screen.getByRole('dialog', { name: copy.title })).getByRole('button', { name: 'Project Page' }))

    expect(props.onProjectWorkspaceOpen).toHaveBeenCalledWith('mods')
    expect(props.onProjectManagementOpen).not.toHaveBeenCalled()
  })

  it('closes the launchpad with Escape', () => {
    const { props } = renderNavigation({ open: true })

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens the launchpad with Ctrl or Cmd K', () => {
    const { props } = renderNavigation()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    expect(props.onOpenChange).toHaveBeenCalledWith(true)
  })

  it('routes root pages through workspace mode changes', () => {
    const { props } = renderNavigation({ open: true })

    const dialog = screen.getByRole('dialog', { name: copy.title })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Browser' }))

    expect(props.onRootWorkspaceOpen).toHaveBeenCalledWith('map')
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('opens the create project path when making is requested without saved projects', () => {
    const { props } = renderNavigation({ open: true, hasActiveProject: false, projectSummaries: [] })

    const dialog = screen.getByRole('dialog', { name: copy.title })
    expect(within(dialog).getByText('No target project')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'New project' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(props.onProjectCreateOpen).toHaveBeenCalledTimes(1)
    const mapMaking = within(dialog).getByRole('button', { name: 'Map Making' })

    expect(mapMaking).toBeDisabled()
    fireEvent.click(mapMaking)
    expect(props.onProjectCreateOpen).toHaveBeenCalledTimes(1)
    expect(props.onProjectWorkspaceOpen).not.toHaveBeenCalled()
  })

  it('keeps making cards disabled when saved projects exist but none is active', () => {
    const { props } = renderNavigation({
      open: true,
      hasActiveProject: false,
      projectSummaries: [
        {
          draftStorageKey: 'festival-dialogue',
          projectName: 'Festival Dialogue Pack',
          projectUniqueId: 'Author.FestivalDialogue',
          lastDraftSavedAt: null,
          lastExportedAt: null,
        },
      ],
    })

    const dialog = screen.getByRole('dialog', { name: copy.title })
    expect(within(dialog).getByRole('button', { name: 'Choose project' })).toBeTruthy()
    const mapMaking = within(dialog).getByRole('button', { name: 'Map Making' })

    expect(mapMaking).toBeDisabled()
    fireEvent.click(mapMaking)
    expect(props.onProjectSelect).not.toHaveBeenCalled()
    expect(props.onProjectWorkspaceOpen).not.toHaveBeenCalled()
  })

  it('opens project making entries when a project is active', () => {
    const { props } = renderNavigation({ open: true, hasActiveProject: true })

    const dialog = screen.getByRole('dialog', { name: copy.title })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Map Making' }))

    expect(props.onProjectWorkspaceOpen).toHaveBeenCalledWith('map')
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('uses title bar dock placement without fixed floating positioning', () => {
    const { container } = renderNavigation({ dockPlacement: 'titlebar' })

    expect(container.querySelector('.workbench-quick-dock-titlebar')).toBeTruthy()
  })
})
