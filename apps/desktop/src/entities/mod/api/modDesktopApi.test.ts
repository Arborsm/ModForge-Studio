import { describe, expect, it, vi } from 'vitest'
import { invokeDesktop } from '@shared/lib/desktop/runtime'
import { saveModProject } from './modDesktopApi'
import type { SaveModProjectRequest, SaveModProjectResult } from './types'

vi.mock('@shared/lib/desktop/runtime', () => ({
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
