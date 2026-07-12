import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { scanModProjects, type ModProjectSummary } from '@entities/mod/api'
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
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
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
})
