import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LocaleProvider } from '@locales/localeContext'
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

  it('renders only the current recent root pages in the dock', () => {
    renderNavigation({ workspaceMode: 'characters' })

    const dock = screen.getByRole('navigation', { name: copy.recentPages })

    expect(within(dock).getByRole('button', { name: copy.home })).toBeTruthy()
    expect(within(dock).getByRole('button', { name: 'Project Manager' })).toBeTruthy()
    expect(within(dock).getByRole('button', { name: 'Characters' })).toBeTruthy()
    expect(within(dock).getByRole('button', { name: 'Mods' })).toBeTruthy()
    expect(within(dock).queryByRole('button', { name: 'Translations' })).toBeNull()
    expect(within(dock).queryByRole('button', { name: 'Events' })).toBeNull()
  })

  it('moves visited root pages to the front of the recent dock list', () => {
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

    expect(buttons).toEqual([copy.home, 'Project Manager', 'Map', 'Mods'])
  })

  it('does not render plugin tools or export center entries', () => {
    renderNavigation({ open: true })

    const dialog = screen.getByRole('dialog', { name: copy.title })

    expect(within(dialog).queryByRole('button', { name: 'Plugin Tools' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Export Center' })).toBeNull()
  })

  it('opens project management from the dock project shortcut', () => {
    const { props } = renderNavigation()

    fireEvent.click(screen.getByRole('button', { name: 'Project Manager' }))

    expect(props.onProjectManagementOpen).toHaveBeenCalled()
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
    expect(within(dialog).getByRole('button', { name: 'New project' })).toBeTruthy()
    const mapMaking = within(dialog).getByRole('button', { name: 'Map Making' })

    expect(mapMaking).toBeDisabled()
    fireEvent.click(mapMaking)
    expect(props.onProjectCreateOpen).not.toHaveBeenCalled()
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
})
