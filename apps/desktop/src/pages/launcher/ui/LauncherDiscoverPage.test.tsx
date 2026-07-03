import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import { openLauncherUrl, type LauncherSettings } from '@features/launcher/api'
import { dismissNotification, publishNotification } from '@shared/ui/notifications'
import { useLauncherDiscover, useLauncherImage } from '@features/launcher'
import { applyAppUiStatePatch, getAppUiStateSnapshot, initializeAppUiState } from '@shared/lib/app-state'
import { createMockLauncherPort } from '@test/launcherTestPort'
import { renderWithLocaleAndLaunchers } from '@test/renderWithLocaleAndLaunchers'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import { LauncherDiscoverPage } from './LauncherDiscoverPage'

vi.mock('@features/launcher', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher')>('@features/launcher')
  return {
    ...actual,
    useLauncherDiscover: vi.fn(),
    useLauncherImage: vi.fn(() => ({
      imageUrl: null,
      error: null,
      loading: false,
    })),
  }
})

vi.mock('@shared/ui/notifications', () => ({
  publishNotification: vi.fn(),
  dismissNotification: vi.fn(),
}))

vi.mock('@shared/lib/app-state', () => ({
  getAppUiStateSnapshot: vi.fn(),
  initializeAppUiState: vi.fn(),
  applyAppUiStatePatch: vi.fn(),
}))

vi.mock('@features/launcher/api', async () => {
  const actual = await vi.importActual<typeof import('@features/launcher/api')>('@features/launcher/api')
  return {
    ...actual,
    openLauncherUrl: vi.fn(),
  }
})

const copy = editorCopy['zh-CN'].launcher
const useLauncherDiscoverMock = vi.mocked(useLauncherDiscover)
const publishNotificationMock = vi.mocked(publishNotification)
const dismissNotificationMock = vi.mocked(dismissNotification)
const useLauncherImageMock = vi.mocked(useLauncherImage)
const getAppUiStateSnapshotMock = vi.mocked(getAppUiStateSnapshot)
const initializeAppUiStateMock = vi.mocked(initializeAppUiState)
const applyAppUiStatePatchMock = vi.mocked(applyAppUiStatePatch)
const openLauncherUrlMock = vi.mocked(openLauncherUrl)
type DiscoverState = ReturnType<typeof useLauncherDiscover>

function createDiscoverState(overrides: Partial<DiscoverState> = {}): DiscoverState {
  return {
    items: [],
    query: '',
    timeRange: 'all' as const,
    pageSize: 20,
    totalCount: 0,
    totalPages: 0,
    sort: 'newest' as const,
    ascending: false,
    page: 1,
    hasMore: false,
    facets: {
      categories: [],
      languages: [],
      tags: [],
    },
    filters: {
      titleQuery: '',
      descriptionQuery: '',
      authorQuery: '',
      uploaderQuery: '',
      category: '',
      language: '',
      tagsInclude: '',
      tagsExclude: '',
      includeAdult: false,
      minFileSize: '',
      maxFileSize: '',
      minDownloads: '',
      maxDownloads: '',
      minEndorsements: '',
      maxEndorsements: '',
    },
    state: 'ready',
    error: null,
    blockedReason: null,
    setQuery: vi.fn(),
    setSort: vi.fn(),
    setAscending: vi.fn(),
    setTimeRange: vi.fn(),
    setPageSize: vi.fn(),
    setPage: vi.fn(),
    goToNextPage: vi.fn(),
    goToPreviousPage: vi.fn(),
    updateFilter: vi.fn(),
    revalidate: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  }
}

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: null,
    downloadPath: null,
    nexusApiKey: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    autoCheckModUpdates: true,
    ...overrides,
  }
}

describe('LauncherDiscoverPage', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
    useLauncherImageMock.mockReturnValue({
      imageUrl: null,
      error: null,
      loading: false,
    })
  })

  it('keeps discover browsing available without credentials', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState())

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(screen.queryByText(copy.states.credentialsRequired)).toBeNull()
    expect(screen.getByText(copy.discover.searchParametersSection)).toBeTruthy()
    expect(container.querySelector('.launcher-discover-console.panel-surface')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar.panel-surface')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: copy.discover.searchParametersSection }))
    expect(screen.getByPlaceholderText(copy.discover.titleSearchPlaceholder).hasAttribute('disabled')).toBe(false)
    expect(screen.getByPlaceholderText(copy.discover.titleSearchPlaceholder).className).toContain('control-input')
    expect(screen.getByRole('button', { name: copy.actions.refresh }).hasAttribute('disabled')).toBe(false)
  })

  it('binds the discover header search input to the catalog query', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    const setQuery = vi.fn()
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ query: 'tractor', setQuery }))

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    const searchInput = screen.getByRole('textbox', { name: copy.discover.searchPlaceholder })
    expect(searchInput).toHaveValue('tractor')

    fireEvent.change(searchInput, { target: { value: 'content patcher' } })

    expect(setQuery).toHaveBeenCalledWith('content patcher')
  })

  it('renders the project-aligned browse shell and result cards for discover browsing', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        items: [
          {
            modId: 44722,
            title: 'Joja Civic Center',
            summary: 'Welcome to the Joja Civic Center.',
            author: 'blue704',
            uploader: 'blue704',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
            imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png',
            category: 'Maps',
            createdAt: null,
            updatedAt: null,
            downloads: 12_345,
            endorsements: 678,
            fileSize: 512_000,
            updateAvailable: true,
          },
        ],
        totalCount: 28_891,
        totalPages: 1445,
        page: 1,
        facets: {
          categories: [{ name: 'Maps', count: 317 }],
          languages: [{ name: 'English', count: 16098 }],
          tags: [{ name: 'SMAPI', count: 18839 }],
        },
      }),
    )

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(screen.getByText(copy.discover.consoleTitle)).toBeTruthy()
    expect(screen.getByText(copy.discover.categorySection)).toBeTruthy()
    expect(screen.getByText((_, element) => element?.textContent === copy.discover.resultRange(1, 20, '28,891'))).toBeTruthy()
    expect(screen.queryByText("Browse the internet's best mods")).toBeNull()
    expect(screen.getByText('Joja Civic Center')).toBeTruthy()
    expect(screen.getByRole('button', { name: `${copy.library.detailsTitle}: Joja Civic Center` })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.actions.queueDownload })).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar-accordion')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-wall-card.panel-section')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-wall-title-slot')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-wall-summary-slot')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-wall')?.getAttribute('data-columns')).toBeNull()
    expect(container.querySelector('.launcher-discover-hero')).toBeNull()
    expect(container.querySelector('.launcher-discover-console-toolbar')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-toolbar-actions')).toBeNull()
    expect(container.querySelector('.launcher-discover-console-divider')).toBeNull()
    expect(screen.queryByRole('button', { name: copy.actions.loadMore })).toBeNull()
  })

  it('opens discover mod details on single click and the Nexus page on double click', async () => {
    vi.useFakeTimers()
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        items: [
          {
            modId: 44722,
            title: 'Joja Civic Center',
            summary: 'Welcome to the Joja Civic Center.',
            author: 'blue704',
            uploader: 'blue704',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
            imageUrl: null,
            category: 'Maps',
            createdAt: null,
            updatedAt: null,
            downloads: 12_345,
            endorsements: 678,
            fileSize: 512_000,
            updateAvailable: false,
          },
        ],
        totalCount: 1,
        totalPages: 1,
      }),
    )

    const launcherPort = createMockLauncherPort({
      loadRemoteModDetail: vi.fn().mockResolvedValue({
        modId: 44722,
        title: 'Joja Civic Center',
        summary: 'Full Nexus detail from the existing route.',
        author: 'blue704',
        version: '1.1.0',
        modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
        imageUrl: null,
        galleryImages: [],
        updatedAt: '2026-05-01T00:00:00Z',
        fileSize: 389_967,
        category: 'Maps',
        downloads: 98_765,
        endorsements: 1234,
        primaryFileId: 160463,
        primaryFileName: 'Joja Civic Center 1.1.0',
        primaryFileVersion: '1.1.0',
        primaryFileCategory: 'MAIN',
        primaryFileSize: 381,
        primaryFileSizeBytes: 389_967,
        primaryFileScanned: true,
        primaryFileScanStatus: 'VERIFIED',
        primaryFileChangelog: ['Compatibility updates and fixes.'],
        directDownloadEnabled: true,
        supportsVortex: true,
        requiredLoader: 'SMAPI',
        gameVersion: '1.6',
        archiveType: 'zip',
        updateRisk: 'Low',
        tags: ['SMAPI'],
        requirements: [],
        files: [
          {
            fileId: 160463,
            name: 'Joja Civic Center 1.1.0',
            version: '1.1.0',
            category: 'MAIN',
            size: 381,
            sizeBytes: 389_967,
            primary: true,
            scanned: true,
            scanStatus: 'VERIFIED',
            changelog: ['Compatibility updates and fixes.'],
            archiveType: 'zip',
          },
        ],
      }),
    })

    renderWithLocaleAndLaunchers(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
      undefined,
      launcherPort,
    )

    const cardButton = screen.getByRole('button', { name: `${copy.library.detailsTitle}: Joja Civic Center` })
    fireEvent.click(screen.getByRole('button', { name: copy.actions.openModPage }))

    expect(openLauncherUrlMock).toHaveBeenCalledWith({ url: 'https://www.nexusmods.com/stardewvalley/mods/44722' })
    openLauncherUrlMock.mockClear()

    fireEvent.click(cardButton)

    expect(openLauncherUrlMock).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180)
    })
    vi.useRealTimers()
    expect(screen.getByRole('dialog', { name: 'Joja Civic Center' })).toBeTruthy()
    expect(screen.getByText('Welcome to the Joja Civic Center.')).toBeTruthy()

    await waitFor(() => expect(launcherPort.loadRemoteModDetail).toHaveBeenCalledWith({ modId: 44722, includeFiles: false }))
    fireEvent.click(screen.getByRole('tab', { name: copy.library.modDetail.tabs.details }))
    await waitFor(() => expect(screen.getAllByText('Joja Civic Center 1.1.0').length).toBeGreaterThan(0))
    expect(screen.queryByText('VERIFIED')).toBeNull()

    fireEvent.doubleClick(cardButton)

    expect(openLauncherUrlMock).toHaveBeenCalledWith({ url: 'https://www.nexusmods.com/stardewvalley/mods/44722' })
  })

  it('opens the toolbar menus when the discover toolbar controls are clicked', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ totalCount: 30, totalPages: 2 }))

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.discover.timeRangeLabel }))
    expect(screen.getByRole('menu', { name: copy.discover.timeRangeLabel })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: copy.discover.timeRangeOptions.day })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: copy.discover.sortLabel }))
    const sortMenu = screen.getByRole('menu', { name: copy.discover.sortLabel })
    expect(sortMenu).toBeTruthy()
    expect(sortMenu.textContent).toContain(copy.discover.sortOptions.downloads)
  })

  it('restores and persists the top bar filter visibility state', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: true } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: true } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ totalCount: 30, totalPages: 2 }))

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    const filtersToggle = screen.getByRole('button', { name: copy.discover.showFilters })
    expect(filtersToggle).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar')).toBeNull()

    fireEvent.click(filtersToggle)

    expect(screen.getByRole('button', { name: copy.discover.hideFilters })).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar')).toBeTruthy()
    expect(applyAppUiStatePatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        launcher: expect.objectContaining({
          discoverToolbar: expect.objectContaining({
            filtersHidden: false,
          }),
        }),
      }),
    )
  })

  it('shows a circular loading overlay instead of the generic loading copy while discover is loading', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ state: 'loading' }))

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')
    const resultsViewport = container.querySelector('.launcher-discover-results-viewport')
    const loadingOverlay = screen.getByRole('status', { name: copy.discover.loadingResultsLabel })
    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true })

    expect(loadingOverlay).toBeTruthy()
    expect(screen.queryByText(copy.states.loading)).toBeNull()
    expect(screen.queryByText(copy.discover.empty)).toBeNull()
    expect(resultsViewport?.getAttribute('aria-busy')).toBe('true')
    expect(resultsViewport?.classList.contains('launcher-discover-results-viewport-loading')).toBe(true)
    expect(container.querySelector('.launcher-discover-wall-shell .launcher-discover-loading-overlay')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-results-viewport > .launcher-discover-loading-overlay')).toBeNull()
    expect(loadingOverlay.dispatchEvent(wheelEvent)).toBe(false)
    expect(wheelEvent.defaultPrevented).toBe(true)
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: copy.discover.loadingResults,
      }),
    )
    expect(dismissNotificationMock).not.toHaveBeenCalled()
  })

  it('auto-collapses the discover sidebar while the request is in an error state without persisting that collapse', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        state: 'error',
        error: 'Nexus Public GraphQL: timeout',
      }),
    )

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(container.querySelector('.launcher-discover-shell-filters-hidden')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar')).toBeNull()
    expect(screen.getByRole('button', { name: copy.discover.showFilters }).hasAttribute('disabled')).toBe(true)
    expect(
      applyAppUiStatePatchMock.mock.calls.some(
        ([payload]) =>
          (payload as { launcher?: { discoverToolbar?: { filtersHidden?: boolean } } }).launcher?.discoverToolbar?.filtersHidden === true,
      ),
    ).toBe(false)
  })

  it('shows a cover placeholder message while a discover cover is still loading', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        items: [
          {
            modId: 44722,
            title: 'Joja Civic Center',
            summary: 'Welcome to the Joja Civic Center.',
            author: 'blue704',
            uploader: 'blue704',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
            imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png',
            category: 'Maps',
            createdAt: null,
            updatedAt: null,
            downloads: 12_345,
            endorsements: 678,
            fileSize: 512_000,
            updateAvailable: false,
          },
        ],
        totalCount: 1,
        totalPages: 1,
      }),
    )
    useLauncherImageMock.mockReturnValue({
      imageUrl: null,
      error: null,
      loading: true,
    })

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(screen.getByText(copy.discover.loadingCover)).toBeTruthy()
    expect(container.querySelector('.launcher-discover-wall-cover-fallback')).toBeTruthy()
  })

  it('renders a centered blocked-state card with retry, diagnostics, and expandable technical details', async () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    const revalidate = vi.fn()
    const onNavigateToDiagnostics = vi.fn()
    const onRetryDiagnostics = vi.fn().mockResolvedValue(undefined)
    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        blockedReason: [
          'Nexus Public GraphQL: Forced offline by debug override.',
          'Nexus Image CDN: Forced offline by debug override.',
        ].join('\n'),
        revalidate,
      }),
    )

    const { container } = renderWithLocale(
      <LauncherDiscoverPage
        settings={createSettings()}
        onQueueDownload={vi.fn()}
        onNavigateToDiagnostics={onNavigateToDiagnostics}
        onRetryDiagnostics={onRetryDiagnostics}
      />,
      'zh-CN',
    )

    expect(container.querySelector('.launcher-discover-content-blocked')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-blocked-state')).toBeTruthy()
    expect(screen.getByText(copy.discover.blockedTitle)).toBeTruthy()
    expect(screen.getByText(copy.discover.blockedDetail)).toBeTruthy()
    expect(screen.getByText(/Nexus Public GraphQL: Forced offline by debug override\./)).toBeTruthy()
    expect(screen.queryByText(/Nexus Image CDN: Forced offline by debug override\./)).toBeNull()
    expect(screen.getByRole('button', { name: copy.discover.blockedRetryAction })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.discover.blockedDiagnosticsAction })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.discover.blockedCopyLogsAction })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: copy.discover.blockedDetailsExpandAction }))

    expect(screen.getByText(/Nexus Image CDN: Forced offline by debug override\./)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: copy.discover.blockedRetryAction }))
    fireEvent.click(screen.getByRole('button', { name: copy.discover.blockedDiagnosticsAction }))

    await waitFor(() => {
      expect(onRetryDiagnostics).toHaveBeenCalledTimes(1)
      expect(revalidate).toHaveBeenCalledTimes(1)
      expect(onNavigateToDiagnostics).toHaveBeenCalledTimes(1)
    })
  })

  it('auto-collapses the discover sidebar while route diagnostics are blocking discover without persisting that collapse', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        blockedReason: 'Nexus Public GraphQL: Forced offline by debug override.',
        facets: {
          categories: [{ name: 'Maps', count: 317 }],
          languages: [{ name: 'English', count: 16098 }],
          tags: [{ name: 'SMAPI', count: 18839 }],
        },
      }),
    )

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(container.querySelector('.launcher-discover-shell-filters-hidden')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar')).toBeNull()
    expect(screen.getByRole('button', { name: copy.discover.showFilters }).hasAttribute('disabled')).toBe(true)
    expect(
      applyAppUiStatePatchMock.mock.calls.some(
        ([payload]) =>
          (payload as { launcher?: { discoverToolbar?: { filtersHidden?: boolean } } }).launcher?.discoverToolbar?.filtersHidden === true,
      ),
    ).toBe(false)
  })

  it('shows tag suggestions from remote facets inside the tag input menu and applies them on click', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    const updateFilter = vi.fn()

    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        facets: {
          categories: [],
          languages: [],
          tags: Array.from({ length: 72 }, (_, index) => ({
            name: index === 0 ? 'SMAPI' : `Remote tag ${index + 1}`,
            count: 18839 - index,
          })),
        },
        updateFilter,
      }),
    )

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(screen.queryByRole('listbox', { name: copy.discover.tagsIncludeSuggestionsLabel })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: copy.discover.tagsSection }))
    fireEvent.focus(screen.getByPlaceholderText(copy.discover.tagsIncludePlaceholder))

    expect(screen.getByRole('listbox', { name: copy.discover.tagsIncludeSuggestionsLabel })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Remote tag 72/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /SMAPI/i }))

    expect(updateFilter).toHaveBeenCalledWith('tagsInclude', 'SMAPI')
  })

  it('uses range presets by default and keeps manual range inputs behind advanced controls', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    const updateFilter = vi.fn()
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ updateFilter }))

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: copy.discover.limitsSection }))
    expect(screen.queryByPlaceholderText(copy.discover.noMinimumPlaceholder)).toBeNull()

    fireEvent.click(
      within(screen.getByRole('group', { name: copy.discover.rangePresetsLabel(copy.discover.downloadsLabel) })).getByRole('button', {
        name: copy.discover.rangePresetLabels['10kPlus'],
      }),
    )
    expect(updateFilter).toHaveBeenCalledWith('minDownloads', '10000')
    expect(updateFilter).toHaveBeenCalledWith('maxDownloads', '')

    fireEvent.click(screen.getAllByRole('button', { name: copy.discover.advancedAction })[1])
    fireEvent.change(screen.getByPlaceholderText(copy.discover.noMinimumPlaceholder), { target: { value: '12345' } })
    expect(updateFilter).toHaveBeenCalledWith('minDownloads', '12345')
  })

  it('renders a real paginator and forwards previous/next and jump actions', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    const setPage = vi.fn()
    const goToNextPage = vi.fn()
    const goToPreviousPage = vi.fn()

    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        items: [
          {
            modId: 44722,
            title: 'Joja Civic Center',
            summary: 'Welcome to the Joja Civic Center.',
            author: 'blue704',
            uploader: 'blue704',
            modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
            imageUrl: null,
            category: 'Maps',
            createdAt: null,
            updatedAt: null,
            downloads: 12_345,
            endorsements: 678,
            fileSize: 512_000,
            updateAvailable: true,
          },
        ],
        totalCount: 28_891,
        totalPages: 1445,
        page: 3,
        setPage,
        goToNextPage,
        goToPreviousPage,
      }),
    )

    const { container } = renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')
    const resultsViewport = container.querySelector('.launcher-discover-results-viewport') as HTMLDivElement
    const discoverContent = container.querySelector('.launcher-discover-content') as HTMLDivElement
    Object.defineProperty(resultsViewport, 'scrollTo', {
      configurable: true,
      value: vi.fn((options?: ScrollToOptions) => {
        resultsViewport.scrollTop = Number(options?.top ?? 0)
        resultsViewport.scrollLeft = Number(options?.left ?? 0)
      }),
    })
    Object.defineProperty(discoverContent, 'scrollTo', {
      configurable: true,
      value: vi.fn((options?: ScrollToOptions) => {
        discoverContent.scrollTop = Number(options?.top ?? 0)
        discoverContent.scrollLeft = Number(options?.left ?? 0)
      }),
    })

    expect(screen.getByRole('button', { name: copy.discover.previousPage })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.discover.nextPage })).toBeTruthy()
    expect(screen.getByRole('button', { name: copy.discover.pageLabel(3) })).toBeTruthy()
    expect(screen.getByText('1445')).toBeTruthy()
    expect(screen.getByLabelText(copy.discover.jumpToPage)).toBeTruthy()

    resultsViewport.scrollTop = 480
    discoverContent.scrollTop = 80
    fireEvent.click(screen.getByRole('button', { name: copy.discover.nextPage }))
    expect(goToNextPage).toHaveBeenCalled()
    expect(resultsViewport.scrollTop).toBe(0)
    expect(discoverContent.scrollTop).toBe(0)

    resultsViewport.scrollTop = 360
    discoverContent.scrollTop = 60
    fireEvent.click(screen.getByRole('button', { name: copy.discover.previousPage }))
    expect(goToPreviousPage).toHaveBeenCalled()
    expect(resultsViewport.scrollTop).toBe(0)
    expect(discoverContent.scrollTop).toBe(0)

    resultsViewport.scrollTop = 240
    fireEvent.click(screen.getByRole('button', { name: copy.discover.pageLabel(2) }))
    expect(setPage).toHaveBeenCalledWith(2)
    expect(resultsViewport.scrollTop).toBe(0)

    resultsViewport.scrollTop = 120
    fireEvent.change(screen.getByLabelText(copy.discover.jumpToPage), { target: { value: '120' } })
    fireEvent.keyDown(screen.getByLabelText(copy.discover.jumpToPage), { key: 'Enter', code: 'Enter' })
    expect(setPage).toHaveBeenCalledWith(120)
    expect(resultsViewport.scrollTop).toBe(0)
  })

  it('keeps the sidebar accordion in single-open mode with the first section open by default', () => {
    getAppUiStateSnapshotMock.mockReturnValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    initializeAppUiStateMock.mockResolvedValue({
      launcher: { discoverToolbar: { sort: 'newest', ascending: false, timeRange: 'all', pageSize: 20, filtersHidden: false } },
    } as never)
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ totalCount: 28_891, totalPages: 1445 }))

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    const categoryToggle = screen.getByRole('button', { name: copy.discover.categorySection })
    const tagsToggle = screen.getByRole('button', { name: copy.discover.tagsSection })

    expect(categoryToggle.getAttribute('aria-expanded')).toBe('true')
    expect(categoryToggle.getAttribute('aria-controls')).toBe('launcher-discover-rail-body-category')
    expect(tagsToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText(copy.discover.categoryLabels['Gameplay Mechanics'])).toBeTruthy()
    expect(screen.queryByText(copy.discover.tagsIncludeLabel)).toBeNull()

    fireEvent.click(tagsToggle)

    expect(categoryToggle.getAttribute('aria-expanded')).toBe('false')
    expect(tagsToggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByText(copy.discover.categoryLabels['Gameplay Mechanics'])).toBeNull()
    expect(screen.getByText(copy.discover.tagsIncludeLabel)).toBeTruthy()
  })
})
