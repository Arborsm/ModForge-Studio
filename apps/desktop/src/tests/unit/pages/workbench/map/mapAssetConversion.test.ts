import { describe, expect, it } from 'vite-plus/test'
import type { DraftPatch } from '@features/cp-maker'
import {
  collectPatchesReferencingAsset,
  normalizeProjectAssetPath,
  tmxConversionPath,
} from '@pages/workbench/workspaces/map/model/mapAssetConversion'

function patch(id: string, fromFile?: string): DraftPatch {
  return {
    id,
    workspace: 'map',
    target: '',
    action: 'EditMap',
    logName: id,
    enabled: true,
    editorState: {},
    fromFile,
  }
}

describe('tmxConversionPath', () => {
  it('replaces a .tbin suffix with .tmx', () => {
    expect(tmxConversionPath('assets/maps/Town.tbin')).toBe('assets/maps/Town.tmx')
  })

  it('replaces .tbin/.xnb suffixes case-insensitively', () => {
    expect(tmxConversionPath('assets/maps/Town.TBIN')).toBe('assets/maps/Town.tmx')
    expect(tmxConversionPath('assets/maps/Farm.XNB')).toBe('assets/maps/Farm.tmx')
    expect(tmxConversionPath('assets/maps/Shop.xNb')).toBe('assets/maps/Shop.tmx')
  })

  it('passes other suffixes and extension-less paths through unchanged', () => {
    expect(tmxConversionPath('assets/maps/Town.tmx')).toBe('assets/maps/Town.tmx')
    expect(tmxConversionPath('assets/maps/Town.png')).toBe('assets/maps/Town.png')
    expect(tmxConversionPath('assets/maps/Town')).toBe('assets/maps/Town')
  })
})

describe('collectPatchesReferencingAsset', () => {
  it('matches fromFile with case and backslash normalization', () => {
    const patches = [patch('a', 'assets/maps/Town.TBIN'), patch('b', 'assets\\maps\\Town.tbin'), patch('c', 'assets/maps/Other.tbin')]
    expect(collectPatchesReferencingAsset(patches, 'assets/maps/Town.tbin')).toEqual(['a', 'b'])
  })

  it('returns an empty list when no patch references the asset', () => {
    expect(collectPatchesReferencingAsset([patch('a', 'assets/maps/Other.tmx')], 'assets/maps/Town.tbin')).toEqual([])
    expect(collectPatchesReferencingAsset([patch('a')], 'assets/maps/Town.tbin')).toEqual([])
    expect(collectPatchesReferencingAsset([], 'assets/maps/Town.tbin')).toEqual([])
  })
})

describe('normalizeProjectAssetPath', () => {
  it('lowercases and flattens separators', () => {
    expect(normalizeProjectAssetPath('Assets\\Maps\\Town.tbin')).toBe('assets/maps/town.tbin')
    expect(normalizeProjectAssetPath('assets/maps/Town.tmx')).toBe('assets/maps/town.tmx')
  })
})
