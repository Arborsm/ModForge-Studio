import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { editorCopy, getWorldAtlasViewLabel } from '@locales/api'
import { loadMapAsset, loadTextAsset, scanMaps } from '@entities/game/api'
import type { GameDirectoryInfo, MapAssetContent, MapAssetSummary, TextAssetContent } from '@entities/game/api'
import type { MapDocument } from '@entities/map'
import { WORLD_ATLAS_TAB_ID } from '@entities/map'
import { useMapWorkspace } from '@pages/workbench/workspaces/map/state/useMapWorkspace'

vi.mock('@entities/game/api', () => ({
  loadImageDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,'),
  loadMapAsset: vi.fn(),
  loadTextAsset: vi.fn(),
  scanMaps: vi.fn(),
}))

vi.mock('@pages/workbench/workspaces/mod', () => ({
  buildModBrowserGroups: vi.fn(() => []),
  buildModEntryLookup: vi.fn(() => new Map()),
  findModBrowserEntry: vi.fn(() => null),
  findModSources: vi.fn(() => []),
  loadModResultMapDocument: vi.fn(),
  useModAssetIndex: vi.fn(() => ({
    modIndex: { mods: [] },
    modIndexError: null,
  })),
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

const gameDirectoryInfo: GameDirectoryInfo = {
  rootPath: 'E:\\Games\\Stardew Valley',
  executablePath: 'E:\\Games\\Stardew Valley\\Stardew Valley.exe',
  mapsPath: 'E:\\Games\\Stardew Valley\\Content\\Maps',
  mapCount: 2,
}
const alternateGameDirectoryInfo: GameDirectoryInfo = {
  rootPath: 'D:\\Games\\Stardew Valley',
  executablePath: 'D:\\Games\\Stardew Valley\\Stardew Valley.exe',
  mapsPath: 'D:\\Games\\Stardew Valley\\Content\\Maps',
  mapCount: 1,
}

const townAsset = makeMapAsset('Town')
const forestAsset = makeMapAsset('Forest')
const alternateTownAsset = makeMapAsset('Town', alternateGameDirectoryInfo.rootPath)

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function makeMapAsset(name: string, rootPath = gameDirectoryInfo.rootPath): MapAssetSummary {
  return {
    id: `asset-${name.toLowerCase()}`,
    name,
    fileName: `${name}.xnb`,
    format: 'xnb',
    absolutePath: `${rootPath}\\Content\\Maps\\${name}.xnb`,
    relativePath: `Content\\Maps\\${name}.xnb`,
    sizeBytes: 128,
  }
}

function makeMapDocument(name: string, rootPath = gameDirectoryInfo.rootPath): MapDocument {
  return {
    name,
    format: 'xnb',
    sourcePath: `${rootPath}\\Content\\Maps\\${name}.xnb`,
    relativePath: `Content\\Maps\\${name}.xnb`,
    width: 4,
    height: 4,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {
      Outdoors: true,
    },
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width: 4,
        height: 4,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: {},
        gids: Array.from({ length: 16 }, () => 0) as unknown as Uint32Array,
        nonEmptyTiles: 0,
      },
    ],
    objectGroups: [],
  }
}

function makeMapAssetContent(name: string, rootPath = gameDirectoryInfo.rootPath): MapAssetContent {
  const document = makeMapDocument(name, rootPath)
  return {
    name,
    format: 'xnb',
    absolutePath: document.sourcePath,
    relativePath: document.relativePath,
    content: JSON.stringify(document),
  }
}

function makeWorldMapAsset(rootPath = gameDirectoryInfo.rootPath): TextAssetContent {
  return {
    absolutePath: `${rootPath}\\Content\\Data\\WorldMap.xnb`,
    relativePath: 'Content\\Data\\WorldMap.xnb',
    content: JSON.stringify({
      Default: {
        MapAreas: [
          {
            Id: 'Town',
            Condition: null,
            PixelArea: { X: 0, Y: 0, Width: 64, Height: 64 },
          },
          {
            Id: 'Forest',
            Condition: null,
            PixelArea: { X: 96, Y: 0, Width: 64, Height: 64 },
          },
        ],
      },
    }),
  }
}

describe('useMapWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        queueMicrotask(() => callback({ didTimeout: false, timeRemaining: () => 50 }))
        return 1
      },
    })

    vi.mocked(scanMaps).mockResolvedValue([townAsset, forestAsset])
    vi.mocked(loadTextAsset).mockResolvedValue(makeWorldMapAsset())
    vi.mocked(loadMapAsset).mockImplementation(async (_rootPath, mapPath) => {
      if (/Town\.xnb$/iu.test(mapPath)) {
        return makeMapAssetContent('Town')
      }
      if (/Forest\.xnb$/iu.test(mapPath)) {
        return makeMapAssetContent('Forest')
      }
      throw new Error(`Unexpected map path: ${mapPath}`)
    })
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, 'requestIdleCallback')
  })

  it('does not let an idle full atlas rebuild steal focus from a map tab', async () => {
    const fullAtlasWorldMap = createDeferred<TextAssetContent>()
    vi.mocked(loadTextAsset)
      .mockResolvedValueOnce(makeWorldMapAsset())
      .mockResolvedValueOnce(makeWorldMapAsset())
      .mockReturnValueOnce(fullAtlasWorldMap.promise)

    const { result } = renderHook(() =>
      useMapWorkspace({
        copy: editorCopy['en-US'],
        locale: 'en-US',
        desktopHost: true,
        active: true,
        directoryInfo: gameDirectoryInfo,
        getWorldAtlasViewLabel,
      }),
    )

    await waitFor(() => {
      expect(loadTextAsset).toHaveBeenCalledTimes(3)
      expect(result.current.activeTabId).toBe(WORLD_ATLAS_TAB_ID)
    })

    await act(async () => {
      await result.current.openMap(townAsset, gameDirectoryInfo, 2)
    })

    await waitFor(() => {
      expect(result.current.activeTabId).toBe('map:preview')
      expect(result.current.mapDocument?.name).toBe('Town')
      expect(result.current.workspaceStatus.message).toContain('Town is active')
    })

    await act(async () => {
      fullAtlasWorldMap.resolve(makeWorldMapAsset())
      await fullAtlasWorldMap.promise
    })

    await waitFor(() => {
      expect(result.current.activeTabId).toBe('map:preview')
      expect(result.current.mapDocument?.name).toBe('Town')
      expect(result.current.workspaceStatus.message).toContain('Town is active')
      expect(result.current.worldAtlasViews).toHaveLength(1)
    })
  })

  it('clears the preload notification state after idle resource preload completes', async () => {
    const { result } = renderHook(() =>
      useMapWorkspace({
        copy: editorCopy['en-US'],
        locale: 'en-US',
        desktopHost: true,
        active: true,
        directoryInfo: gameDirectoryInfo,
        getWorldAtlasViewLabel,
      }),
    )

    await waitFor(() => {
      expect(result.current.mapAssets).toHaveLength(2)
    })

    await waitFor(() => {
      expect(result.current.resourcePreloadState.active).toBe(false)
    })
  })

  it('clears the preload notification state before the idle full atlas rebuild settles', async () => {
    const fullAtlasWorldMap = createDeferred<TextAssetContent>()
    let worldMapLoadCount = 0
    vi.mocked(loadTextAsset).mockImplementation(async (rootPath, assetPath) => {
      if (!/WorldMap\.xnb$/iu.test(assetPath)) {
        return makeWorldMapAsset(rootPath)
      }

      worldMapLoadCount += 1
      if (worldMapLoadCount === 3) {
        return fullAtlasWorldMap.promise
      }
      return makeWorldMapAsset(rootPath)
    })

    const { result } = renderHook(() =>
      useMapWorkspace({
        copy: editorCopy['en-US'],
        locale: 'en-US',
        desktopHost: true,
        active: true,
        directoryInfo: gameDirectoryInfo,
        getWorldAtlasViewLabel,
      }),
    )

    await waitFor(() => {
      expect(worldMapLoadCount).toBe(3)
    })
    await waitFor(() => {
      expect(result.current.resourcePreloadState.active).toBe(false)
    })

    await act(async () => {
      fullAtlasWorldMap.resolve(makeWorldMapAsset())
      await fullAtlasWorldMap.promise
    })
  })

  it('does not let an older directory scan publish after the directory changes', async () => {
    const oldScan = createDeferred<MapAssetSummary[]>()
    vi.mocked(scanMaps).mockReturnValueOnce(oldScan.promise).mockResolvedValueOnce([alternateTownAsset])
    vi.mocked(loadTextAsset).mockImplementation(async (rootPath) => makeWorldMapAsset(rootPath))
    vi.mocked(loadMapAsset).mockImplementation(async (rootPath, mapPath) => {
      if (/Town\.xnb$/iu.test(mapPath)) {
        return makeMapAssetContent('Town', rootPath)
      }
      if (/Forest\.xnb$/iu.test(mapPath)) {
        return makeMapAssetContent('Forest', rootPath)
      }
      throw new Error(`Unexpected map path: ${mapPath}`)
    })

    const { result, rerender } = renderHook(
      ({ directoryInfo }) =>
        useMapWorkspace({
          copy: editorCopy['en-US'],
          locale: 'en-US',
          desktopHost: true,
          active: true,
          directoryInfo,
          getWorldAtlasViewLabel,
        }),
      { initialProps: { directoryInfo: gameDirectoryInfo } },
    )

    rerender({ directoryInfo: alternateGameDirectoryInfo })

    await waitFor(() => {
      expect(result.current.mapAssets).toEqual([alternateTownAsset])
      expect(result.current.mapDocument?.sourcePath).toContain(alternateGameDirectoryInfo.rootPath)
    })

    await act(async () => {
      oldScan.resolve([townAsset, forestAsset])
      await oldScan.promise
    })

    expect(result.current.mapAssets).toEqual([alternateTownAsset])
    expect(result.current.mapDocument?.sourcePath).toContain(alternateGameDirectoryInfo.rootPath)
  })
})
