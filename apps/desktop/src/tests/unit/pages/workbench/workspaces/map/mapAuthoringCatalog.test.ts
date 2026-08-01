import { describe, expect, it } from 'vite-plus/test'
import type { MapAssetSummary } from '@entities/game/api'
import type { DraftPatch } from '@features/cp-maker'
import {
  buildMapCatalogEntries,
  createBlankMapDocument,
  mapCatalogCategory,
  mapTargetFromAsset,
  mapTargetFromName,
  resolveGameMapPatchTarget,
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

function patch(overrides: Partial<DraftPatch> = {}): DraftPatch {
  return {
    id: 'patch-farm',
    workspace: 'map',
    target: 'Maps/Farm',
    action: 'EditMap',
    logName: '',
    enabled: true,
    editorState: {},
    ...overrides,
  }
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

  it('groups common game regions into stable authoring categories', () => {
    expect(mapCatalogCategory('Maps/FarmHouse')).toBe('farm')
    expect(mapCatalogCategory('Maps/VolcanoDungeon')).toBe('island')
    expect(mapCatalogCategory('Maps/Saloon')).toBe('town')
    expect(mapCatalogCategory('Maps/CustomVoid')).toBe('other')
  })

  it('lets a project map change replace the matching scanned game entry', () => {
    const entries = buildMapCatalogEntries([patch()], [FARM_ASSET])

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ sourceKind: 'project', target: 'Maps/Farm', asset: FARM_ASSET })
  })

  it('keeps legacy map replacements visible so they can be migrated', () => {
    const entries = buildMapCatalogEntries([patch({ action: 'Load', fromFile: 'assets/maps/Farm.tmx' })], [FARM_ASSET])

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ sourceKind: 'project', target: 'Maps/Farm', asset: FARM_ASSET })
  })

  it('creates an editable Back layer and clamps unsafe blank-map dimensions', () => {
    const document = createBlankMapDocument('Maps/Test/Room', 2, 999)

    expect(document).toMatchObject({ name: 'Test/Room', width: 5, height: 256, format: 'tmx' })
    expect(document.layers[0]).toMatchObject({ name: 'Back', width: 5, height: 256 })
    expect(document.layers[0]?.gids).toHaveLength(5 * 256)
  })

  it('surfaces an embedded project map document for immediate editor preview', () => {
    const mapDocument = createBlankMapDocument('Maps/Workshop', 20, 12)
    const [entry] = buildMapCatalogEntries([patch({ target: 'Maps/Workshop', editorState: { mapDocument } })], [])

    expect(entry?.embeddedDocument).toBe(mapDocument)
  })
})
