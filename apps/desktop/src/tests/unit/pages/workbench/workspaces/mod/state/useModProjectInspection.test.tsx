import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { loadModProject, type ModProjectDetail } from '@entities/mod/api'
import { useModProjectInspection } from '@pages/workbench/workspaces/mod/state/useModProjectInspection'

vi.mock('@entities/mod/api', () => ({ loadModProject: vi.fn() }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function detail(path: string, contentJson = '{"Format":"2.0.0","Changes":[]}'): ModProjectDetail {
  return {
    pluginKind: 'content-patcher',
    summary: {
      id: path,
      name: path,
      author: 'Author',
      version: '1.0.0',
      description: null,
      uniqueId: `Test.${path}`,
      contentPackFor: 'Pathoschild.ContentPatcher',
      folderName: path,
      absolutePath: path,
      manifestPath: `${path}/manifest.json`,
      contentPath: `${path}/content.json`,
      pluginKind: 'content-patcher',
      status: 'ready',
      missingRequiredDependencies: [],
      hasI18n: false,
      i18nEntryCount: 0,
    },
    diagnostics: [{ severity: 'warning', message: `diagnostic:${path}`, field: null }],
    contentPatcher: {
      manifestPath: `${path}/manifest.json`,
      contentPath: `${path}/content.json`,
      manifestJson: '{}',
      contentJson,
      format: '2.0.0',
      changeCount: 1,
      includeCount: 0,
      dynamicTokenCount: 0,
      configKeys: [],
      hasI18n: false,
      i18nFiles: [],
      patches: [],
    },
    i18nFiles: [],
  }
}

describe('useModProjectInspection', () => {
  it('derives immutable patch summaries and diagnostics from the loaded project', async () => {
    vi.mocked(loadModProject).mockResolvedValueOnce(
      detail('/mods/one', '{"Format":"2.0.0","Changes":[{"Action":"EditData","Target":"Data/Objects"}]}'),
    )
    const { result } = renderHook(() => useModProjectInspection('/mods/one'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.detail?.summary.absolutePath).toBe('/mods/one')
    expect(result.current.contentSummary?.patches[0]).toMatchObject({ action: 'EditData', target: 'Data/Objects' })
    expect(result.current.diagnostics[0]?.message).toBe('diagnostic:/mods/one')
  })

  it('ignores a late project result after selection changes', async () => {
    const first = deferred<ModProjectDetail>()
    const second = deferred<ModProjectDetail>()
    vi.mocked(loadModProject).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ path }) => useModProjectInspection(path), { initialProps: { path: '/mods/one' } })

    rerender({ path: '/mods/two' })
    await act(async () => second.resolve(detail('/mods/two')))
    await waitFor(() => expect(result.current.detail?.summary.absolutePath).toBe('/mods/two'))
    await act(async () => first.resolve(detail('/mods/one')))
    expect(result.current.detail?.summary.absolutePath).toBe('/mods/two')
  })

  it('exposes load failures without retaining stale detail', async () => {
    vi.mocked(loadModProject).mockRejectedValueOnce(new Error('inspection failed'))
    const { result } = renderHook(() => useModProjectInspection('/mods/broken'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.detail).toBeNull()
    expect(result.current.error).toBe('inspection failed')
  })
})
