import { describe, expect, it, vi } from 'vite-plus/test'
import { exportMapPng } from '@entities/game/api/gameAssets'
import { invokeDesktop } from '@platform/host/runtime'

vi.mock('@platform/host/runtime', () => ({
  invokeDesktop: vi.fn(),
}))

describe('gameAssets desktop API', () => {
  it('exports map PNG bytes through the exclusive Host Runtime mutation policy', async () => {
    vi.mocked(invokeDesktop).mockResolvedValueOnce(undefined)

    await expect(exportMapPng('C:/Exports/Town.png', 'cG5n')).resolves.toBeUndefined()
    expect(invokeDesktop).toHaveBeenCalledWith(
      'export_map_png',
      { outputPath: 'C:/Exports/Town.png', pngBase64: 'cG5n' },
      { kind: 'exclusiveMutation', resource: 'MapPngExport' },
    )
  })
})
