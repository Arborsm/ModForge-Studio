import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  LauncherLibraryModSummary,
  LauncherLibraryState,
  LauncherSettings,
} from '../desktop'
import {
  loadLauncherLibraryState,
  saveLauncherLibraryState,
  scanLauncherLibrary,
  setLauncherModEnabled,
} from '../desktop'
import { useLauncherLibrary } from './useLauncherLibrary'

vi.mock('../desktop', async () => {
  const actual = await vi.importActual<typeof import('../desktop')>('../desktop')
  return {
    ...actual,
    loadLauncherLibraryState: vi.fn(),
    saveLauncherLibraryState: vi.fn(),
    scanLauncherLibrary: vi.fn(),
    setLauncherModEnabled: vi.fn(),
  }
})

const loadLauncherLibraryStateMock = vi.mocked(loadLauncherLibraryState)
const saveLauncherLibraryStateMock = vi.mocked(saveLauncherLibraryState)
const scanLauncherLibraryMock = vi.mocked(scanLauncherLibrary)
const setLauncherModEnabledMock = vi.mocked(setLauncherModEnabled)

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: 'E:\\Games\\Stardew Valley',
    modsPath: 'E:\\Games\\Stardew Valley\\Mods',
    downloadPath: 'E:\\Downloads\\Mods',
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    ...overrides,
  }
}

function createLibraryState(overrides: Partial<LauncherLibraryState> = {}): LauncherLibraryState {
  return {
    storageFolders: [
      {
        id: 'unsorted',
        name: 'Unsorted',
        modKeys: [],
      },
    ],
    packPresets: [],
    currentPackId: null,
    scopeMode: 'all',
    ...overrides,
  }
}

function createMod(overrides: Partial<LauncherLibraryModSummary> = {}): LauncherLibraryModSummary {
  return {
    id: 'mod-visible',
    labelKey: 'ModForge.Visible',
    name: 'Visible Mod',
    author: 'ModForge',
    version: '1.0.0',
    description: 'Visible mod.',
    uniqueId: 'ModForge.Visible',
    folderName: 'Visible Mod',
    absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Visible Mod',
    enabled: true,
    nexusModId: 101,
    updateKeys: ['Nexus:101'],
    modUrl: 'https://www.nexusmods.com/stardewvalley/mods/101',
    imageUrl: null,
    missingRequiredDependencies: [],
    ...overrides,
  }
}

describe('useLauncherLibrary', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('filters to current pack members when scope mode is current-pack', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
        ],
        currentPackId: 'farm',
        scopeMode: 'current-pack',
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          name: 'Farm Animals Expanded',
          uniqueId: 'ModForge.A',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          name: 'NPC Adventures',
          uniqueId: 'ModForge.B',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
        }),
      ],
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()))
    await act(async () => {
      await result.current.refresh()
    })

    await waitFor(() => {
      expect(result.current.scopeMode).toBe('current-pack')
      expect(result.current.filteredMods.map((item) => item.id)).toEqual(['mod-a'])
    })
  })

  it('assigns selected mods to one storage folder with single ownership', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        storageFolders: [
          {
            id: 'core',
            name: 'Core',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'addons',
            name: 'Addons',
            modKeys: [],
          },
          {
            id: 'unsorted',
            name: 'Unsorted',
            modKeys: ['ModForge.B'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()))
    await act(async () => {
      await result.current.refresh()
    })

    act(() => {
      result.current.toggleModSelection('mod-a')
      result.current.toggleModSelection('mod-b')
    })

    await act(async () => {
      await result.current.assignSelectionToFolder('addons')
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'core',
          name: 'Core',
          modKeys: [],
        },
        {
          id: 'addons',
          name: 'Addons',
          modKeys: ['ModForge.A', 'ModForge.B'],
        },
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      packPresets: [],
      currentPackId: null,
      scopeMode: 'all',
    })
  })

  it('allows pack presets to keep multi-membership', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
          },
        ],
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()))
    await act(async () => {
      await result.current.refresh()
    })

    act(() => {
      result.current.toggleModSelection('mod-a')
      result.current.toggleModSelection('mod-b')
    })

    await act(async () => {
      await result.current.addSelectionToPack('social')
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      packPresets: [
        {
          id: 'farm',
          name: 'Farm',
          modKeys: ['ModForge.A'],
        },
        {
          id: 'social',
          name: 'Social',
          modKeys: ['ModForge.B', 'ModForge.A'],
        },
      ],
      currentPackId: null,
      scopeMode: 'all',
    })
  })

  it('applyCurrentPack leaves only pack members enabled', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
        ],
        currentPackId: 'farm',
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
          enabled: false,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
          enabled: true,
          absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
        }),
      ],
    })
    setLauncherModEnabledMock.mockResolvedValue({
      absolutePath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
      enabled: true,
    })

    const { result } = renderHook(() => useLauncherLibrary(createSettings()))
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.applyCurrentPack()
    })

    expect(setLauncherModEnabledMock).toHaveBeenCalledTimes(2)
    expect(setLauncherModEnabledMock).toHaveBeenNthCalledWith(1, {
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Farm Animals Expanded',
      enabled: true,
    })
    expect(setLauncherModEnabledMock).toHaveBeenNthCalledWith(2, {
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\NPC Adventures',
      enabled: false,
    })
  })

  it('replacePackMods overwrites the current pack membership from selected card ids', async () => {
    loadLauncherLibraryStateMock.mockResolvedValue(
      createLibraryState({
        packPresets: [
          {
            id: 'farm',
            name: 'Farm',
            modKeys: ['ModForge.A'],
          },
          {
            id: 'social',
            name: 'Social',
            modKeys: ['ModForge.B'],
          },
        ],
        currentPackId: 'farm',
      }),
    )
    scanLauncherLibraryMock.mockResolvedValue({
      modsPath: 'E:\\Games\\Stardew Valley\\Mods',
      mods: [
        createMod({
          id: 'mod-a',
          labelKey: 'ModForge.A',
          uniqueId: 'ModForge.A',
        }),
        createMod({
          id: 'mod-b',
          labelKey: 'ModForge.B',
          uniqueId: 'ModForge.B',
        }),
      ],
    })
    saveLauncherLibraryStateMock.mockImplementation(async (request) => request)

    const { result } = renderHook(() => useLauncherLibrary(createSettings()))
    await act(async () => {
      await result.current.refresh()
    })

    await act(async () => {
      await result.current.replacePackMods('farm', ['mod-b'])
    })

    expect(saveLauncherLibraryStateMock).toHaveBeenCalledWith({
      storageFolders: [
        {
          id: 'unsorted',
          name: 'Unsorted',
          modKeys: [],
        },
      ],
      packPresets: [
        {
          id: 'farm',
          name: 'Farm',
          modKeys: ['ModForge.B'],
        },
        {
          id: 'social',
          name: 'Social',
          modKeys: ['ModForge.B'],
        },
      ],
      currentPackId: 'farm',
      scopeMode: 'all',
    })
  })
})
