import { describe, expect, it } from 'vite-plus/test'
import type { DraftPatch, VirtualPreviewAsset } from '@features/cp-maker'
import { allocateProjectAssetPath, planProjectAssetRename, sanitizeProjectAssetPath } from '@pages/workbench/workspaces/asset-library'

const asset: VirtualPreviewAsset = { relativePath: 'assets/barn.png', mediaType: 'image/png', bytesBase64: 'AA==' }

describe('project asset paths', () => {
  it('removes traversal and filesystem-invalid characters', () => {
    expect(sanitizeProjectAssetPath('../assets/ba:rn?.png')).toBe('assets/ba-rn-.png')
  })

  it('allocates stable numeric collision suffixes', () => {
    expect(allocateProjectAssetPath(['assets/barn.png', 'assets/barn-2.png'], 'assets/barn.png')).toBe('assets/barn-3.png')
  })

  it('renames the asset and every patch reference together', () => {
    const patches = [
      { id: 'load', fromFile: 'assets/barn.png' },
      { id: 'other', fromFile: 'assets/other.png' },
    ] as DraftPatch[]
    expect(planProjectAssetRename([asset], patches, asset.relativePath, 'assets/coop.png')).toEqual({
      asset: { ...asset, relativePath: 'assets/coop.png' },
      oldPath: 'assets/barn.png',
      patchUpdates: [{ patchId: 'load', fromFile: 'assets/coop.png' }],
    })
  })
})
