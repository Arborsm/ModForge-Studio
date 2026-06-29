import { describe, expect, it, vi } from 'vite-plus/test'
import { invokeDesktop } from '@platform/host/runtime'
import { saveModProject } from '@entities/mod/api/modDesktopApi'
import type { SaveModProjectRequest, SaveModProjectResult } from '@entities/mod/api/types'

vi.mock('@platform/host/runtime', () => ({
  invokeDesktop: vi.fn(),
}))

describe('modDesktopApi', () => {
  it('wraps save_mod_project requests for Tauri command arguments', async () => {
    const request: SaveModProjectRequest = {
      sourcePath: '/mods/SourcePack',
      outputPath: '/mods/ExportPack',
      overwriteExistingExport: true,
      manifestJson: '{}',
      contentJson: '{}',
      i18nFiles: [],
    }
    const result: SaveModProjectResult = {
      pluginKind: 'content-patcher',
      targetPath: '/mods/ExportPack',
      manifestPath: '/mods/ExportPack/manifest.json',
      contentPath: '/mods/ExportPack/content.json',
      diagnostics: [],
    }

    vi.mocked(invokeDesktop).mockResolvedValueOnce(result)

    await expect(saveModProject(request)).resolves.toBe(result)
    expect(invokeDesktop).toHaveBeenCalledWith('save_mod_project', { request }, { kind: 'exclusiveMutation', resource: 'ModProject' })
  })
})
