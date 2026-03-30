import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModBrowserPanel } from './ModBrowserPanel'
import { getModWorkspaceCopy } from '../../lib/plugins/copy'

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

    render(
      <ModBrowserPanel
        copy={copy}
        projects={projects}
        filteredProjects={projects}
        activeProjectPath={projects[0].absolutePath}
        modFilter=""
        onFilterChange={onFilterChange}
        onSelectProject={onSelectProject}
        onImportProject={onImportProject}
        onRefreshProjects={onRefreshProjects}
      />,
    )

    expect(screen.getByText('Get Started')).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.importProject })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.refreshProjects })).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText(copy.browserFilterPlaceholder), {
      target: { value: 'festival' },
    })
    expect(onFilterChange).toHaveBeenCalledWith('festival')

    fireEvent.click(screen.getByRole('button', { name: /Festival Pack/i }))
    expect(onSelectProject).toHaveBeenCalledWith('E:\\Mods\\FestivalPack')
  })

  it('shows a guided empty state when there are no projects', () => {
    render(
      <ModBrowserPanel
        copy={copy}
        projects={[]}
        filteredProjects={[]}
        activeProjectPath={null}
        modFilter=""
        onFilterChange={vi.fn()}
        onSelectProject={vi.fn()}
        onImportProject={vi.fn()}
        onRefreshProjects={vi.fn()}
      />,
    )

    expect(screen.getByText('No projects yet')).toBeTruthy()
    expect(screen.getAllByText('Import a mod or refresh the scan to populate the workspace list.')).toHaveLength(2)
  })
})
