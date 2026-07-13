import { describe, expect, it, vi } from 'vite-plus/test'
import { invokeDesktop } from '@platform/host/runtime'
import { saveModI18nFiles } from '@entities/mod/api/modDesktopApi'
import type { SaveModI18nFilesRequest, SaveModI18nFilesResult } from '@entities/mod/api/types'

vi.mock('@platform/host/runtime', () => ({
  invokeDesktop: vi.fn(),
}))

describe('modDesktopApi', () => {
  it('wraps the narrow i18n mutation without manifest, content, or output arguments', async () => {
    const request: SaveModI18nFilesRequest = {
      sourcePath: '/mods/SourcePack',
      i18nFiles: [{ locale: 'zh-CN', rawJson: '{"key":"value"}' }],
    }
    const result: SaveModI18nFilesResult = {
      sourcePath: '/mods/SourcePack',
      writtenLocales: ['zh-CN'],
    }

    vi.mocked(invokeDesktop).mockResolvedValueOnce(result)

    await expect(saveModI18nFiles(request)).resolves.toBe(result)
    expect(invokeDesktop).toHaveBeenCalledWith(
      'save_mod_i18n_files',
      { request },
      { kind: 'exclusiveMutation', resource: 'ModProject:\\mods\\SourcePack' },
    )
    expect(request).not.toHaveProperty('manifestJson')
    expect(request).not.toHaveProperty('contentJson')
    expect(request).not.toHaveProperty('outputPath')
  })
})
