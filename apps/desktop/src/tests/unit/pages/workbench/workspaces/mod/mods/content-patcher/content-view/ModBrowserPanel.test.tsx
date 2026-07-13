import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { ModBrowserPanel } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-view/ModBrowserPanel'
import { getTranslationEditorCopy, getModWorkspaceCopy } from '@locales/api'
import { renderWithLocale } from '@test/renderWithLocale'

const copy = getModWorkspaceCopy('en-US')
const i18nCopy = getTranslationEditorCopy('en-US')

afterEach(() => {
  cleanup()
})

function buildProject(overrides: Partial<Parameters<typeof ModBrowserPanel>[0]['projects'][number]> = {}) {
  const base = {
    id: 'seasonal-garden',
    name: 'Seasonal Garden',
    author: 'Aly',
    version: '1.2.0',
    description: 'A patch-heavy content pack',
    uniqueId: 'Aly.SeasonalGarden',
    contentPackFor: 'Pathoschild.ContentPatcher',
    folderName: 'SeasonalGarden',
    pluginKind: 'content-patcher' as const,
    absolutePath: 'E:\\Mods\\SeasonalGarden',
    manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
    contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
    status: 'ready' as const,
    missingRequiredDependencies: [],
    hasI18n: false,
    i18nEntryCount: 0,
    ...overrides,
  }

  return {
    ...base,
    i18nEntryCount: base.i18nEntryCount ?? (base.hasI18n ? 3 : 0),
  }
}

describe('ModBrowserPanel', () => {
  it('shows external source actions and filters projects', () => {
    const onFilterChange = vi.fn()
    const onSelectProject = vi.fn()
    const onOpenFolder = vi.fn()
    const onOpenArchive = vi.fn()
    const onRefreshProjects = vi.fn()
    const projects = [buildProject(), buildProject({ id: 'festival-pack', name: 'Festival Pack', absolutePath: 'E:\\Mods\\FestivalPack' })]

    renderWithLocale(
      <ModBrowserPanel
        projects={projects}
        filteredProjects={projects}
        activeProjectPath={projects[0].absolutePath}
        modFilter=""
        contentPatcherOnly
        compatibleOnly
        onFilterChange={onFilterChange}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={onSelectProject}
        onOpenFolder={onOpenFolder}
        onOpenArchive={onOpenArchive}
        onRefreshProjects={onRefreshProjects}
      />,
    )

    expect(screen.getByRole('button', { name: copy.openExternalFolder })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.openExternalArchive })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.refreshProjects })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(copy.browserFilterPlaceholder), {
      target: { value: 'festival' },
    })
    expect(onFilterChange).toHaveBeenCalledWith('festival')

    fireEvent.click(screen.getByRole('button', { name: /Festival Pack/i }))
    expect(onSelectProject).toHaveBeenCalledWith('E:\\Mods\\FestivalPack')
  })

  it('shows a default-enabled CP-only toggle and notifies when it changes', () => {
    const onContentPatcherOnlyChange = vi.fn()

    renderWithLocale(
      <ModBrowserPanel
        projects={[buildProject()]}
        filteredProjects={[buildProject()]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly
        compatibleOnly
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={onContentPatcherOnlyChange}
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: copy.contentPatcherOnly })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle)
    expect(onContentPatcherOnlyChange).toHaveBeenCalledWith(false)
  })

  it('shows a default-enabled compatibility toggle and notifies when it changes', () => {
    const onCompatibleOnlyChange = vi.fn()

    renderWithLocale(
      <ModBrowserPanel
        projects={[buildProject()]}
        filteredProjects={[buildProject()]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly
        compatibleOnly
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={onCompatibleOnlyChange}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    const toggle = screen.getByRole('button', { name: copy.compatibleOnly })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(toggle)
    expect(onCompatibleOnlyChange).toHaveBeenCalledWith(false)
  })

  it('shows a guided empty state when there are no projects', () => {
    renderWithLocale(
      <ModBrowserPanel
        projects={[]}
        filteredProjects={[]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly
        compatibleOnly
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    const emptyState = screen.getByText(copy.browserLibraryEmptyTitle).closest('.panel-empty-state')
    expect(emptyState).toBeTruthy()
    expect(emptyState?.className).toContain('panel-empty-state')
    expect(screen.getAllByText(copy.browserLibraryEmptyDescription)).toHaveLength(1)
  })

  it('hides CP, compatibility and i18n filters in i18n mode', () => {
    renderWithLocale(
      <ModBrowserPanel
        projects={[buildProject({ hasI18n: true })]}
        filteredProjects={[buildProject({ hasI18n: true })]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly={false}
        compatibleOnly={false}
        i18nOnly
        mode="i18n"
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: copy.contentPatcherOnly })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.compatibleOnly })).toBeNull()
    expect(screen.queryByRole('button', { name: copy.i18nOnly })).toBeNull()
  })

  it('lets incompatible projects be selected in i18n mode', () => {
    const onSelectProject = vi.fn()
    const incompatibleProject = buildProject({
      id: 'needs-scaleup',
      name: 'Needs ScaleUp',
      absolutePath: 'E:\\Mods\\NeedsScaleUp',
      status: 'incompatible',
      missingRequiredDependencies: ['Platonymous.ScaleUp'],
      hasI18n: true,
    })

    renderWithLocale(
      <ModBrowserPanel
        projects={[incompatibleProject]}
        filteredProjects={[incompatibleProject]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly={false}
        compatibleOnly={false}
        i18nOnly
        mode="i18n"
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={vi.fn()}
        onI18nOnlyChange={vi.fn()}
        onSelectProject={onSelectProject}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    expect(screen.queryByText(copy.incompatibleProject)).toBeNull()

    const card = screen.getByRole('button', { name: /Needs ScaleUp/i })
    expect(card.getAttribute('disabled')).toBeNull()

    fireEvent.click(card)
    expect(onSelectProject).toHaveBeenCalledWith('E:\\Mods\\NeedsScaleUp')
  })

  describe('i18n mode', () => {
    it('shows i18n browser search, refresh and selects a project', () => {
      const onFilterChange = vi.fn()
      const onSelectProject = vi.fn()
      const onRefreshProjects = vi.fn()
      const projects = [
        buildProject({ hasI18n: true }),
        buildProject({ id: 'festival-pack', name: 'Festival Pack', absolutePath: 'E:\\Mods\\FestivalPack', hasI18n: true }),
      ]

      renderWithLocale(
        <ModBrowserPanel
          projects={projects}
          filteredProjects={projects}
          activeProjectPath={projects[0].absolutePath}
          modFilter=""
          contentPatcherOnly={false}
          compatibleOnly={false}
          i18nOnly
          mode="i18n"
          onFilterChange={onFilterChange}
          onContentPatcherOnlyChange={vi.fn()}
          onCompatibleOnlyChange={vi.fn()}
          onSelectProject={onSelectProject}
          onRefreshProjects={onRefreshProjects}
        />,
      )

      expect(screen.getByPlaceholderText(i18nCopy.browserSearchPlaceholder)).toBeTruthy()
      expect(screen.getByRole('button', { name: i18nCopy.browserRefreshProjects })).toBeTruthy()
      expect(screen.getByText(i18nCopy.browserProjectsCount(projects.length))).toBeTruthy()

      fireEvent.change(screen.getByPlaceholderText(i18nCopy.browserSearchPlaceholder), {
        target: { value: 'festival' },
      })
      expect(onFilterChange).toHaveBeenCalledWith('festival')

      fireEvent.click(screen.getByRole('button', { name: /Festival Pack/i }))
      expect(onSelectProject).toHaveBeenCalledWith('E:\\Mods\\FestivalPack')
    })

    it('hides plugin-kind badge, absolute path and incompatible badge in i18n mode', () => {
      const incompatibleProject = buildProject({
        id: 'needs-scaleup',
        name: 'Needs ScaleUp',
        absolutePath: 'E:\\Mods\\NeedsScaleUp',
        status: 'incompatible',
        missingRequiredDependencies: ['Platonymous.ScaleUp'],
        hasI18n: true,
      })

      renderWithLocale(
        <ModBrowserPanel
          projects={[incompatibleProject]}
          filteredProjects={[incompatibleProject]}
          activeProjectPath={null}
          modFilter=""
          contentPatcherOnly={false}
          compatibleOnly={false}
          i18nOnly
          mode="i18n"
          onFilterChange={vi.fn()}
          onContentPatcherOnlyChange={vi.fn()}
          onCompatibleOnlyChange={vi.fn()}
          onSelectProject={vi.fn()}
          onImportProject={vi.fn()}
          onRefreshProjects={vi.fn()}
        />,
      )

      expect(screen.queryByText('Content Patcher')).toBeNull()
      expect(screen.queryByText(copy.incompatibleProject)).toBeNull()
      expect(screen.queryByText(incompatibleProject.absolutePath)).toBeNull()

      const row = screen.getByRole('button', { name: /Needs ScaleUp/i })
      expect(row.getAttribute('disabled')).toBeNull()
    })

    it('exposes the active row and routes selection', () => {
      const activeProject = buildProject({ hasI18n: true })
      const inactiveProject = buildProject({
        id: 'festival-pack',
        name: 'Festival Pack',
        absolutePath: 'E:\\Mods\\FestivalPack',
        hasI18n: true,
      })

      const onSelectProject = vi.fn()
      renderWithLocale(
        <ModBrowserPanel
          projects={[activeProject, inactiveProject]}
          filteredProjects={[activeProject, inactiveProject]}
          activeProjectPath={activeProject.absolutePath}
          modFilter=""
          contentPatcherOnly={false}
          compatibleOnly={false}
          i18nOnly
          mode="i18n"
          onFilterChange={vi.fn()}
          onContentPatcherOnlyChange={vi.fn()}
          onCompatibleOnlyChange={vi.fn()}
          onSelectProject={onSelectProject}
          onImportProject={vi.fn()}
          onRefreshProjects={vi.fn()}
        />,
      )

      const activeRow = screen.getByRole('button', { name: /Seasonal Garden/i })
      const inactiveRow = screen.getByRole('button', { name: /Festival Pack/i })
      expect(activeRow).toHaveAttribute('aria-pressed', 'true')
      expect(inactiveRow).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByLabelText(i18nCopy.browserSelectedLabel)).toBeTruthy()
      fireEvent.click(inactiveRow)
      expect(onSelectProject).toHaveBeenCalledWith(inactiveProject.absolutePath)
    })

    it('shows an empty state when there are no projects', () => {
      renderWithLocale(
        <ModBrowserPanel
          projects={[]}
          filteredProjects={[]}
          activeProjectPath={null}
          modFilter=""
          contentPatcherOnly={false}
          compatibleOnly={false}
          i18nOnly
          mode="i18n"
          onFilterChange={vi.fn()}
          onContentPatcherOnlyChange={vi.fn()}
          onCompatibleOnlyChange={vi.fn()}
          onSelectProject={vi.fn()}
          onImportProject={vi.fn()}
          onRefreshProjects={vi.fn()}
        />,
      )

      expect(screen.getByText(i18nCopy.browserEmptyTitle)).toBeTruthy()
      expect(screen.getByText(i18nCopy.browserEmptyDescription)).toBeTruthy()
    })
  })
})
