import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModBrowserPanel } from './ModBrowserPanel'
import { getModWorkspaceCopy } from '../../lib/editor-shell'
import { renderWithLocale } from '../../test/renderWithLocale'

const copy = getModWorkspaceCopy('en-US')

afterEach(() => {
  cleanup()
})

function buildProject(overrides: Partial<Parameters<typeof ModBrowserPanel>[0]['projects'][number]> = {}) {
  return {
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
    ...overrides,
  }
}

describe('ModBrowserPanel', () => {
  it('shows the quick-start actions and filters projects', () => {
    const onFilterChange = vi.fn()
    const onSelectProject = vi.fn()
    const onImportProject = vi.fn()
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
        onImportProject={onImportProject}
        onRefreshProjects={onRefreshProjects}
      />,
    )

    expect(screen.getByText('Get Started')).toBeTruthy()
    expect(
      screen.queryByText('Import a mod, refresh the scan, then pick one project to continue editing in the main workspace.'),
    ).toBeNull()
    expect(screen.getByRole('button', { name: copy.importProject })).toBeTruthy()
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

  it('uses the shared light browser shell and card treatment', () => {
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
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    const quickStartSection = screen.getByText('Get Started').closest('section')
    const projectLibrarySection = screen.getByText('Project Library').closest('section')
    const projectsStatCard = screen.getByText(copy.projectsLabel).closest('div')

    expect(quickStartSection?.className).toContain('panel-surface')
    expect(projectLibrarySection?.className).toContain('panel-surface')
    expect(projectLibrarySection?.className).toContain('min-h-0')
    expect(projectLibrarySection?.className).toContain('flex-1')
    expect(projectsStatCard?.className).toContain('bg-[color-mix(in_srgb,var(--bg-panel)_95%,white_5%)]')
  })

  it('uses the same light browser card style as other browser grids for project rows', () => {
    const activeProject = buildProject()
    const inactiveProject = buildProject({ id: 'festival-pack', name: 'Festival Pack', absolutePath: 'E:\\Mods\\FestivalPack' })

    renderWithLocale(
      <ModBrowserPanel
        projects={[activeProject, inactiveProject]}
        filteredProjects={[activeProject, inactiveProject]}
        activeProjectPath={activeProject.absolutePath}
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

    const activeCard = screen.getByRole('button', { name: /Seasonal Garden/i })
    const inactiveCard = screen.getByRole('button', { name: /Festival Pack/i })
    expect(activeCard.className).toContain('rounded-[20px]')
    expect(activeCard.className).toContain('px-4')
    expect(activeCard.className).toContain('py-3')
    expect(activeCard.className).toContain('bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_12%,transparent),color-mix(in_srgb,var(--accent)_6%,var(--bg-panel)))]')
    expect(activeCard.className).not.toContain('panel-list-card')
    expect(inactiveCard.className).toContain('rounded-[20px]')
    expect(inactiveCard.className).toContain('bg-[var(--bg-panel)]')
    expect(inactiveCard.className).toContain('px-4')
    expect(inactiveCard.className).toContain('py-3')
    expect(inactiveCard.className).toContain('hover:bg-[var(--bg-panel-muted)]')
    expect(inactiveCard.className).not.toContain('panel-list-card')
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

    const emptyState = screen.getByText('No projects yet').closest('.panel-empty-state')
    expect(emptyState).toBeTruthy()
    expect(emptyState?.className).toContain('panel-empty-state')
    expect(screen.getAllByText('Import a mod or refresh the scan to populate the workspace list.')).toHaveLength(2)
  })

  it('uses a higher-contrast badge treatment for non-CP projects', () => {
    renderWithLocale(
      <ModBrowserPanel
        projects={[buildProject({ id: 'archive-helper', name: 'Archive Helper', pluginKind: 'unknown', status: 'unsupported' })]}
        filteredProjects={[buildProject({ id: 'archive-helper', name: 'Archive Helper', pluginKind: 'unknown', status: 'unsupported' })]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly={false}
        compatibleOnly={false}
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    const badge = screen.getByText('Unknown')
    expect(badge.className).toContain('rounded-md')
    expect(badge.className).toContain('bg-[color-mix(in_srgb,var(--bg-panel-muted)_88%,transparent)]')
    expect(badge.className).toContain('text-[var(--text-primary)]')
    expect(badge.className).not.toContain('text-amber-200')
  })

  it('uses a higher-contrast badge treatment for CP projects on light cards', () => {
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
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    const badge = screen.getByText('Content Patcher')
    expect(badge.className).toContain('rounded-md')
    expect(badge.className).toContain('whitespace-nowrap')
    expect(badge.className).toContain('bg-[color-mix(in_srgb,var(--bg-panel-muted)_88%,transparent)]')
    expect(badge.className).toContain('text-[color-mix(in_srgb,var(--text-primary)_88%,#065f46)]')
    expect(badge.className).not.toContain('text-emerald-200')
  })

  it('shows missing required dependency details and blocks selecting incompatible projects', () => {
    const onSelectProject = vi.fn()
    const incompatibleProject = buildProject({
      id: 'needs-scaleup',
      name: 'Needs ScaleUp',
      absolutePath: 'E:\\Mods\\NeedsScaleUp',
      status: 'incompatible',
      missingRequiredDependencies: ['Platonymous.ScaleUp'],
    })

    renderWithLocale(
      <ModBrowserPanel
        projects={[incompatibleProject]}
        filteredProjects={[incompatibleProject]}
        activeProjectPath={null}
        modFilter=""
        contentPatcherOnly
        compatibleOnly={false}
        onFilterChange={vi.fn()}
        onContentPatcherOnlyChange={vi.fn()}
        onCompatibleOnlyChange={vi.fn()}
        onSelectProject={onSelectProject}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    expect(screen.getByText(copy.incompatibleProject)).toBeTruthy()
    expect(screen.getByText(copy.missingRequiredDependencies('Platonymous.ScaleUp'))).toBeTruthy()

    const card = screen.getByRole('button', { name: /Needs ScaleUp/i })
    expect(card.getAttribute('disabled')).not.toBeNull()

    fireEvent.click(card)
    expect(onSelectProject).not.toHaveBeenCalled()
  })
})
