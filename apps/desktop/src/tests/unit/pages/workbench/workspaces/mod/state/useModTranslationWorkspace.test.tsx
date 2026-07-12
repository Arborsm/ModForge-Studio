import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { loadModProject, saveModI18nFiles, type ModProjectDetail } from '@entities/mod/api'
import { useModTranslationWorkspace } from '@pages/workbench/workspaces/mod/state/useModTranslationWorkspace'

vi.mock('@locales/provider', async () => {
  const actual = await vi.importActual<typeof import('@locales/provider')>('@locales/provider')
  return {
    ...actual,
    useModCopy: () => ({
      saveSuccess: (path: string) => `saved:${path}`,
      saveFailed: 'Save failed',
    }),
  }
})

vi.mock('@platform/observability', () => ({ reportAppEvent: vi.fn() }))

vi.mock('@entities/mod/api', async () => {
  const actual = await vi.importActual<typeof import('@entities/mod/api')>('@entities/mod/api')
  return { ...actual, loadModProject: vi.fn(), saveModI18nFiles: vi.fn() }
})

const detail = (zh = '{"hello":"你好"}'): ModProjectDetail => ({
  pluginKind: 'content-patcher',
  diagnostics: [],
  summary: {
    id: 'pack',
    name: 'Pack',
    author: null,
    version: null,
    description: null,
    uniqueId: 'Pack',
    contentPackFor: null,
    folderName: 'pack',
    absolutePath: '/mods/pack',
    manifestPath: '/mods/pack/manifest.json',
    contentPath: null,
    pluginKind: 'content-patcher',
    status: 'ready',
    missingRequiredDependencies: [],
    hasI18n: true,
    i18nEntryCount: 2,
  },
  contentPatcher: null,
  i18nFiles: [
    {
      locale: 'default',
      rawJson: '{"hello":"Hello"}',
      path: '/mods/pack/i18n/default.json',
      relativePath: 'i18n/default.json',
      entryCount: 1,
    },
    { locale: 'zh', rawJson: zh, path: '/mods/pack/i18n/zh.json', relativePath: 'i18n/zh.json', entryCount: 1 },
  ],
})

describe('useModTranslationWorkspace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes only changed locale files and clears dirty after reload', async () => {
    vi.mocked(loadModProject).mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail('{"hello":"您好"}'))
    vi.mocked(saveModI18nFiles).mockResolvedValue({ sourcePath: '/mods/pack', writtenLocales: ['zh'] })
    const { result } = renderHook(() => useModTranslationWorkspace('/mods/pack'))
    await waitFor(() => expect(result.current.files).toHaveLength(2))

    act(() =>
      result.current.setFiles(result.current.files.map((file) => (file.locale === 'zh' ? { ...file, rawJson: '{"hello":"您好"}' } : file))),
    )
    expect(result.current.dirty).toBe(true)
    await act(async () => {
      await result.current.save()
    })

    expect(saveModI18nFiles).toHaveBeenCalledWith({
      sourcePath: '/mods/pack',
      i18nFiles: [{ locale: 'zh', rawJson: '{"hello":"您好"}' }],
    })
    expect(result.current.dirty).toBe(false)
  })

  it('keeps the edited buffer dirty when saving fails', async () => {
    vi.mocked(loadModProject).mockResolvedValue(detail())
    vi.mocked(saveModI18nFiles).mockRejectedValue(new Error('disk full'))
    const { result } = renderHook(() => useModTranslationWorkspace('/mods/pack'))
    await waitFor(() => expect(result.current.files).toHaveLength(2))
    act(() => result.current.setFiles(result.current.files.map((file) => (file.locale === 'zh' ? { ...file, rawJson: '{}' } : file))))

    await expect(
      act(async () => {
        await result.current.save()
      }),
    ).rejects.toThrow('disk full')
    expect(result.current.files.find((file) => file.locale === 'zh')?.rawJson).toBe('{}')
    expect(result.current.dirty).toBe(true)
  })

  it('keeps the newest reload result when an older request finishes late', async () => {
    let resolveOlder!: (value: ModProjectDetail) => void
    let resolveNewer!: (value: ModProjectDetail) => void
    vi.mocked(loadModProject)
      .mockResolvedValueOnce(detail())
      .mockReturnValueOnce(new Promise((resolve) => (resolveOlder = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveNewer = resolve)))
    const { result } = renderHook(() => useModTranslationWorkspace('/mods/pack'))
    await waitFor(() => expect(result.current.files).toHaveLength(2))

    let older!: Promise<void>
    let newer!: Promise<void>
    act(() => {
      older = result.current.reload()
      newer = result.current.reload()
    })
    await act(async () => {
      resolveNewer(detail('{"hello":"newest"}'))
      await newer
      resolveOlder(detail('{"hello":"older"}'))
      await older
    })

    expect(result.current.files.find((file) => file.locale === 'zh')?.rawJson).toBe('{"hello":"newest"}')
  })
})
