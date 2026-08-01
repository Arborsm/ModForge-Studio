import { describe, expect, it } from 'vite-plus/test'
import {
  analyzeLoadBindings,
  buildLoadTargetExpression,
  collectLoadPatches,
  groupLoadPatchesByFamily,
  loadAssetFamily,
  loadFamilyWorkspace,
  normalizeLoadTargetInput,
  placeholderLoadTarget,
  projectAssetsForLoadFamily,
  resolveLoadFromFile,
} from '@pages/workbench/workspaces/asset-library/model/mapLoadBinding'
import { splitMapTargets } from '@pages/workbench/workspaces/map/model/mapPatchReducer'

describe('map load binding', () => {
  it('resolves target tokens against a full target', () => {
    expect(resolveLoadFromFile('assets/TileSheets/{{TargetWithoutPath}}.png', 'Maps/Town')).toBe('assets/TileSheets/Town.png')
    expect(resolveLoadFromFile('assets/{{Target}}/sheet.png', 'Maps/Town')).toBe('assets/Maps/Town/sheet.png')
    expect(resolveLoadFromFile('assets/{{TargetWithoutExtension}}.png', 'Maps/SpringObjects.png')).toBe('assets/Maps/SpringObjects.png')
    expect(resolveLoadFromFile('assets/{{TargetWithoutExtension}}.png', 'Maps/SpringObjects')).toBe('assets/Maps/SpringObjects.png')
  })

  it('normalizes backslash targets and keeps unknown tokens verbatim', () => {
    expect(resolveLoadFromFile('assets/{{ModId}}/{{TargetWithoutPath}}.png', 'Maps\\Town')).toBe('assets/{{ModId}}/Town.png')
    expect(resolveLoadFromFile('assets/{{ModId}}/x.png', 'Maps/Town')).toBe('assets/{{ModId}}/x.png')
  })

  it('joins targets into a comma expression inverse of splitMapTargets', () => {
    const targets = ['Maps/Town', 'Maps/Forest']
    const expression = buildLoadTargetExpression(targets)
    expect(expression).toBe('Maps/Town, Maps/Forest')
    expect(splitMapTargets(expression)).toEqual(targets)
  })

  it('round-trips targets that contain commas inside token braces', () => {
    const targets = ['Maps/{{Target: A, B}}', 'Maps/Farm']
    expect(splitMapTargets(buildLoadTargetExpression(targets))).toEqual(targets)
  })

  it('normalizes empty target lists to an empty expression', () => {
    expect(buildLoadTargetExpression([])).toBe('')
    expect(buildLoadTargetExpression([''])).toBe('')
  })

  it('reports asset existence with case and slash normalization', () => {
    const rows = analyzeLoadBindings('Maps/Town, Maps/Forest', 'assets/TileSheets/{{TargetWithoutPath}}.png', [
      'assets\\TileSheets\\Town.PNG',
      'assets/TileSheets/Forest.png',
    ])
    expect(rows).toEqual([
      { target: 'Maps/Town', resolvedFromFile: 'assets/TileSheets/Town.png', exists: true },
      { target: 'Maps/Forest', resolvedFromFile: 'assets/TileSheets/Forest.png', exists: true },
    ])
  })

  it('marks rows missing when the template keeps a non-target token', () => {
    const rows = analyzeLoadBindings('Maps/Town, Maps/Forest', 'assets/{{ModId}}/{{TargetWithoutPath}}.png', ['assets/TileSheets/Town.png'])
    expect(rows).toMatchObject([
      { target: 'Maps/Town', resolvedFromFile: 'assets/{{ModId}}/Town.png', exists: false },
      { target: 'Maps/Forest', resolvedFromFile: 'assets/{{ModId}}/Forest.png', exists: false },
    ])
  })

  it('shows identical resolved files when the template has no target tokens', () => {
    const rows = analyzeLoadBindings('Maps/Town, Maps/Forest', 'assets/maps/Custom.tmx', ['assets/maps/Custom.tmx'])
    expect(rows).toEqual([
      { target: 'Maps/Town', resolvedFromFile: 'assets/maps/Custom.tmx', exists: true },
      { target: 'Maps/Forest', resolvedFromFile: 'assets/maps/Custom.tmx', exists: true },
    ])
  })

  it('ignores an empty target expression', () => {
    expect(analyzeLoadBindings('', 'assets/x.png', [])).toEqual([])
  })

  it('normalizes plain targets with a Maps/ prefix and forward slashes', () => {
    expect(normalizeLoadTargetInput('Town')).toBe('Maps/Town')
    expect(normalizeLoadTargetInput('Maps\\Town')).toBe('Maps/Town')
    expect(normalizeLoadTargetInput('Maps/Town')).toBe('Maps/Town')
    expect(normalizeLoadTargetInput('Town.tbin')).toBe('Maps/Town')
  })

  it('keeps token expressions intact without forcing a Maps/ prefix', () => {
    expect(normalizeLoadTargetInput('Maps/{{ModId}}_Custom')).toBe('Maps/{{ModId}}_Custom')
    expect(normalizeLoadTargetInput('{{Target}}')).toBe('{{Target}}')
    expect(normalizeLoadTargetInput('{{TargetWithoutPath}}.tmx')).toBe('{{TargetWithoutPath}}')
    expect(normalizeLoadTargetInput('assets/{{Target}}/x.tbin')).toBe('assets/{{Target}}/x')
  })

  it('returns null for blank input', () => {
    expect(normalizeLoadTargetInput('')).toBeNull()
    expect(normalizeLoadTargetInput('   ')).toBeNull()
  })
})

function loadPatch(overrides: Partial<Parameters<typeof collectLoadPatches>[0][number]> = {}) {
  return {
    id: 'patch-1',
    workspace: 'map' as const,
    target: 'Maps/Town',
    action: 'Load' as const,
    logName: '',
    enabled: true,
    editorState: null,
    ...overrides,
  }
}

describe('collectLoadPatches', () => {
  it('keeps every Load patch regardless of target family', () => {
    const patches = [
      loadPatch({ id: 'a', target: 'Maps/Town' }),
      loadPatch({ id: 'b', target: 'maps\\springobjects' }),
      loadPatch({ id: 'c', target: 'Maps/Town, Maps/Forest' }),
      loadPatch({ id: 'd', target: 'Maps/{{ModId}}_Custom' }),
      loadPatch({ id: 'e', target: 'Portraits/Abigail' }),
      loadPatch({ id: 'f', target: 'Data/Objects' }),
      loadPatch({ id: 'g', target: '{{Target}}' }),
    ]
    expect(collectLoadPatches(patches).map((patch) => patch.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
  })

  it('excludes non-Load actions', () => {
    const patches = [loadPatch({ id: 'a', action: 'EditMap' }), loadPatch({ id: 'b', action: 'EditImage' })]
    expect(collectLoadPatches(patches)).toEqual([])
  })
})

describe('loadAssetFamily', () => {
  it('classifies maps by prefix case- and slash-insensitively', () => {
    expect(loadAssetFamily('Maps/Town')).toBe('maps')
    expect(loadAssetFamily('maps\\springobjects')).toBe('maps')
    expect(loadAssetFamily('Maps')).toBe('maps')
    expect(loadAssetFamily('Maps/{{ModId}}_Custom')).toBe('maps')
  })

  it('classifies every image prefix into the images family', () => {
    for (const target of [
      'Portraits/Abigail',
      'Characters/Alex',
      'TileSheets/springobjects',
      'LooseSprites/Cursors',
      'Animals/WhiteChicken',
      'Buildings/Cabin',
    ]) {
      expect(loadAssetFamily(target)).toBe('images')
    }
    expect(loadAssetFamily('portraits\\abigail')).toBe('images')
  })

  it('classifies audio, fonts, and data targets', () => {
    expect(loadAssetFamily('Audio/NewCue')).toBe('audio')
    expect(loadAssetFamily('Fonts/NewFont')).toBe('fonts')
    expect(loadAssetFamily('Data/Objects')).toBe('data')
    expect(loadAssetFamily('data\\achievements')).toBe('data')
    expect(loadAssetFamily('Strings/Characters')).toBe('data')
  })

  it('falls back to other for unknown prefixes and token-only targets', () => {
    expect(loadAssetFamily('Somewhere/Unknown')).toBe('other')
    expect(loadAssetFamily('{{Target}}')).toBe('other')
    expect(loadAssetFamily('')).toBe('other')
    expect(loadAssetFamily('MapsExtra/Thing')).toBe('other')
  })
})

describe('groupLoadPatchesByFamily', () => {
  it('keeps every family key present and buckets by classified target', () => {
    const patches = [
      loadPatch({ id: 'a', target: 'Maps/Town' }),
      loadPatch({ id: 'b', target: 'Portraits/Abigail' }),
      loadPatch({ id: 'c', target: 'Audio/NewCue' }),
      loadPatch({ id: 'd', target: 'Data/Objects' }),
      loadPatch({ id: 'e', target: 'Something/Else' }),
    ]
    const groups = groupLoadPatchesByFamily(patches)
    expect(Object.keys(groups).sort()).toEqual(['audio', 'data', 'fonts', 'images', 'maps', 'other'])
    expect(groups.maps.map((patch) => patch.id)).toEqual(['a'])
    expect(groups.images.map((patch) => patch.id)).toEqual(['b'])
    expect(groups.audio.map((patch) => patch.id)).toEqual(['c'])
    expect(groups.data.map((patch) => patch.id)).toEqual(['d'])
    expect(groups.other.map((patch) => patch.id)).toEqual(['e'])
    expect(groups.fonts).toEqual([])
  })
})

describe('load binding creation helpers', () => {
  it('stamps family-appropriate placeholder targets', () => {
    expect(placeholderLoadTarget('maps')).toBe('Maps/NewMap')
    expect(placeholderLoadTarget('images')).toMatch(/^Portraits\//u)
    expect(placeholderLoadTarget('audio')).toMatch(/^Audio\//u)
    expect(placeholderLoadTarget('fonts')).toMatch(/^Fonts\//u)
    expect(placeholderLoadTarget('data')).toMatch(/^Data\//u)
    expect(placeholderLoadTarget('other')).toBe('NewAsset')
  })

  it('keeps map bindings in the map workspace and everything else in mods', () => {
    expect(loadFamilyWorkspace('maps')).toBe('map')
    expect(loadFamilyWorkspace('images')).toBe('mods')
    expect(loadFamilyWorkspace('audio')).toBe('mods')
    expect(loadFamilyWorkspace('fonts')).toBe('mods')
    expect(loadFamilyWorkspace('data')).toBe('mods')
    expect(loadFamilyWorkspace('other')).toBe('mods')
  })

  it('filters fromFile assets by family', () => {
    const assets = [
      { relativePath: 'assets/maps/Custom.tmx', mediaType: 'application/octet-stream' },
      { relativePath: 'assets/maps/Custom.tbin', mediaType: 'application/octet-stream' },
      { relativePath: 'assets/maps/Tiles.png', mediaType: 'image/png' },
      { relativePath: 'assets/portraits/Aspen.png', mediaType: 'image/png' },
      { relativePath: 'assets/audio/cue.wav', mediaType: 'audio/wav' },
      { relativePath: 'assets/data/objects.json', mediaType: 'application/json' },
      { relativePath: 'assets/readme.txt', mediaType: 'text/plain' },
    ]
    expect(projectAssetsForLoadFamily('maps', assets).map((asset) => asset.relativePath)).toEqual([
      'assets/maps/Custom.tmx',
      'assets/maps/Custom.tbin',
      'assets/maps/Tiles.png',
      'assets/portraits/Aspen.png',
    ])
    expect(projectAssetsForLoadFamily('images', assets).map((asset) => asset.relativePath)).toEqual([
      'assets/maps/Tiles.png',
      'assets/portraits/Aspen.png',
    ])
    expect(projectAssetsForLoadFamily('audio', assets).map((asset) => asset.relativePath)).toEqual(['assets/audio/cue.wav'])
    expect(projectAssetsForLoadFamily('data', assets).map((asset) => asset.relativePath)).toEqual([
      'assets/data/objects.json',
      'assets/readme.txt',
    ])
    expect(projectAssetsForLoadFamily('fonts', assets).map((asset) => asset.relativePath)).toEqual([
      'assets/data/objects.json',
      'assets/readme.txt',
    ])
    expect(projectAssetsForLoadFamily('other', assets).map((asset) => asset.relativePath)).toEqual([
      'assets/maps/Custom.tmx',
      'assets/maps/Custom.tbin',
    ])
  })
})
