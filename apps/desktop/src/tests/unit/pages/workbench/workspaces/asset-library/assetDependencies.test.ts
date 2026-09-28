import { describe, expect, it } from 'vite-plus/test'
import type { ProjectAssetRef } from '@features/cp-maker'
import { buildAssetDependencyView, findMissingAssetDependencies, normalizeDependencyPath } from '@pages/workbench/workspaces/asset-library'

function assetRef(relativePath: string, dependencies: Array<{ relativePath: string; kind: string }> = []): ProjectAssetRef {
  return {
    relativePath,
    mediaType: 'application/xml',
    sizeBytes: 1,
    sha256: 'sha',
    storageKey: 'storage',
    sourceType: 'imported',
    dependencies,
  }
}

describe('asset dependency normalization', () => {
  it('normalizes backslashes, repeated separators, and leading ./', () => {
    expect(normalizeDependencyPath('assets\\maps\\spring.tmx')).toBe('assets/maps/spring.tmx')
    expect(normalizeDependencyPath('assets//maps/spring.tmx')).toBe('assets/maps/spring.tmx')
    expect(normalizeDependencyPath('./assets/maps/spring.tmx')).toBe('assets/maps/spring.tmx')
  })
})

describe('findMissingAssetDependencies', () => {
  it('compares dependency edges case-insensitively and ignores separator style', () => {
    const assets = [
      assetRef('assets/Maps/spring.tmx', [{ relativePath: 'assets\\maps\\tilesheets\\Spring_tiles.PNG', kind: 'image' }]),
      assetRef('assets/maps/tilesheets/spring_tiles.png'),
    ]
    expect(findMissingAssetDependencies(assets)).toEqual([])
  })

  it('reports every dependency edge that points at a missing file with its owner', () => {
    const assets = [
      assetRef('assets/maps/spring.tmx', [
        { relativePath: 'assets/maps/tilesheets/present.png', kind: 'image' },
        { relativePath: 'assets/maps/tilesets/spring.tsx', kind: 'tileset' },
        { relativePath: 'assets/maps/tilesheets/missing_tiles.png', kind: 'image' },
      ]),
      assetRef('assets/maps/tilesheets/present.png'),
      assetRef('assets/maps/summer.tmx', [{ relativePath: 'assets/maps/tilesheets/summer_tiles.png', kind: 'image' }]),
    ]
    expect(findMissingAssetDependencies(assets)).toEqual([
      { assetPath: 'assets/maps/spring.tmx', missingPath: 'assets/maps/tilesets/spring.tsx', kind: 'tileset' },
      { assetPath: 'assets/maps/spring.tmx', missingPath: 'assets/maps/tilesheets/missing_tiles.png', kind: 'image' },
      { assetPath: 'assets/maps/summer.tmx', missingPath: 'assets/maps/tilesheets/summer_tiles.png', kind: 'image' },
    ])
  })

  it('ignores empty dependency edges and assets without dependencies', () => {
    const assets = [assetRef('assets/maps/spring.tmx', [{ relativePath: '', kind: 'image' }]), assetRef('assets/maps/standalone.png')]
    expect(findMissingAssetDependencies(assets)).toEqual([])
  })

  it('survives records without a dependencies field', () => {
    const legacy = { relativePath: 'assets/maps/spring.tmx' } as unknown as ProjectAssetRef
    expect(findMissingAssetDependencies([legacy])).toEqual([])
  })
})

describe('buildAssetDependencyView', () => {
  const assets = [
    assetRef('assets/maps/spring.tmx', [
      { relativePath: 'assets/maps/tilesheets/spring_tiles.png', kind: 'image' },
      { relativePath: 'assets/maps/tilesets/missing.tsx', kind: 'tileset' },
    ]),
    assetRef('assets/maps/tilesheets/spring_tiles.png'),
    assetRef('assets/maps/other.tmx', [{ relativePath: 'assets/maps/tilesheets/spring_tiles.png', kind: 'image' }]),
    assetRef('assets/maps/tilesheets/standalone.png'),
  ]

  it('lists direct dependencies with kind and existence state', () => {
    expect(buildAssetDependencyView(assets, 'assets/maps/spring.tmx')).toEqual({
      dependencies: [
        { path: 'assets/maps/tilesheets/spring_tiles.png', kind: 'image', exists: true },
        { path: 'assets/maps/tilesets/missing.tsx', kind: 'tileset', exists: false },
      ],
      dependents: [],
    })
  })

  it('lists reverse dependents for a shared target', () => {
    expect(buildAssetDependencyView(assets, 'assets/maps/tilesheets/spring_tiles.png')).toEqual({
      dependencies: [],
      dependents: ['assets/maps/spring.tmx', 'assets/maps/other.tmx'],
    })
  })

  it('returns empty views for assets without dependencies and without dependents', () => {
    expect(buildAssetDependencyView(assets, 'assets/maps/tilesheets/standalone.png')).toEqual({
      dependencies: [],
      dependents: [],
    })
  })

  it('resolves a selected path with a different separator or case', () => {
    expect(buildAssetDependencyView(assets, 'assets\\maps\\Spring.TMX')).toEqual({
      dependencies: [
        { path: 'assets/maps/tilesheets/spring_tiles.png', kind: 'image', exists: true },
        { path: 'assets/maps/tilesets/missing.tsx', kind: 'tileset', exists: false },
      ],
      dependents: [],
    })
  })

  it('returns an empty view for an unknown or missing selection', () => {
    expect(buildAssetDependencyView(assets, 'assets/nope.png')).toEqual({ dependencies: [], dependents: [] })
    expect(buildAssetDependencyView(assets, null)).toEqual({ dependencies: [], dependents: [] })
  })
})
