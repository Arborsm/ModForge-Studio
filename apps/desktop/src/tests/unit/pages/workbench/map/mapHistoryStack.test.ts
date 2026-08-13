import { describe, expect, it } from 'vite-plus/test'
import type { MapDocument, MapTileset } from '@entities/map'
import {
  buildMapHistoryTimeline,
  canMergeMapHistory,
  MAP_HISTORY_MAX_ENTRIES,
  MAP_HISTORY_MERGE_WINDOW_MS,
  mapsEqual,
  partialUpdateMergeKey,
  propertyEditMergeKey,
  pushMapHistory,
  tilesetUpdateMergeKey,
  type MapHistoryEntry,
} from '@pages/workbench/workspaces/map/model/mapHistoryStack'

function document(overrides: Partial<MapDocument> = {}): MapDocument {
  return {
    name: 'HistoryMap',
    format: 'tmx',
    sourcePath: 'HistoryMap.tmx',
    relativePath: 'assets/maps/HistoryMap.tmx',
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [],
    layers: [
      {
        id: 1,
        name: 'Back',
        kind: 'tile',
        width: 4,
        height: 3,
        visible: true,
        opacity: 1,
        offsetX: 0,
        offsetY: 0,
        properties: { Keep: 'yes' },
        gids: new Uint32Array([1, 1, 2, 2, 1, 3, 3, 2, 1, 1, 2, 2]),
        nonEmptyTiles: 12,
      },
    ],
    objectGroups: [],
    ...overrides,
  }
}

function entry(overrides: Partial<MapHistoryEntry> = {}): MapHistoryEntry {
  return { document: document(), label: '初始', mergeKey: null, at: 0, ...overrides }
}

describe('map history stack', () => {
  describe('mapsEqual', () => {
    it('treats identical documents as equal', () => {
      expect(mapsEqual(document(), document())).toBe(true)
    })

    it('compares gids element-wise even when the array reference differs', () => {
      const base = document()
      const sameContent = document()
      sameContent.layers[0]!.gids = new Uint32Array(base.layers[0]!.gids)
      expect(mapsEqual(base, sameContent)).toBe(true)

      const changedGid = document()
      changedGid.layers[0]!.gids = new Uint32Array(base.layers[0]!.gids)
      changedGid.layers[0]!.gids[0] = 99
      expect(mapsEqual(base, changedGid)).toBe(false)
    })

    it('detects layer property changes', () => {
      const changed = document()
      changed.layers[0]!.properties = { Keep: 'no' }
      expect(mapsEqual(document(), changed)).toBe(false)
    })

    it('detects added and removed keys', () => {
      const added = document({ properties: { Keep: 'yes', Extra: '1' } })
      expect(mapsEqual(document(), added)).toBe(false)
      const removed = document()
      removed.layers[0]!.properties = {}
      expect(mapsEqual(document(), removed)).toBe(false)
    })

    it('compares typed property envelopes', () => {
      const base = document({ properties: { Warp: { value: '0 0 Map 4 4', tmxType: 'string' } } })
      const same = document({ properties: { Warp: { value: '0 0 Map 4 4', tmxType: 'string' } } })
      expect(mapsEqual(base, same)).toBe(true)
      const different = document({ properties: { Warp: { value: '0 0 Map 5 5', tmxType: 'string' } } })
      expect(mapsEqual(base, different)).toBe(false)
    })
  })

  describe('merge keys', () => {
    it('names the single changed property key and refuses multi-key rewrites', () => {
      expect(propertyEditMergeKey('map-cell:1:2,3', { A: '1', B: '2' }, { A: '1', B: '9' })).toBe('map-cell:1:2,3:property:B')
      expect(propertyEditMergeKey('map-cell:1:2,3', { A: '1' }, { A: '1', B: '2' })).toBe('map-cell:1:2,3:property:B')
      expect(propertyEditMergeKey('map-cell:1:2,3', { A: '1', B: '2' }, { A: 'x', B: 'y' })).toBeNull()
      expect(propertyEditMergeKey('map-cell:1:2,3', {}, {})).toBeNull()
    })

    it('derives a field key from a single-field partial update', () => {
      expect(partialUpdateMergeKey('map-layer:1', { name: 'Front' }, {})).toBe('map-layer:1:field:name')
    })

    it('derives a property key from a properties update and refuses multi-field updates', () => {
      expect(partialUpdateMergeKey('map-layer:1', { properties: { A: 'x' } }, { A: 'old' })).toBe('map-layer:1:property:A')
      expect(partialUpdateMergeKey('map-layer:1', { name: 'Front', visible: false }, {})).toBeNull()
      expect(partialUpdateMergeKey('map-layer:1', { properties: { A: 'x', B: 'y' } }, { A: 'old', B: 'old' })).toBeNull()
    })

    it('names the single tileset field that changed', () => {
      const base: MapTileset = {
        firstGid: 1,
        name: 'Tiles',
        tileWidth: 16,
        tileHeight: 16,
        tileCount: 4,
        columns: 4,
        imageSource: null,
        imagePath: null,
        imageWidth: null,
        imageHeight: null,
        properties: {},
        tileProperties: {},
        animations: {},
      }
      expect(tilesetUpdateMergeKey(base, { ...base, source: 'Tiles.tsx' })).toBe('map-tileset:Tiles:field:source')
      expect(tilesetUpdateMergeKey(base, { ...base, tileProperties: { 1: { Passable: 'T' } } })).toBe('map-tileset:Tiles:property:1')
      expect(tilesetUpdateMergeKey(base, { ...base, source: 'Tiles.tsx', tileProperties: { 1: { Passable: 'T' } } })).toBeNull()
    })
  })

  describe('entry merging', () => {
    it('merges same-key writes inside the window and keeps the first snapshot', () => {
      const first = entry({ mergeKey: 'map-layer:1:field:name', at: 100 })
      const second = entry({ mergeKey: 'map-layer:1:field:name', at: 150 })
      expect(canMergeMapHistory(first, second)).toBe(true)

      const pushed = pushMapHistory([first], second)
      expect(pushed).toHaveLength(1)
      expect(pushed[0]!.document).toBe(first.document)
      expect(pushed[0]!.label).toBe(first.label)
      expect(pushed[0]!.at).toBe(150)
    })

    it('never merges writes without a merge key', () => {
      const first = entry({ at: 100 })
      const second = entry({ at: 150 })
      expect(canMergeMapHistory(first, second)).toBe(false)
      expect(pushMapHistory([first], second)).toHaveLength(2)
    })

    it('keeps writes with different merge keys separate', () => {
      const first = entry({ mergeKey: 'map-layer:1:field:name', at: 100 })
      const second = entry({ mergeKey: 'map-layer:1:field:visible', at: 150 })
      expect(canMergeMapHistory(first, second)).toBe(false)
    })

    it('expires the window', () => {
      const first = entry({ mergeKey: 'map-layer:1:field:name', at: 100 })
      const second = entry({ mergeKey: 'map-layer:1:field:name', at: 100 + MAP_HISTORY_MERGE_WINDOW_MS + 1 })
      expect(canMergeMapHistory(first, second)).toBe(false)
    })

    it('caps the stack and drops the oldest entries', () => {
      let stack: MapHistoryEntry[] = []
      for (let index = 0; index < MAP_HISTORY_MAX_ENTRIES + 5; index += 1) {
        stack = pushMapHistory(stack, entry({ mergeKey: null, at: index }))
      }
      expect(stack).toHaveLength(MAP_HISTORY_MAX_ENTRIES)
      expect(stack[0]!.at).toBe(5)
    })
  })

  describe('timeline', () => {
    it('renders past, current, and future entries in walk order', () => {
      const timeline = buildMapHistoryTimeline(
        [entry({ label: '初始', mergeKey: null, at: 1 }), entry({ label: '绘制图块 · Back', mergeKey: null, at: 2 })],
        '重命名图层',
        [entry({ label: '绘制图块 · Back', mergeKey: null, at: 3 })],
      )
      expect(timeline).toEqual([
        { key: 'u0', label: '初始', state: 'past' },
        { key: 'u1', label: '绘制图块 · Back', state: 'past' },
        { key: 'current', label: '重命名图层', state: 'current' },
        { key: 'r0', label: '绘制图块 · Back', state: 'future' },
      ])
    })

    it('collapses a burst into one past row plus the current row', () => {
      const burst = pushMapHistory(
        [],
        entry({ document: document({ name: 'Before' }), label: '初始', mergeKey: 'map-layer:1:field:name', at: 1 }),
      )
      const merged = pushMapHistory(
        burst,
        entry({ document: document({ name: 'Renamed' }), label: '初始', mergeKey: 'map-layer:1:field:name', at: 2 }),
      )
      expect(merged).toHaveLength(1)
      const timeline = buildMapHistoryTimeline(merged, '重命名图层', [])
      expect(timeline.map((row) => row.label)).toEqual(['初始', '重命名图层'])
    })
  })
})
