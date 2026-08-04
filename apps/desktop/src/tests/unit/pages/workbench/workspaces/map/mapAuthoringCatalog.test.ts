import { describe, expect, it } from 'vite-plus/test'
import type { MapAssetSummary } from '@entities/game/api'
import {
  buildMapCatalogEntries,
  createBlankMapDocument,
  mapCatalogCategory,
  mapTargetFromAsset,
  mapTargetFromName,
  resolveGameMapPatchTarget,
  resolvePatchThumbnailTarget,
} from '@pages/workbench/workspaces/map/state/mapAuthoringCatalog'

const FARM_ASSET: MapAssetSummary = {
  id: 'farm',
  name: 'Farm',
  fileName: 'Farm.xnb',
  format: 'xnb',
  absolutePath: 'C:\\Game\\Content\\Maps\\Farm.xnb',
  relativePath: 'Content\\Maps\\Farm.xnb',
  sizeBytes: 128,
}

const TOWN_ASSET: MapAssetSummary = {
  id: 'town',
  name: 'Town',
  fileName: 'Town.xnb',
  format: 'xnb',
  absolutePath: 'C:\\Game\\Content\\Maps\\Town.xnb',
  relativePath: 'Content\\Maps\\Town.xnb',
  sizeBytes: 256,
}

describe('map authoring catalog', () => {
  it('normalizes scanned files and user names to Content Patcher map targets', () => {
    expect(mapTargetFromAsset({ name: 'Maps\\Town.xnb' })).toBe('Maps/Town')
    expect(mapTargetFromName(' Maps\\Custom Room.tmx ')).toBe('Maps/Custom_Room')
    expect(mapTargetFromName('///')).toBeNull()
  })

  it('resolves a game-map entry to a stable normalized Maps/ patch target', () => {
    expect(resolveGameMapPatchTarget({ target: 'Maps\\Town' })).toBe('Maps/Town')
    expect(resolveGameMapPatchTarget({ target: '  Maps/Farm  ' })).toBe('Maps/Farm')
    expect(resolveGameMapPatchTarget({ target: 'CustomMap' })).toBe('Maps/CustomMap')
    expect(resolveGameMapPatchTarget({ target: 'Maps' })).toBe('Maps')
  })

  it('resolves patch row thumbnails only for single literal Maps/ targets', () => {
    expect(resolvePatchThumbnailTarget('Maps/Town')).toBe('Maps/Town')
    expect(resolvePatchThumbnailTarget(' Maps\\FarmHouse ')).toBe('Maps/FarmHouse')
    expect(resolvePatchThumbnailTarget('Maps/Beach.xnb')).toBe('Maps/Beach')
    expect(resolvePatchThumbnailTarget('Maps/A, Maps/B')).toBeNull()
    expect(resolvePatchThumbnailTarget('{{ModId}}/Maps/Custom')).toBeNull()
    expect(resolvePatchThumbnailTarget('Maps/{{Year}}_Farm')).toBeNull()
    expect(resolvePatchThumbnailTarget('Characters/Abigail')).toBeNull()
    expect(resolvePatchThumbnailTarget('')).toBeNull()
  })

  it('groups common game regions into stable authoring categories', () => {
    expect(mapCatalogCategory('Maps/FarmHouse')).toBe('farm')
    expect(mapCatalogCategory('Maps/VolcanoDungeon')).toBe('island')
    expect(mapCatalogCategory('Maps/Saloon')).toBe('town')
    expect(mapCatalogCategory('Maps/CustomVoid')).toBe('other')
  })

  it('builds one game-map entry per scanned asset, sorted by name', () => {
    const entries = buildMapCatalogEntries([FARM_ASSET, TOWN_ASSET])

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ id: 'game:farm', target: 'Maps/Farm', name: 'Farm', category: 'farm', asset: FARM_ASSET })
    expect(entries[1]).toMatchObject({ id: 'game:town', target: 'Maps/Town', name: 'Town', category: 'town', asset: TOWN_ASSET })
  })

  it('keeps every scanned game map visible regardless of project patches', () => {
    const entries = buildMapCatalogEntries([FARM_ASSET])

    expect(entries).toHaveLength(1)
    expect(entries[0]?.target).toBe('Maps/Farm')
    expect(entries[0]?.asset).toBe(FARM_ASSET)
    expect('sourceKind' in (entries[0] ?? {})).toBe(false)
    expect('patch' in (entries[0] ?? {})).toBe(false)
  })

  it('creates an editable Back layer and clamps unsafe blank-map dimensions', () => {
    const document = createBlankMapDocument('Maps/Test/Room', 2, 999)

    expect(document).toMatchObject({ name: 'Test/Room', width: 5, height: 256, format: 'tmx' })
    expect(document.layers[0]).toMatchObject({ name: 'Back', width: 5, height: 256 })
    expect(document.layers[0]?.gids).toHaveLength(5 * 256)
  })
})
