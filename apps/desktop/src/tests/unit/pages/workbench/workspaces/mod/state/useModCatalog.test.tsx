import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { scanModProjects, type ModProjectSummary } from '@entities/mod/api'
import type { GameDirectoryInfo } from '@entities/game/api'
import { useModCatalog } from '@pages/workbench/workspaces/mod/state/useModCatalog'

const modCopy = vi.hoisted(() => ({
  scanStatus: (count: number) => `scanned:${count}`,
  selectProjectFolder: 'Select project',
}))

vi.mock('@locales/provider', async () => {
  const actual = await vi.importActual<typeof import('@locales/provider')>('@locales/provider')
  return {
    ...actual,
    useModCopy: () => modCopy,
  }
})

vi.mock('@entities/mod/api', async () => {
  const actual = await vi.importActual<typeof import('@entities/mod/api')>('@entities/mod/api')
  return {
    ...actual,
    scanModProjects: vi.fn(),
  }
})

const project = (id: string, i18nEntryCount: number): ModProjectSummary => ({
  id,
  name: id,
  author: null,
  version: null,
  description: null,
  uniqueId: id,
  contentPackFor: null,
  folderName: id,
  absolutePath: `/mods/${id}`,
  manifestPath: `/mods/${id}/manifest.json`,
  contentPath: null,
  pluginKind: 'unknown',
  status: 'ready',
  missingRequiredDependencies: [],
  hasI18n: i18nEntryCount > 0,
  i18nEntryCount,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('useModCatalog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scans and filters translation projects without constructing mutation state', async () => {
    vi.mocked(scanModProjects).mockResolvedValue([project('plain', 0), project('translated', 4)])
    const { result } = renderHook(() =>
      useModCatalog({
        directoryInfo: { rootPath: '/game', executablePath: '/game/game', mapsPath: '/game/Content/Maps', mapCount: 1 },
        mode: 'translation',
      }),
    )

    await waitFor(() => expect(result.current.projects).toHaveLength(2))
    expect(result.current.filteredProjects.map((entry) => entry.id)).toEqual(['translated'])
    expect(result.current.activeProjectPath).toBe('/mods/translated')

    act(() => result.current.setQuery('missing'))
    await waitFor(() => expect(result.current.filteredProjects).toEqual([]))
  })

  it('ignores a late scan after the game directory changes', async () => {
    const first = deferred<ModProjectSummary[]>()
    const second = deferred<ModProjectSummary[]>()
    vi.mocked(scanModProjects).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const directory = (rootPath: string) => ({
      rootPath,
      executablePath: `${rootPath}/game`,
      mapsPath: `${rootPath}/Content/Maps`,
      mapCount: 1,
    })
    const { result, rerender } = renderHook(({ rootPath }) => useModCatalog({ directoryInfo: directory(rootPath), mode: 'browse' }), {
      initialProps: { rootPath: '/game-one' },
    })

    rerender({ rootPath: '/game-two' })
    await waitFor(() => expect(scanModProjects).toHaveBeenCalledTimes(2))
    await act(async () => second.resolve([project('second', 0)]))
    await waitFor(() => expect(result.current.projects[0]?.id).toBe('second'))
    await act(async () => first.resolve([project('first', 0)]))
    expect(result.current.projects[0]?.id).toBe('second')
  })

  it('settles loading when the game directory is cleared', async () => {
    const pending = deferred<ModProjectSummary[]>()
    vi.mocked(scanModProjects).mockReturnValue(pending.promise)
    const directory: GameDirectoryInfo = { rootPath: '/game', executablePath: '/game/game', mapsPath: '/game/Content/Maps', mapCount: 1 }
    const { result, rerender } = renderHook(({ directoryInfo }) => useModCatalog({ directoryInfo, mode: 'browse' }), {
      initialProps: { directoryInfo: directory as GameDirectoryInfo | null },
    })

    await waitFor(() => expect(result.current.loading).toBe(true))
    rerender({ directoryInfo: null })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => pending.resolve([]))
  })

  it('ignores a late scan failure after the game directory changes', async () => {
    const first = deferred<ModProjectSummary[]>()
    const second = deferred<ModProjectSummary[]>()
    vi.mocked(scanModProjects).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const directory = (rootPath: string) => ({
      rootPath,
      executablePath: `${rootPath}/game`,
      mapsPath: `${rootPath}/Content/Maps`,
      mapCount: 1,
    })
    const { result, rerender } = renderHook(({ rootPath }) => useModCatalog({ directoryInfo: directory(rootPath), mode: 'browse' }), {
      initialProps: { rootPath: '/game-one' },
    })

    rerender({ rootPath: '/game-two' })
    await waitFor(() => expect(scanModProjects).toHaveBeenCalledTimes(2))
    await act(async () => second.resolve([project('second', 0)]))
    await waitFor(() => expect(result.current.projects[0]?.id).toBe('second'))
    await act(async () => first.reject(new Error('old scan failed')))

    expect(result.current.projects[0]?.id).toBe('second')
    expect(result.current.statusMessage).toBe('scanned:1')
  })
})
