import { cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherSettings } from '../../../lib/desktop'
import { useLauncherDiscover } from '../../../lib/launcher/useLauncherDiscover'
import { useLauncherRemoteModDetail } from '../../../lib/launcher/useLauncherRemoteModDetail'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDiscoverPage } from './LauncherDiscoverPage'

vi.mock('../../../lib/launcher/useLauncherDiscover', () => ({
  useLauncherDiscover: vi.fn(),
}))

vi.mock('../../../lib/launcher/useLauncherRemoteModDetail', () => ({
  useLauncherRemoteModDetail: vi.fn(),
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
const useLauncherRemoteModDetailMock = vi.mocked(useLauncherRemoteModDetail)

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
  beforeEach(() => {
    useLauncherRemoteModDetailMock.mockReturnValue({
      detail: null,
      state: 'idle',
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps discover browsing available without credentials', () => {
    useLauncherDiscoverMock.mockReturnValue({
      items: [],
      query: '',
      sort: 'newest',
      ascending: false,
      page: 1,
      hasMore: false,
      state: 'ready',
      error: null,
      setQuery: vi.fn(),
      setSort: vi.fn(),
      setAscending: vi.fn(),
      loadMore: vi.fn(),
      refresh: vi.fn(),
    })

    renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )

    expect(screen.queryByText(copy.states.credentialsRequired)).toBeNull()
    expect(screen.getByPlaceholderText(copy.fields.searchDiscover)).toBeTruthy()
    expect(screen.getByPlaceholderText(copy.fields.searchDiscover)).not.toHaveAttribute('disabled')
    expect(screen.getByRole('button', { name: copy.actions.refresh })).not.toHaveAttribute('disabled')
  })

  it('renders remote mod detail metadata when a discover item is selected', () => {
    useLauncherDiscoverMock.mockReturnValue({
      items: [
        {
          modId: 44722,
          title: 'Joja Civic Center',
          summary: 'Welcome to the Joja Civic Center.',
          author: 'blue704',
          modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
          imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png',
        },
      ],
      query: '',
      sort: 'newest',
      ascending: false,
      page: 1,
      hasMore: false,
      state: 'ready',
      error: null,
      setQuery: vi.fn(),
      setSort: vi.fn(),
      setAscending: vi.fn(),
      loadMore: vi.fn(),
      refresh: vi.fn(),
    })
    useLauncherRemoteModDetailMock.mockReturnValue({
      detail: {
        modId: 44722,
        title: 'Joja Civic Center',
        summary: 'Welcome to the Joja Civic Center.',
        author: null,
        version: '1.0.0',
        modUrl: 'https://www.nexusmods.com/stardewvalley/mods/44722',
        imageUrl: 'https://staticdelivery.nexusmods.com/mods/1303/images/thumbnails/44722/44722-cover.png',
        galleryImages: [
          'https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-a.png',
          'https://staticdelivery.nexusmods.com/mods/1303/images/44722/44722-b.png',
        ],
      },
      state: 'ready',
      error: null,
    })

    renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )

    expect(screen.getByText(copy.fields.currentVersion)).toBeTruthy()
    expect(screen.getByText('1.0.0')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})
