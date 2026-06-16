import { describe, expect, it } from 'vite-plus/test'
import { buildModBrowserGroups, buildModEntryLookup, findModBrowserEntry, getModBrowserSelectionId } from './browser'

describe('modAssetIndex', () => {
  it('builds mod browser entries with stable selection ids and mod metadata', () => {
    const mapAsset = {
      id: 'Content/Maps/Town.xnb',
      name: 'Town',
      fileName: 'Town.xnb',
      absolutePath: 'E:\\Games\\Stardew Valley\\Content\\Maps\\Town.xnb',
      relativePath: 'Content\\Maps\\Town.xnb',
      format: 'xnb',
      sizeBytes: 1024,
    }

    const groups = buildModBrowserGroups({
      mods: [
        {
          modId: 'Example.MapPack',
          modName: 'Example Map Pack',
          modPath: 'E:\\Games\\Stardew Valley\\Mods\\Example.MapPack',
          pluginKind: 'content-patcher',
          maps: [
            {
              key: 'Content/Maps/Town.xnb',
              label: 'Town',
              targets: ['Maps/Town'],
              patchIds: ['content.json:0#target:0#from:0'],
            },
          ],
          events: [],
          characters: [],
          buildings: [],
          items: [],
        },
      ],
      selectReferences: (group) => group.maps,
      entryLookup: buildModEntryLookup([mapAsset], (asset) => asset.id),
      filterText: '',
      getSearchText: (asset) => `${asset.name} ${asset.relativePath}`.toLowerCase(),
      getFallbackLabel: (asset) => asset.name,
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.items[0]).toMatchObject({
      selectionId: getModBrowserSelectionId('Example.MapPack', 'Content/Maps/Town.xnb'),
      modId: 'Example.MapPack',
      modName: 'Example Map Pack',
      modPath: 'E:\\Games\\Stardew Valley\\Mods\\Example.MapPack',
      key: 'Content/Maps/Town.xnb',
      label: 'Town',
      value: mapAsset,
      targets: ['Maps/Town'],
      patchIds: ['content.json:0#target:0#from:0'],
    })
  })

  it('finds the selected mod browser entry by selection id', () => {
    const asset = {
      key: 'Abigail',
      displayName: 'Abigail',
      searchText: 'abigail',
    }

    const groups = buildModBrowserGroups({
      mods: [
        {
          modId: 'Example.CharacterPack',
          modName: 'Example Character Pack',
          modPath: 'E:\\Mods\\Example.CharacterPack',
          pluginKind: 'content-patcher',
          maps: [],
          events: [],
          characters: [
            {
              key: 'Abigail',
              label: '',
              targets: ['Characters/Abigail', 'Portraits/Abigail'],
              patchIds: ['content.json:1#target:0#from:0'],
            },
          ],
          buildings: [],
          items: [],
        },
      ],
      selectReferences: (group) => group.characters,
      entryLookup: buildModEntryLookup([asset], (entry) => entry.key),
      filterText: '',
      getSearchText: (entry) => entry.searchText,
      getFallbackLabel: (entry) => entry.displayName,
    })

    const selectionId = getModBrowserSelectionId('Example.CharacterPack', 'Abigail')
    const entry = findModBrowserEntry(groups, selectionId)

    expect(entry?.selectionId).toBe(selectionId)
    expect(entry?.targets).toEqual(['Characters/Abigail', 'Portraits/Abigail'])
  })
})
