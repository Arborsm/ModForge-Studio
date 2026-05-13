import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadContentPatcherResultAsset } from '@entities/mod/api'
import { loadImageResource } from '@shared/lib/assets'
import type { MapDocument } from '@shared/contracts'
import { loadModResultImageState, loadModResultMapDocument } from './modResultAssets'
import type { ModBrowserEntry } from './browser'

vi.mock('@entities/mod/api', () => ({
  loadContentPatcherResultAsset: vi.fn(),
}))

vi.mock('@shared/lib/assets', () => ({
  loadImageResource: vi.fn(),
}))

function createModEntry<T>(overrides: Partial<ModBrowserEntry<T>> = {}): ModBrowserEntry<T> {
  return {
    selectionId: 'Example.Pack::town',
    modId: 'Example.Pack',
    modName: 'Example Pack',
    modPath: 'E:\\Games\\Stardew Valley\\Mods\\Example.Pack',
    pluginKind: 'content-patcher',
    key: 'Town',
    label: 'Town',
    value: {} as T,
    targets: ['Maps/Town'],
    patchIds: ['content.json:0#target:0#from:0'],
    ...overrides,
  }
}

describe('modResultAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a modded image state from the selected mod entry target', async () => {
    vi.mocked(loadContentPatcherResultAsset).mockResolvedValue({
      target: {
        path: 'Characters/Abigail',
        assetKind: 'image',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
      trace: [],
      result: {
        kind: 'image',
        json: null,
        imageDataUrl: 'data:image/png;base64,modded',
        originalImageDataUrl: 'data:image/png;base64,original',
        originalImageSource: null,
        mapDebug: null,
      },
      diagnostics: [],
      exportable: true,
    })
    vi.mocked(loadImageResource).mockImplementation(async (dataUrl) => {
      if (dataUrl === 'data:image/png;base64,original') {
        return {
          image: {} as HTMLImageElement,
          url: 'data:image/png;base64,original',
          width: 8,
          height: 16,
        }
      }

      return {
        image: {} as HTMLImageElement,
        url: 'data:image/png;base64,modded',
        width: 32,
        height: 64,
      }
    })

    const state = await loadModResultImageState({
      rootPath: 'E:\\Games\\Stardew Valley',
      entry: createModEntry({
        key: 'Abigail',
        label: 'Abigail',
        targets: ['Characters/Abigail', 'Portraits/Abigail'],
      }),
      preferredTargets: ['Characters/Abigail'],
      fallbackPathLabel: 'Characters\\Abigail',
    })

    expect(loadContentPatcherResultAsset).toHaveBeenCalledWith({
      path: 'E:\\Games\\Stardew Valley\\Mods\\Example.Pack',
      gameRootPath: 'E:\\Games\\Stardew Valley',
      target: 'Characters/Abigail',
    })
    expect(state).toEqual({
      path: 'Characters\\Abigail',
      url: 'data:image/png;base64,modded',
      width: 32,
      height: 64,
      originalWidth: 8,
      originalHeight: 16,
      target: 'Characters/Abigail',
    })
  })

  it('loads a modded map document from the selected mod entry target', async () => {
    const mapDocument: MapDocument = {
      name: 'Town',
      format: 'xnb',
      sourcePath: 'E:\\Games\\Stardew Valley\\Mods\\Example.Pack\\assets\\Town.tbin',
      relativePath: 'Maps\\Town',
      width: 10,
      height: 10,
      tileWidth: 16,
      tileHeight: 16,
      orientation: 'orthogonal',
      renderOrder: 'right-down',
      properties: {},
      tilesets: [],
      layers: [],
      objectGroups: [],
    }

    vi.mocked(loadContentPatcherResultAsset).mockResolvedValue({
      target: {
        path: 'Maps/Town',
        assetKind: 'map',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
      trace: [],
      result: {
        kind: 'map',
        json: mapDocument,
        imageDataUrl: null,
        originalImageDataUrl: null,
        originalImageSource: null,
        mapDebug: { layers: ['Back'], properties: [], warps: [] },
      },
      diagnostics: [],
      exportable: true,
    })

    const document = await loadModResultMapDocument({
      rootPath: 'E:\\Games\\Stardew Valley',
      entry: createModEntry({
        key: 'Content/Maps/Town.xnb',
        label: 'Town',
        targets: ['Maps/Town'],
      }),
      preferredTargets: ['Maps/Town'],
      fallbackName: 'Town',
      fallbackRelativePath: 'Content\\Maps\\Town.xnb',
      fallbackSourcePath: 'E:\\Games\\Stardew Valley\\Content\\Maps\\Town.xnb',
    })

    expect(loadContentPatcherResultAsset).toHaveBeenCalledWith({
      path: 'E:\\Games\\Stardew Valley\\Mods\\Example.Pack',
      gameRootPath: 'E:\\Games\\Stardew Valley',
      target: 'Maps/Town',
    })
    expect(document).toMatchObject({
      name: 'Town',
      relativePath: 'Maps\\Town',
      sourcePath: 'E:\\Games\\Stardew Valley\\Mods\\Example.Pack\\assets\\Town.tbin',
    })
  })

  it('loads a related portrait target when the mod only patches portrait variants', async () => {
    vi.mocked(loadContentPatcherResultAsset).mockResolvedValue({
      target: {
        path: 'Portraits/Haley_Spring_Indoor',
        assetKind: 'image',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
      trace: [],
      result: {
        kind: 'image',
        json: null,
        imageDataUrl: 'data:image/png;base64,seasonal',
        originalImageDataUrl: null,
        originalImageSource: null,
        mapDebug: null,
      },
      diagnostics: [],
      exportable: true,
    })
    vi.mocked(loadImageResource).mockResolvedValue({
      image: {} as HTMLImageElement,
      url: 'data:image/png;base64,seasonal',
      width: 128,
      height: 256,
    })

    const state = await loadModResultImageState({
      rootPath: 'E:\\Games\\Stardew Valley',
      entry: createModEntry({
        key: 'Haley',
        label: 'Haley',
        targets: ['Data/Characters', 'Portraits/Haley_Spring_Indoor', 'Portraits/Haley_Winter'],
      }),
      preferredTargets: ['Portraits/Haley'],
      fallbackPathLabel: 'Portraits\\Haley',
    })

    expect(loadContentPatcherResultAsset).toHaveBeenCalledWith({
      path: 'E:\\Games\\Stardew Valley\\Mods\\Example.Pack',
      gameRootPath: 'E:\\Games\\Stardew Valley',
      target: 'Portraits/Haley_Spring_Indoor',
    })
    expect(state).toEqual({
      path: 'Portraits\\Haley',
      url: 'data:image/png;base64,seasonal',
      width: 128,
      height: 256,
      originalWidth: null,
      originalHeight: null,
      target: 'Portraits/Haley_Spring_Indoor',
    })
  })
})
