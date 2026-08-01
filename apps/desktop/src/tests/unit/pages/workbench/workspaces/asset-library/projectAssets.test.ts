import { describe, expect, it } from 'vite-plus/test'
import type { DraftPatch, VirtualPreviewAsset } from '@features/cp-maker'
import {
  allocateProjectAssetPath,
  classifyProjectAsset,
  planProjectAssetRename,
  sanitizeProjectAssetPath,
} from '@pages/workbench/workspaces/asset-library'

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

describe('classifyProjectAsset', () => {
  it('classifies TMX and TBIN map documents by path even without a MIME', () => {
    expect(classifyProjectAsset('application/octet-stream', 'assets/maps/Mountain.tmx')).toBe('map')
    expect(classifyProjectAsset('', 'assets/maps/Festival.tbin')).toBe('map')
  })

  it('classifies known media types by MIME', () => {
    expect(classifyProjectAsset('image/png', 'assets/portrait.png')).toBe('image')
    expect(classifyProjectAsset('audio/wav', 'assets/birds.wav')).toBe('audio')
    expect(classifyProjectAsset('application/json', 'assets/data/shops.json')).toBe('data')
  })

  it('falls back to the path extension when the MIME is empty or generic', () => {
    expect(classifyProjectAsset('application/octet-stream', 'assets/tilesheet.png')).toBe('image')
    expect(classifyProjectAsset('', 'assets/data/events.json')).toBe('data')
  })

  it('keeps unknown binary payloads in other', () => {
    expect(classifyProjectAsset('application/octet-stream', 'assets/data/patch.dll')).toBe('other')
  })
})
