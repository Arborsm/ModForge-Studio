import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { StudioDeskProjectGallery } from './StudioDeskProjectGallery'
import type { StudioDeskModel } from '../model/studioDeskModel'

function createModel(projects: StudioDeskModel['gallery']['projects']): StudioDeskModel {
  return {
    projectName: '',
    projectDescription: '',
    projectAuthor: '',
    projectVersion: '',
    projectUniqueId: '',
    hasActiveDraft: false,
    draftSummaries: [],
    gallery: {
      counts: { all: projects.length },
      projects,
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
}

function renderGallery(overrides: Partial<Parameters<typeof StudioDeskProjectGallery>[0]> = {}) {
  const props: Parameters<typeof StudioDeskProjectGallery>[0] = {
    model: createModel([
      {
        draftStorageKey: 'current-pack',
        title: 'Current Pack',
        uniqueId: 'Author.CurrentPack',
        lastEditedAt: null,
        lastExportedAt: null,
        isCurrent: true,
        statuses: ['export', 'conflict'],
        searchText: 'Current Pack Author.CurrentPack current-pack',
        coverTone: 'festival',
        conflictCount: 1,
        needsMetadata: false,
      },
      {
        draftStorageKey: 'festival-dialogue',
        title: 'Festival Dialogue',
        uniqueId: 'Author.FestivalDialogue',
        lastEditedAt: null,
        lastExportedAt: null,
        isCurrent: false,
        statuses: ['neverExported'],
        searchText: 'Festival Dialogue Author.FestivalDialogue festival-dialogue',
        coverTone: 'harbor',
        conflictCount: 0,
        needsMetadata: false,
      },
    ]),
    onCreateDraftRequest: vi.fn(),
    onImportDraftRequest: vi.fn(),
    onOpenDraft: vi.fn(),
    onCopyDraft: vi.fn(),
    onDeleteDraft: vi.fn(),
    onEditCurrentDraftProperties: vi.fn(),
    ...overrides,
  }

  return {
    props,
    ...renderWithLocale(<StudioDeskProjectGallery {...props} />),
  }
}

describe('StudioDeskProjectGallery', () => {
  it('renders project status badges and opens rows', () => {
    const onOpenDraft = vi.fn()
    renderGallery({ onOpenDraft })

    expect(screen.getByText('Current active')).toBeTruthy()
    expect(screen.getByText('Pending export')).toBeTruthy()
    expect(screen.getByText('Has conflicts')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open Project Festival Dialogue' }))
    expect(onOpenDraft).toHaveBeenCalledWith('festival-dialogue')
  })

  it('uses pending action buttons for non-current projects', () => {
    const onOpenDraft = vi.fn()
    renderGallery({ onOpenDraft, pendingActionLabel: 'Use for Map Making' })

    fireEvent.click(screen.getByRole('button', { name: 'Use for Map Making' }))

    expect(onOpenDraft).toHaveBeenCalledWith('festival-dialogue')
  })

  it('filters to an empty state and exposes create/import actions', () => {
    const onCreateDraftRequest = vi.fn()
    const onImportDraftRequest = vi.fn()
    renderGallery({ onCreateDraftRequest, onImportDraftRequest })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), { target: { value: 'missing' } })

    expect(screen.getByText('No matching rules or tokens')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }))

    expect(onImportDraftRequest).toHaveBeenCalled()
    expect(onCreateDraftRequest).toHaveBeenCalled()
  })

  it('offers copy and delete from the context menu', () => {
    const onCopyDraft = vi.fn()
    renderGallery({ onCopyDraft })

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Festival Dialogue' }))
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Copy' }))

    expect(onCopyDraft).toHaveBeenCalledWith('festival-dialogue')
  })
})
