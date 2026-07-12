import { describe, expect, it, vi } from 'vite-plus/test'
import { fireEvent, screen } from '@testing-library/react'
import { WorkbenchWorkspaceToolbar, WorkbenchEditGate } from '@widgets/workbench-shell'
import { renderWithLocale } from '@test/renderWithLocale'
import { editorCopy } from '@locales/api'

const navCopy = editorCopy['en-US'].workbenchNavigation

describe('WorkbenchWorkspaceToolbar', () => {
  it('renders module title and browse/edit controls', () => {
    const onWorkspaceViewModeChange = vi.fn()
    renderWithLocale(
      <WorkbenchWorkspaceToolbar
        workspaceMode="characters"
        workspaceViewMode="preview"
        registeredWorkbenchViewId={null}
        hasActiveProject
        onWorkspaceViewModeChange={onWorkspaceViewModeChange}
      />,
    )

    expect(screen.getByText('Characters')).toBeTruthy()
    expect(document.querySelector('.workbench-ws-toolbar-sub')).toHaveTextContent(navCopy.shellBrowseMode)
    expect(screen.getByRole('button', { name: navCopy.shellBrowseMode })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: navCopy.shellEditMode })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: navCopy.shellEditMode }))
    expect(onWorkspaceViewModeChange).toHaveBeenCalledWith('edit')
  })

  it('marks edit as locked when no project is active', () => {
    renderWithLocale(
      <WorkbenchWorkspaceToolbar
        workspaceMode="map"
        workspaceViewMode="edit"
        registeredWorkbenchViewId={null}
        hasActiveProject={false}
        onWorkspaceViewModeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: navCopy.shellEditMode })).toHaveAttribute('data-locked', 'true')
  })

  it('hides browse and edit state for registered single-view pages', () => {
    renderWithLocale(
      <WorkbenchWorkspaceToolbar
        workspaceMode="map"
        workspaceViewMode="edit"
        registeredWorkbenchViewId="i18n-generator"
        registeredWorkbenchViewTitle="i18n"
        hasActiveProject={false}
        onWorkspaceViewModeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('i18n')).toBeTruthy()
    expect(screen.queryByRole('button', { name: navCopy.shellBrowseMode })).toBeNull()
    expect(screen.queryByRole('button', { name: navCopy.shellEditMode })).toBeNull()
    expect(screen.queryByText(navCopy.shellEditMode)).toBeNull()
  })
})

describe('WorkbenchEditGate', () => {
  it('offers select-project and stay-browse actions', () => {
    const onSelectProject = vi.fn()
    const onStayBrowse = vi.fn()
    renderWithLocale(<WorkbenchEditGate onSelectProject={onSelectProject} onStayBrowse={onStayBrowse} />)

    fireEvent.click(screen.getByRole('button', { name: navCopy.shellEditLockedSelectProject }))
    expect(onSelectProject).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: navCopy.shellEditLockedStayBrowse }))
    expect(onStayBrowse).toHaveBeenCalledTimes(1)
  })
})
