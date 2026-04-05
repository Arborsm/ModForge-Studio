import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { editorCopy, getSettingsMenuCopy } from './lib/editor-shell'

const LOCALE_STORAGE_KEY = 'modforge:locale'

vi.mock('./components/DevDebugOverlay', () => ({
  DevDebugOverlay: () => null,
}))

vi.mock('./components/InitializationOverlay', () => ({
  default: () => null,
}))

vi.mock('./components/StatusBar', () => ({
  default: () => null,
}))

vi.mock('./components/WorkspaceLayout', () => ({
  WorkspaceLayout: () => <div data-testid="workspace-layout" />,
}))

vi.mock('./lib/desktop', () => ({
  canUseDesktopHost: () => false,
  clearDesktopLocaleCache: vi.fn(),
  closeCurrentWindow: vi.fn(),
  isCurrentWindowFullscreen: vi.fn(async () => false),
  listKnownGameDirectories: vi.fn(async () => []),
  minimizeCurrentWindow: vi.fn(),
  toggleFullscreenCurrentWindow: vi.fn(async () => false),
  toggleMaximizeCurrentWindow: vi.fn(),
}))

vi.mock('./lib/react/defer', () => ({
  scheduleDeferred: (callback: () => void) => {
    callback()
    return () => {}
  },
}))

vi.mock('./lib/app/workspacePanels', () => ({
  buildWorkspacePanels: () => [],
}))

vi.mock('./lib/app/useMapWorkspace', () => ({
  useMapWorkspace: () => ({
    workspaceStatus: { tone: 'ready', message: '' },
    resourcePreloadState: { active: false, message: '', currentLabel: null, completed: 0, total: 0 },
    gameDirectory: '',
    setGameDirectory: vi.fn(),
    directoryInfo: { rootPath: 'C:/StardewValley' },
    mapAssets: [],
    activeAsset: null,
    mapDocument: null,
    worldAtlasDocument: null,
    hoverInfo: null,
    setHoverInfo: vi.fn(),
    showGameWorldAdditions: false,
    setShowGameWorldAdditions: vi.fn(),
  }),
}))

vi.mock('./lib/app/useEventWorkspace', () => ({
  useEventWorkspace: () => ({
    eventAssets: [],
    eventStatusMessage: '',
    selectedEvent: null,
  }),
}))

vi.mock('./lib/app/useCharacterWorkspace', () => ({
  useCharacterWorkspace: () => ({
    characters: [],
    characterStatusMessage: '',
  }),
}))

vi.mock('./lib/app/useBuildingWorkspace', () => ({
  useBuildingWorkspace: () => ({
    constructibleGroups: [],
    worldBuildings: [],
    buildingStatusMessage: '',
  }),
}))

vi.mock('./lib/app/useItemWorkspace', () => ({
  useItemWorkspace: () => ({
    items: [],
    itemStatusMessage: '',
  }),
}))

vi.mock('./lib/app/useModWorkspace', () => ({
  useModWorkspace: () => ({
    modDiagnostics: [],
    modHasUnsavedChanges: false,
    modProjects: [],
    modStatusMessage: '',
  }),
}))

describe('App locale ownership', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('light') ? false : true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.localStorage.clear()
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'en-US',
    })
  })

  it('updates downstream shell copy immediately when locale changes through Settings', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en-US')
    const englishSettingsCopy = getSettingsMenuCopy('en-US')

    render(<App />)

    expect(screen.getByRole('button', { name: editorCopy['en-US'].nav.map })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: englishSettingsCopy.title }))

    const localeGroup = await screen.findByRole('radiogroup', { name: englishSettingsCopy.languageLabel })
    const chineseOption = screen.getByRole('radio', { name: englishSettingsCopy.localeLabels['zh-CN'] })

    expect(localeGroup).toBeInTheDocument()

    fireEvent.click(chineseOption)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: editorCopy['en-US'].nav.map })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
  })

  it('initializes App locale from a valid stored locale value', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh-CN')

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: getSettingsMenuCopy('zh-CN').title })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('falls back from an invalid stored locale to navigator language heuristics', async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'es-ES')
    Object.defineProperty(window.navigator, 'language', {
      configurable: true,
      value: 'zh-CN',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: editorCopy['zh-CN'].nav.map })).toBeInTheDocument()
    })
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh-CN')
  })
})
