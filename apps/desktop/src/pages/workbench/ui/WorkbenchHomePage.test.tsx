import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import WorkbenchHomePage from './WorkbenchHomePage'
import type { StudioDeskModel } from '@features/cp-maker'

function createModel(overrides: Partial<StudioDeskModel> = {}): StudioDeskModel {
  const model: StudioDeskModel = {
    projectName: '',
    projectDescription: '',
    projectAuthor: '',
    projectVersion: '',
    projectUniqueId: '',
    hasActiveDraft: false,
    draftSummaries: [],
    gallery: {
      counts: { all: 1 },
      projects: [
        {
          draftStorageKey: 'festival-dialogue',
          title: 'Festival Dialogue Pack',
          uniqueId: 'Author.FestivalDialogue',
          lastEditedAt: null,
          lastExportedAt: null,
          isCurrent: false,
          statuses: ['neverExported'],
          searchText: 'Festival Dialogue Pack Author.FestivalDialogue festival-dialogue',
          coverTone: 'festival',
          conflictCount: 0,
          needsMetadata: false,
        },
      ],
    },
    recentInspirations: [],
    workspaceEntrypoints: [],
    stats: {
      eventCount: 0,
      mapCount: 0,
      festivalCount: 0,
      assetCount: 0,
      conflictCount: 0,
    },
    worldBible: {
      configSchema: [],
      tokens: [],
      customLocations: [],
      actors: [],
      story: [],
      items: [],
      scenes: [],
      conflictCount: 0,
    },
    exportSummary: {
      lastExportedAt: null,
      fileList: [],
    },
  }
  return { ...model, ...overrides }
}

function renderHome(overrides: Partial<Parameters<typeof WorkbenchHomePage>[0]> = {}) {
  const props: Parameters<typeof WorkbenchHomePage>[0] = {
    workspaceMode: 'mods',
    workspaceViewMode: 'edit',
    hasActiveProject: false,
    gameDirectoryReady: true,
    gameDirectoryStatus: { tone: 'ready', message: 'Validated directory' },
    studioDeskModel: createModel(),
    makerPending: null,
    taskSummary: {
      exportCount: 0,
      conflictCount: 0,
      directoryStatus: { tone: 'ready', message: 'Validated directory' },
    },
    devViews: [],
    onBackToWorkspace: vi.fn(),
    onRootWorkspaceOpen: vi.fn(),
    onProjectWorkspaceOpen: vi.fn(),
    onDevViewOpen: vi.fn(),
    onProjectCreateOpen: vi.fn(),
    onProjectImport: vi.fn(),
    onProjectSelect: vi.fn(),
    onProjectCopy: vi.fn(),
    onProjectDelete: vi.fn(),
    onProjectPropertiesOpen: vi.fn(),
    onExportProject: vi.fn(),
    onMakerPendingChange: vi.fn(),
    onGameDirectoryAction: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...renderWithLocale(<WorkbenchHomePage {...props} />),
  }
}

describe('WorkbenchHomePage', () => {
  it('does not focus or open command search by default', () => {
    renderHome()

    expect(screen.queryByRole('listbox', { name: 'Search results' })).toBeNull()
    expect(document.activeElement).not.toBe(screen.getByRole('combobox'))
  })

  it('guards global browsing behind a configured game directory without blocking project actions', () => {
    const onGameDirectoryAction = vi.fn()
    const onProjectCreateOpen = vi.fn()
    renderHome({
      gameDirectoryReady: false,
      gameDirectoryStatus: { tone: 'idle', message: '' },
      onGameDirectoryAction,
      onProjectCreateOpen,
    })

    expect(screen.getByText('Game directory not configured')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Maps' }))
    expect(onGameDirectoryAction).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    expect(onProjectCreateOpen).toHaveBeenCalled()
  })

  it('opens project making directly when a project is active', () => {
    const onProjectWorkspaceOpen = vi.fn()
    renderHome({
      hasActiveProject: true,
      studioDeskModel: createModel({
        gallery: {
          counts: { all: 1 },
          projects: [
            {
              draftStorageKey: 'festival-dialogue',
              title: 'Festival Dialogue Pack',
              uniqueId: 'Author.FestivalDialogue',
              lastEditedAt: null,
              lastExportedAt: null,
              isCurrent: true,
              statuses: ['export'],
              searchText: 'Festival Dialogue Pack Author.FestivalDialogue festival-dialogue',
              coverTone: 'festival',
              conflictCount: 0,
              needsMetadata: false,
            },
          ],
        },
      }),
      onProjectWorkspaceOpen,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Map Making' }))

    expect(onProjectWorkspaceOpen).toHaveBeenCalledWith('map')
  })

  it('focuses the in-flow project library for pending maker selection', () => {
    const onMakerPendingChange = vi.fn()
    renderHome({ onMakerPendingChange })

    fireEvent.click(screen.getByRole('button', { name: 'Map Making' }))

    expect(onMakerPendingChange).toHaveBeenCalledWith('map')
    expect(screen.getByRole('region', { name: 'Project Library' }).className).toContain('is-focus')
    expect(screen.queryByRole('dialog', { name: 'Project Library' })).toBeNull()
  })

  it('selects a project from the in-flow library with the pending maker mode', () => {
    const onProjectSelect = vi.fn()
    renderHome({ makerPending: 'map', onProjectSelect })

    const library = screen.getByRole('region', { name: 'Project Library' })
    expect(within(library).getByText('Choose a project for Map Making')).toBeTruthy()
    fireEvent.click(within(library).getByRole('button', { name: 'Open Project Festival Dialogue Pack' }))

    expect(onProjectSelect).toHaveBeenCalledWith('festival-dialogue', 'map')
  })

  it('runs command search results from the keyboard', () => {
    const onProjectImport = vi.fn()
    renderHome({ onProjectImport })

    const search = screen.getByRole('combobox')
    fireEvent.change(search, { target: { value: 'import' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onProjectImport).toHaveBeenCalled()
  })
})
