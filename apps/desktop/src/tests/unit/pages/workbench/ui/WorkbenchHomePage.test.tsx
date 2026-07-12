import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { WorkbenchHomePage } from '@pages/workbench/ui/WorkbenchHomePage'
import type { StudioDeskModel } from '@features/cp-maker'
import { editorCopy } from '@locales/api'

const navCopy = editorCopy['en-US'].workbenchNavigation

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

function activeProjectModel(extra: Partial<StudioDeskModel> = {}) {
  return createModel({
    projectName: 'Festival Dialogue Pack',
    projectVersion: '1.0.0',
    projectUniqueId: 'Author.FestivalDialogue',
    hasActiveDraft: true,
    gallery: {
      counts: { all: 1 },
      projects: [
        {
          draftStorageKey: 'festival-dialogue',
          title: 'Festival Dialogue Pack',
          uniqueId: 'Author.FestivalDialogue',
          lastEditedAt: Date.now(),
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
    ...extra,
  })
}

function renderHome(overrides: Partial<Parameters<typeof WorkbenchHomePage>[0]> = {}) {
  const props: Parameters<typeof WorkbenchHomePage>[0] = {
    workspaceMode: 'map',
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
    onCloseProject: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...renderWithLocale(<WorkbenchHomePage {...props} />),
  }
}

describe('WorkbenchHomePage shell states', () => {
  it('renders the no-project launchpad with create/import and recent project open', () => {
    const onProjectCreateOpen = vi.fn()
    const onProjectImport = vi.fn()
    const onProjectSelect = vi.fn()
    renderHome({ onProjectCreateOpen, onProjectImport, onProjectSelect })

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    expect(home.getAttribute('data-content')).toBe('none')
    expect(within(home).getByRole('group', { name: navCopy.shellProjectManagement })).toBeTruthy()
    expect(within(home).getByText(navCopy.shellRecentProjects)).toBeTruthy()
    expect(within(home).getByLabelText(navCopy.shellNavBrowseGroup)).toBeTruthy()

    fireEvent.click(within(home).getByRole('button', { name: new RegExp(`^${navCopy.newProjectAction}`) }))
    expect(onProjectCreateOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(home).getByRole('button', { name: new RegExp(`^${navCopy.importProjectAction}`) }))
    expect(onProjectImport).toHaveBeenCalledTimes(1)

    fireEvent.click(within(home).getByRole('button', { name: /Festival Dialogue Pack/i }))
    expect(onProjectSelect).toHaveBeenCalledWith('festival-dialogue', null)
  })

  it('guards browse links behind a configured game directory without blocking project actions', () => {
    const onGameDirectoryAction = vi.fn()
    const onProjectCreateOpen = vi.fn()
    renderHome({
      gameDirectoryReady: false,
      gameDirectoryStatus: { tone: 'idle', message: '' },
      onGameDirectoryAction,
      onProjectCreateOpen,
    })

    expect(screen.getByText('Game directory not configured')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${navCopy.rootModeLabels.map}`) }))
    expect(onGameDirectoryAction).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${navCopy.newProjectAction}`) }))
    expect(onProjectCreateOpen).toHaveBeenCalled()
  })

  it('renders the empty-world create-first list without filler copy', () => {
    const onProjectWorkspaceOpen = vi.fn()
    const onCloseProject = vi.fn()
    renderHome({
      hasActiveProject: true,
      studioDeskModel: activeProjectModel(),
      onProjectWorkspaceOpen,
      onCloseProject,
    })

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    expect(home.getAttribute('data-content')).toBe('empty')
    expect(within(home).queryByText(navCopy.shellEmptyWorldLead)).toBeNull()
    expect(within(home).getByText(navCopy.shellCreateFirst)).toBeTruthy()
    expect(within(home).queryByText(navCopy.shellCreateMapHint)).toBeNull()

    fireEvent.click(within(home).getByRole('button', { name: new RegExp(`^${navCopy.shellCreateMap}`) }))
    expect(onProjectWorkspaceOpen).toHaveBeenCalledWith('map')

    fireEvent.click(within(home).getByRole('button', { name: navCopy.shellCloseProject }))
    expect(onCloseProject).toHaveBeenCalledTimes(1)
  })

  it('renders the rich dual-column overview with continue work and compact attention', () => {
    const onProjectWorkspaceOpen = vi.fn()
    const onRootWorkspaceOpen = vi.fn()
    const onExportProject = vi.fn()
    renderHome({
      hasActiveProject: true,
      studioDeskModel: activeProjectModel({
        stats: {
          eventCount: 2,
          mapCount: 3,
          festivalCount: 0,
          assetCount: 1,
          conflictCount: 0,
        },
        workspaceEntrypoints: [
          { kind: 'independent-workspace', workspaceId: 'map', patchCount: 3 },
          { kind: 'independent-workspace', workspaceId: 'events', patchCount: 2 },
        ],
        recentInspirations: [
          {
            patchId: 'patch-town',
            kind: 'map',
            title: 'Town Overlay',
            target: 'Maps/Town',
            action: 'EditMap',
            updatedAt: Date.now() - 3_600_000,
            status: 'modified',
            workspaceId: 'map',
          },
        ],
      }),
      taskSummary: {
        exportCount: 1,
        conflictCount: 0,
        directoryStatus: { tone: 'ready', message: 'Validated directory' },
      },
      onProjectWorkspaceOpen,
      onRootWorkspaceOpen,
      onExportProject,
    })

    const home = screen.getByRole('region', { name: 'Workbench Home' })
    expect(home.getAttribute('data-content')).toBe('rich')
    expect(home.querySelector('.workbench-shell-home-body')).toBeTruthy()
    expect(home.querySelector('.workbench-shell-home-count-row')).toBeTruthy()
    expect(within(home).getAllByText('Town Overlay')).toHaveLength(2)
    expect(within(home).getByText('3')).toBeTruthy()
    expect(within(home).getByText(navCopy.shellContentOverview)).toBeTruthy()
    expect(within(home).getByText(navCopy.shellAttention)).toBeTruthy()
    expect(within(home).getByText(navCopy.pendingExportMetric)).toBeTruthy()
    expect(within(home).queryByText(navCopy.pendingExportDetail)).toBeNull()
    expect(within(home).getByText(navCopy.gameDirectoryTaskTitle)).toBeTruthy()

    fireEvent.click(within(home).getByRole('button', { name: navCopy.shellContinueEdit }))
    expect(onProjectWorkspaceOpen).toHaveBeenCalledWith('map')

    fireEvent.click(within(home).getByRole('button', { name: navCopy.rootModeLabels.events }))
    expect(onRootWorkspaceOpen).toHaveBeenCalledWith('events')

    fireEvent.click(within(home).getByRole('button', { name: navCopy.shellExportAction }))
    expect(onExportProject).toHaveBeenCalledTimes(1)
  })

  it('opens a recent project from the no-project list with pending maker mode', () => {
    const onProjectSelect = vi.fn()
    renderHome({ makerPending: 'map', onProjectSelect })

    fireEvent.click(screen.getByRole('button', { name: /Festival Dialogue Pack/i }))
    expect(onProjectSelect).toHaveBeenCalledWith('festival-dialogue', 'map')
  })
})
