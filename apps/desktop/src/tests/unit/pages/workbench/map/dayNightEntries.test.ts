import { describe, expect, it } from 'vite-plus/test'

import type { MapDocument, MapLayer, MapTileset } from '@entities/map'
import {
  applyDayNightPreviewSwap,
  collectDayNightRectCells,
  groupDayNightDisplayRects,
  mergeDayNight,
  parseDayNightGroups,
  serializeDayNightGroups,
  type DayNightEntry,
  type DayNightGroup,
} from '@pages/workbench/workspaces/map/editors/core/dayNightEntries'

function entry(layer: string, x: number, y: number, dayTile: number | null, nightTile: number | null): DayNightEntry {
  return { layer, x, y, dayTile, nightTile }
}

/** Minimal tileset for rect-capture tests; only identity fields matter. */
function captureTileset(name: string, firstGid: number, tileCount: number): MapTileset {
  return {
    firstGid,
    name,
    tileWidth: 16,
    tileHeight: 16,
    tileCount,
    columns: 16,
    imageSource: null,
    imagePath: null,
    imageWidth: null,
    imageHeight: null,
    properties: {},
    tileProperties: {},
    animations: {},
  }
}

/**
 * 4×3 map with one `Back` layer; `gids` is row-major with 0 for empty cells.
 * Two tilesets: `spring_outdoors` (gids 1..256) and `town` (gids 257..512).
 */
function captureDocument(gids: readonly number[]): MapDocument {
  const layer: MapLayer = {
    id: 1,
    name: 'Back',
    kind: 'tile',
    width: 4,
    height: 3,
    visible: true,
    opacity: 1,
    offsetX: 0,
    offsetY: 0,
    properties: {},
    gids: Uint32Array.from(gids),
    nonEmptyTiles: gids.filter((gid) => gid !== 0).length,
    cellProperties: {},
  }
  return {
    name: 'CaptureMap',
    format: 'tmx',
    sourcePath: 'CaptureMap.tmx',
    relativePath: 'assets/maps/CaptureMap.tmx',
    width: 4,
    height: 3,
    tileWidth: 16,
    tileHeight: 16,
    orientation: 'orthogonal',
    renderOrder: 'right-down',
    properties: {},
    tilesets: [captureTileset('spring_outdoors', 1, 256), captureTileset('town', 257, 256)],
    layers: [layer],
    objectGroups: [],
  }
}

describe('applyDayNightPreviewSwap', () => {
  it('夜晚预览把覆盖格的 gid 换成同图块表上的夜图块', () => {
    // (0,0)=5 (spring_outdoors tile 4), (1,0)=260 (town tile 3)
    const gids = [5, 260, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const document = captureDocument(gids)
    const swaps: DayNightGroup[] = [
      { layer: 'Back', x: 0, y: 0, tileIndex: 9 },
      { layer: 'Back', x: 1, y: 0, tileIndex: 2 },
    ]
    const next = applyDayNightPreviewSwap(document, swaps)
    const layer = next.layers[0]
    if (!layer) throw new Error('missing layer')
    expect(Array.from(layer.gids)).toEqual([10, 259, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('空格与越界索引不参与换块，无可换时返回原文档', () => {
    const gids = [0, 260, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const document = captureDocument(gids)
    expect(applyDayNightPreviewSwap(document, [{ layer: 'Back', x: 0, y: 0, tileIndex: 9 }])).toBe(document)
    expect(applyDayNightPreviewSwap(document, [{ layer: 'Back', x: 1, y: 0, tileIndex: 999 }])).toBe(document)
    expect(applyDayNightPreviewSwap(document, [{ layer: 'Buildings', x: 1, y: 0, tileIndex: 2 }])).toBe(document)
    expect(applyDayNightPreviewSwap(document, [])).toBe(document)
  })
})

describe('collectDayNightRectCells', () => {
  it('采集区域内非空格的图块表局部索引，空格只计数', () => {
    // row1: (0,1)=5, (1,1)=0 empty, (2,1)=9, (3,1)=0 empty
    const gids = [0, 0, 0, 0, 5, 0, 9, 0, 0, 0, 0, 0]
    const capture = collectDayNightRectCells(captureDocument(gids), 'Back', { x: 0, y: 1, width: 4, height: 1 })
    expect(capture.cells).toEqual([
      { x: 0, y: 1, tilesetName: 'spring_outdoors', dayTile: 4 },
      { x: 2, y: 1, tilesetName: 'spring_outdoors', dayTile: 8 },
    ])
    expect(capture.emptyCellCount).toBe(2)
    expect(capture.mixedTilesets).toBe(false)
  })

  it('跨图块表的区域标记 mixedTilesets', () => {
    // (0,0)=5 (spring_outdoors), (1,0)=260 (town)
    const gids = [5, 260, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const capture = collectDayNightRectCells(captureDocument(gids), 'Back', { x: 0, y: 0, width: 2, height: 1 })
    expect(capture.cells).toEqual([
      { x: 0, y: 0, tilesetName: 'spring_outdoors', dayTile: 4 },
      { x: 1, y: 0, tilesetName: 'town', dayTile: 3 },
    ])
    expect(capture.mixedTilesets).toBe(true)
  })

  it('1×1 区域退化为单格采集', () => {
    const gids = [0, 0, 0, 0, 0, 42, 0, 0, 0, 0, 0, 0]
    const capture = collectDayNightRectCells(captureDocument(gids), 'Back', { x: 1, y: 1, width: 1, height: 1 })
    expect(capture.cells).toEqual([{ x: 1, y: 1, tilesetName: 'spring_outdoors', dayTile: 41 }])
    expect(capture.emptyCellCount).toBe(0)
  })

  it('图层不存在时整区按空格处理', () => {
    const gids = [5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const capture = collectDayNightRectCells(captureDocument(gids), 'Buildings', { x: 0, y: 0, width: 2, height: 1 })
    expect(capture.cells).toEqual([])
    expect(capture.emptyCellCount).toBe(2)
    expect(capture.mixedTilesets).toBe(false)
  })
})

describe('groupDayNightDisplayRects', () => {
  const columns16 = () => 16

  it('夜侧连续偏移的格归并为一个区域（日侧不作约束）', () => {
    const rects = groupDayNightDisplayRects([entry('Back', 6, 4, 12, 67), entry('Back', 7, 4, 12, 68)], columns16)
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 6,
        y: 4,
        width: 2,
        height: 1,
        cells: [
          { x: 6, y: 4, dayTile: 12, nightTile: 67 },
          { x: 7, y: 4, dayTile: 12, nightTile: 68 },
        ],
      },
    ])
  })

  it('夜侧 2D 偏移区域整体归并', () => {
    const rects = groupDayNightDisplayRects(
      [entry('Back', 0, 0, 1, 67), entry('Back', 1, 0, 2, 68), entry('Back', 0, 1, 3, 83), entry('Back', 1, 1, 4, 84)],
      columns16,
    )
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        cells: [
          { x: 0, y: 0, dayTile: 1, nightTile: 67 },
          { x: 1, y: 0, dayTile: 2, nightTile: 68 },
          { x: 0, y: 1, dayTile: 3, nightTile: 83 },
          { x: 1, y: 1, dayTile: 4, nightTile: 84 },
        ],
      },
    ])
  })

  it('夜图块跨行回绕时不归并', () => {
    // columns=16：起点 night=15 在该行最后一列，相邻格 night=16 已换行。
    const rects = groupDayNightDisplayRects([entry('Back', 0, 0, 1, 15), entry('Back', 1, 0, 2, 16)], columns16)
    expect(rects).toEqual([
      { layer: 'Back', x: 0, y: 0, width: 1, height: 1, cells: [{ x: 0, y: 0, dayTile: 1, nightTile: 15 }] },
      { layer: 'Back', x: 1, y: 0, width: 1, height: 1, cells: [{ x: 1, y: 0, dayTile: 2, nightTile: 16 }] },
    ])
  })

  it('无夜侧的格按日侧偏移归并', () => {
    const rects = groupDayNightDisplayRects([entry('Back', 3, 4, 574, null), entry('Back', 4, 4, 575, null)], columns16)
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 2,
        height: 1,
        cells: [
          { x: 3, y: 4, dayTile: 574, nightTile: null },
          { x: 4, y: 4, dayTile: 575, nightTile: null },
        ],
      },
    ])
  })

  it('tile 对完全相同的格仍走等价归并', () => {
    const rects = groupDayNightDisplayRects(
      [entry('Back', 3, 4, 574, 638), entry('Back', 4, 4, 574, 638), entry('Back', 5, 4, 574, 638)],
      columns16,
    )
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 3,
        height: 1,
        cells: [
          { x: 3, y: 4, dayTile: 574, nightTile: 638 },
          { x: 4, y: 4, dayTile: 574, nightTile: 638 },
          { x: 5, y: 4, dayTile: 574, nightTile: 638 },
        ],
      },
    ])
  })

  it('L 形等价集合按贪心矩形拆分', () => {
    const rects = groupDayNightDisplayRects(
      [entry('Back', 1, 1, 574, 638), entry('Back', 2, 1, 574, 638), entry('Back', 1, 2, 574, 638)],
      columns16,
    )
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        cells: [
          { x: 1, y: 1, dayTile: 574, nightTile: 638 },
          { x: 2, y: 1, dayTile: 574, nightTile: 638 },
        ],
      },
      { layer: 'Back', x: 1, y: 2, width: 1, height: 1, cells: [{ x: 1, y: 2, dayTile: 574, nightTile: 638 }] },
    ])
  })

  it('day/night 不对称的格不互相合并', () => {
    const rects = groupDayNightDisplayRects(
      [entry('Back', 3, 4, 574, null), entry('Back', 3, 5, null, 638), entry('Back', 4, 4, 574, 638)],
      columns16,
    )
    expect(rects).toEqual([
      { layer: 'Back', x: 3, y: 4, width: 1, height: 1, cells: [{ x: 3, y: 4, dayTile: 574, nightTile: null }] },
      { layer: 'Back', x: 4, y: 4, width: 1, height: 1, cells: [{ x: 4, y: 4, dayTile: 574, nightTile: 638 }] },
      { layer: 'Back', x: 3, y: 5, width: 1, height: 1, cells: [{ x: 3, y: 5, dayTile: null, nightTile: 638 }] },
    ])
  })

  it('不同 layer 不合并，输出按 layer → y → x 排序', () => {
    const rects = groupDayNightDisplayRects(
      [entry('Front', 3, 3, 574, 638), entry('Back', 3, 3, 574, 638), entry('Back', 5, 5, 574, 638)],
      columns16,
    )
    expect(rects).toEqual([
      { layer: 'Back', x: 3, y: 3, width: 1, height: 1, cells: [{ x: 3, y: 3, dayTile: 574, nightTile: 638 }] },
      { layer: 'Back', x: 5, y: 5, width: 1, height: 1, cells: [{ x: 5, y: 5, dayTile: 574, nightTile: 638 }] },
      { layer: 'Front', x: 3, y: 3, width: 1, height: 1, cells: [{ x: 3, y: 3, dayTile: 574, nightTile: 638 }] },
    ])
  })

  it('resolveColumns 无法解析时跳过偏移归并', () => {
    const rects = groupDayNightDisplayRects([entry('Back', 6, 4, 12, 67), entry('Back', 7, 4, 12, 68)], () => null)
    expect(rects).toEqual([
      { layer: 'Back', x: 6, y: 4, width: 1, height: 1, cells: [{ x: 6, y: 4, dayTile: 12, nightTile: 67 }] },
      { layer: 'Back', x: 7, y: 4, width: 1, height: 1, cells: [{ x: 7, y: 4, dayTile: 12, nightTile: 68 }] },
    ])
  })

  it('合并后的完整流程：原版窗户矩形连排压缩为一块', () => {
    const day: DayNightGroup[] = [
      { layer: 'Back', x: 3, y: 4, tileIndex: 574 },
      { layer: 'Back', x: 3, y: 5, tileIndex: 574 },
      { layer: 'Back', x: 3, y: 6, tileIndex: 574 },
    ]
    const night: DayNightGroup[] = [
      { layer: 'Back', x: 3, y: 4, tileIndex: 638 },
      { layer: 'Back', x: 3, y: 5, tileIndex: 638 },
      { layer: 'Back', x: 3, y: 6, tileIndex: 638 },
    ]
    const rects = groupDayNightDisplayRects(mergeDayNight(day, night), columns16)
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 1,
        height: 3,
        cells: [
          { x: 3, y: 4, dayTile: 574, nightTile: 638 },
          { x: 3, y: 5, dayTile: 574, nightTile: 638 },
          { x: 3, y: 6, dayTile: 574, nightTile: 638 },
        ],
      },
    ])
  })
})

describe('parseDayNightGroups / serializeDayNightGroups / mergeDayNight', () => {
  it('解析与序列化往返', () => {
    const raw = 'Back 3 4 574 Front 0 1 8'
    const parsed = parseDayNightGroups(raw)
    expect(parsed.groups).toEqual([
      { layer: 'Back', x: 3, y: 4, tileIndex: 574 },
      { layer: 'Front', x: 0, y: 1, tileIndex: 8 },
    ])
    expect(parsed.leftover).toEqual([])
    expect(serializeDayNightGroups(parsed.groups, parsed.leftover)).toBe(raw)
  })

  it('非法 token 打乱固定分组后按组丢弃，其余保留在 leftover 中原样往返', () => {
    const raw = 'Back 3 4 574 weird Back 5 5 638'
    const parsed = parseDayNightGroups(raw)
    expect(parsed.groups).toEqual([{ layer: 'Back', x: 3, y: 4, tileIndex: 574 }])
    expect(parsed.leftover).toEqual(['weird', 'Back', '5', '5', '638'])
    expect(serializeDayNightGroups(parsed.groups, parsed.leftover)).toBe(raw)
  })

  it('mergeDayNight 同格配对不同侧', () => {
    const merged = mergeDayNight(
      [{ layer: 'Back', x: 3, y: 4, tileIndex: 574 }],
      [
        { layer: 'Back', x: 3, y: 4, tileIndex: 638 },
        { layer: 'Back', x: 5, y: 5, tileIndex: 639 },
      ],
    )
    expect(merged).toEqual([
      { layer: 'Back', x: 3, y: 4, dayTile: 574, nightTile: 638 },
      { layer: 'Back', x: 5, y: 5, dayTile: null, nightTile: 639 },
    ])
  })

  it('合并后的完整流程：原版窗户矩形连排压缩为一块', () => {
    const day: DayNightGroup[] = [
      { layer: 'Back', x: 3, y: 4, tileIndex: 574 },
      { layer: 'Back', x: 3, y: 5, tileIndex: 574 },
      { layer: 'Back', x: 3, y: 6, tileIndex: 574 },
    ]
    const night: DayNightGroup[] = [
      { layer: 'Back', x: 3, y: 4, tileIndex: 638 },
      { layer: 'Back', x: 3, y: 5, tileIndex: 638 },
      { layer: 'Back', x: 3, y: 6, tileIndex: 638 },
    ]
    const rects = groupDayNightDisplayRects(mergeDayNight(day, night), () => 16)
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 1,
        height: 3,
        cells: [
          { x: 3, y: 4, dayTile: 574, nightTile: 638 },
          { x: 3, y: 5, dayTile: 574, nightTile: 638 },
          { x: 3, y: 6, dayTile: 574, nightTile: 638 },
        ],
      },
    ])
  })
})
