import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherSettings } from '../../../lib/desktop'
import { dismissNotification, publishNotification } from '../../../lib/app/notifications'
import { useLauncherDiscover } from '../../../lib/launcher/useLauncherDiscover'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDiscoverPage } from './LauncherDiscoverPage'

vi.mock('../../../lib/launcher/useLauncherDiscover', () => ({
  useLauncherDiscover: vi.fn(),
}))

vi.mock('../../../lib/app/notifications', () => ({
  publishNotification: vi.fn(),
  dismissNotification: vi.fn(),
}))

vi.mock('../../../lib/launcher/imageLoader', () => ({
  useLauncherImage: () => ({
    imageUrl: null,
    error: null,
    loading: false,
  }),
}))

const copy = editorCopy['zh-CN'].launcher
const useLauncherDiscoverMock = vi.mocked(useLauncherDiscover)
const publishNotificationMock = vi.mocked(publishNotification)
const dismissNotificationMock = vi.mocked(dismissNotification)
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
    setQuery: vi.fn(),
    setSort: vi.fn(),
    setAscending: vi.fn(),
    setTimeRange: vi.fn(),
    setPageSize: vi.fn(),
    setPage: vi.fn(),
    goToNextPage: vi.fn(),
    goToPreviousPage: vi.fn(),
    updateFilter: vi.fn(),
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
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    ...overrides,
  }
}

describe('LauncherDiscoverPage', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.clearAllMocks()
  })

  it('keeps discover browsing available without credentials', () => {
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState())

    const { container } = renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )

    expect(screen.queryByText(copy.states.credentialsRequired)).toBeNull()
    expect(screen.getByText('Search Parameters')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-console.panel-surface')).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar.panel-surface')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Search Parameters' }))
    expect(screen.getByPlaceholderText('Search titles').hasAttribute('disabled')).toBe(false)
    expect(screen.getByPlaceholderText('Search titles').className).toContain('control-input')
    expect(screen.getByRole('button', { name: copy.actions.refresh }).hasAttribute('disabled')).toBe(false)
  })

  it('renders the project-aligned browse shell and result cards for discover browsing', () => {
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

    const { container } = renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )

    expect(screen.getByText('Nexus Mods')).toBeTruthy()
    expect(screen.getByText('Category')).toBeTruthy()
    expect(
      screen.getByText((_, element) => element?.textContent === 'Showing 1 - 20 of 28,891 results'),
    ).toBeTruthy()
    expect(screen.queryByText("Browse the internet's best mods")).toBeNull()
    expect(screen.getByText('Joja Civic Center')).toBeTruthy()
    expect(screen.getByRole('link', { name: new RegExp(copy.actions.openModPage) })).toBeTruthy()
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

  it('opens the toolbar menus when the discover toolbar controls are clicked', () => {
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ totalCount: 30, totalPages: 2 }))

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    fireEvent.click(screen.getByRole('button', { name: 'Time range' }))
    expect(screen.getByRole('menu', { name: 'Time range' })).toBeTruthy()
    expect(screen.getByRole('menuitemradio', { name: '24 hours' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    const sortMenu = screen.getByRole('menu', { name: 'Sort' })
    expect(sortMenu).toBeTruthy()
    expect(sortMenu.textContent).toContain('Downloads')
  })

  it('restores and persists the top bar filter visibility state', () => {
    window.localStorage.setItem(
      'modforge:launcher-discover-toolbar:v1',
      JSON.stringify({ filtersHidden: true }),
    )
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ totalCount: 30, totalPages: 2 }))

    const { container } = renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )

    const filtersToggle = screen.getByRole('button', { name: /Show filters/i })
    expect(filtersToggle).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar')).toBeNull()

    fireEvent.click(filtersToggle)

    expect(screen.getByRole('button', { name: /Hide filters/i })).toBeTruthy()
    expect(container.querySelector('.launcher-discover-sidebar')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem('modforge:launcher-discover-toolbar:v1') ?? '{}')).toMatchObject({
      filtersHidden: false,
    })
  })

  it('shows a circular loading overlay instead of the generic loading copy while discover is loading', () => {
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ state: 'loading' }))

    const { container } = renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )
    const resultsViewport = container.querySelector('.launcher-discover-results-viewport')
    const loadingOverlay = screen.getByRole('status', { name: 'Loading discover results' })
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
    expect(publishNotificationMock).toHaveBeenCalled()
    expect(dismissNotificationMock).not.toHaveBeenCalled()
  })

  it('shows tag suggestions from remote facets inside the tag input menu and applies them on click', () => {
    const updateFilter = vi.fn()

    useLauncherDiscoverMock.mockReturnValue(
      createDiscoverState({
        facets: {
          categories: [],
          languages: [],
          tags: [
          { name: 'SMAPI', count: 18839 },
          { name: 'Expansion', count: 912 },
          ],
        },
        updateFilter,
      }),
    )

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(screen.queryByRole('listbox', { name: 'Includes suggestions' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    fireEvent.focus(screen.getByPlaceholderText('e.g. expansion, ui'))

    expect(screen.getByRole('listbox', { name: 'Includes suggestions' })).toBeTruthy()
    fireEvent.click(screen.getByRole('option', { name: /SMAPI/i }))

    expect(updateFilter).toHaveBeenCalledWith('tagsInclude', 'SMAPI')
  })

  it('renders a real paginator and forwards previous/next and jump actions', () => {
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

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Page 3' })).toBeTruthy()
    expect(screen.getByText('1445')).toBeTruthy()
    expect(screen.getByLabelText('Jump to page')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(goToNextPage).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(goToPreviousPage).toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Jump to page'), { target: { value: '120' } })
    fireEvent.keyDown(screen.getByLabelText('Jump to page'), { key: 'Enter', code: 'Enter' })
    expect(setPage).toHaveBeenCalledWith(120)
  })

  it('keeps the sidebar accordion in single-open mode with the first section open by default', () => {
    useLauncherDiscoverMock.mockReturnValue(createDiscoverState({ totalCount: 28_891, totalPages: 1445 }))

    renderWithLocale(<LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />, 'zh-CN')

    const categoryToggle = screen.getByRole('button', { name: 'Category' })
    const tagsToggle = screen.getByRole('button', { name: 'Tags' })

    expect(categoryToggle.getAttribute('aria-expanded')).toBe('true')
    expect(categoryToggle.getAttribute('aria-controls')).toBe('launcher-discover-rail-body-category')
    expect(tagsToggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('Gameplay Mechanics')).toBeTruthy()
    expect(screen.queryByText('Includes')).toBeNull()

    fireEvent.click(tagsToggle)

    expect(categoryToggle.getAttribute('aria-expanded')).toBe('false')
    expect(tagsToggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.queryByText('Gameplay Mechanics')).toBeNull()
    expect(screen.getByText('Includes')).toBeTruthy()
  })
})
