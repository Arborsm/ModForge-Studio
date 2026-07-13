import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { editorCopy } from '@locales/api'
import { useCharacterWorkspace } from '@pages/workbench/workspaces/character/state/useCharacterWorkspace'

vi.mock('@entities/game/api', () => ({
  loadTextAsset: vi.fn(),
}))

vi.mock('@shared/lib/assets', async () => {
  const actual = await vi.importActual<typeof import('@shared/lib/assets')>('@shared/lib/assets')
  return {
    ...actual,
    loadImageResourceFromPath: vi.fn(() => new Promise(() => {})),
  }
})

vi.mock('@entities/mod/api', () => ({
  scanModAssetIndex: vi.fn(),
  loadContentPatcherResultAsset: vi.fn(),
}))

import { loadTextAsset } from '@entities/game/api'
import { loadImageResourceFromPath } from '@shared/lib/assets'
import { loadContentPatcherResultAsset, scanModAssetIndex } from '@entities/mod/api'

const copy = editorCopy['en-US'].charactersPanel

const baseCharacters = {
  Emily: {
    DisplayName: 'Emily',
    TextureName: 'Emily',
    Size: { X: 16, Y: 32 },
    Breather: true,
    Appearance: [
      {
        Id: 'Vanilla.EmilyWinter',
        Condition: 'SEASON winter',
        Sprite: 'Characters/Emily',
        Portrait: 'Portraits/Emily_Winter',
        Precedence: -100,
      },
    ],
  },
}

const moddedCharacters = {
  Emily: {
    DisplayName: 'Emily',
    TextureName: 'Emily',
    Size: { X: 16, Y: 32 },
    Breather: true,
    Appearance: [
      {
        Id: 'Vanilla.EmilyWinter',
        Condition: 'SEASON winter',
        Sprite: 'Characters/Emily',
        Portrait: 'Portraits/Emily_Winter',
        Precedence: -100,
      },
      {
        Id: 'Example.Mod.EmilySpring',
        Condition: 'SEASON spring',
        Sprite: 'Characters/Emily',
        Portrait: 'Portraits/Emily_Spring',
        Precedence: -1200,
      },
      {
        Id: 'Example.Mod.EmilyFall',
        Condition: 'SEASON fall',
        Sprite: 'Characters/Emily',
        Portrait: 'Portraits/Emily_Fall',
        Precedence: -1200,
      },
    ],
  },
}

describe('useCharacterWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(loadTextAsset).mockImplementation(async (_rootPath, assetPath) => {
      if (assetPath === 'Content\\Data\\Characters.xnb') {
        return {
          path: assetPath,
          absolutePath: `E:\\Games\\Stardew Valley\\${assetPath}`,
          relativePath: assetPath,
          locale: null,
          content: JSON.stringify(baseCharacters),
        }
      }

      throw new Error(`Unexpected asset request: ${assetPath}`)
    })

    vi.mocked(scanModAssetIndex).mockResolvedValue({
      mods: [
        {
          modId: 'Example.Mod',
          modName: 'Example Mod',
          modPath: 'E:\\Mods\\Example.Mod',
          pluginKind: 'content-patcher',
          maps: [],
          events: [],
          characters: [
            {
              key: 'Emily',
              label: 'Emily',
              targets: ['Data/Characters', 'Characters/Emily', 'Portraits/Emily_Spring'],
              patchIds: ['content.json:0#target:0#from:0'],
            },
          ],
          buildings: [],
          items: [],
        },
      ],
    })

    vi.mocked(loadContentPatcherResultAsset).mockResolvedValue({
      target: {
        path: 'Data/Characters',
        assetKind: 'json',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
      trace: [],
      result: {
        kind: 'json',
        json: moddedCharacters,
        imageDataUrl: null,
        originalImageDataUrl: null,
        originalImageSource: null,
        mapDebug: null,
      },
      diagnostics: [],
      exportable: true,
    })
  })

  it('uses modded Data/Characters appearance variants for the selected mod character', async () => {
    const { result } = renderHook(() =>
      useCharacterWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
        copy,
        enableVisualAssets: false,
      }),
    )

    await waitFor(() => {
      expect(result.current.activeCharacter?.key).toBe('Emily')
    })

    expect(result.current.activeCharacter?.variants.map((variant) => variant.id)).toEqual(['default', 'Vanilla.EmilyWinter'])

    act(() => {
      result.current.setBrowserSourceMode('mod')
    })

    await waitFor(() => {
      expect(result.current.activeModCharacterSelectionId).not.toBeNull()
      expect(result.current.activeCharacter?.variants.map((variant) => variant.id)).toEqual([
        'default',
        'Vanilla.EmilyWinter',
        'Example.Mod.EmilySpring',
        'Example.Mod.EmilyFall',
      ])
    })

    expect(loadContentPatcherResultAsset).toHaveBeenCalledWith({
      path: 'E:\\Mods\\Example.Mod',
      gameRootPath: 'E:\\Games\\Stardew Valley',
      target: 'Data/Characters',
    })
  })

  it('exposes assetLoading while visual assets are being resolved', async () => {
    vi.mocked(loadImageResourceFromPath).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() =>
      useCharacterWorkspace({
        directoryInfo: {
          rootPath: 'E:\\Games\\Stardew Valley',
          executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
          mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
          mapCount: 42,
        },
        locale: 'en-US',
        copy,
        enableVisualAssets: true,
      }),
    )

    await waitFor(() => {
      expect(result.current.activeCharacter?.key).toBe('Emily')
    })

    await waitFor(() => {
      expect(result.current.assetLoading).toBe(true)
    })
  })
})
