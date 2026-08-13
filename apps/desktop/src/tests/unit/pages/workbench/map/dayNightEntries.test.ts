import { describe, expect, it } from 'vite-plus/test'

import {
  groupDayNightRects,
  mergeDayNight,
  parseDayNightGroups,
  serializeDayNightGroups,
  type DayNightEntry,
  type DayNightGroup,
} from '@pages/workbench/workspaces/map/editors/core/dayNightEntries'

function entry(layer: string, x: number, y: number, dayTile: number | null, nightTile: number | null): DayNightEntry {
  return { layer, x, y, dayTile, nightTile }
}

function cells(points: ReadonlyArray<readonly [number, number]>) {
  return points.map(([x, y]) => ({ x, y }))
}

describe('groupDayNightRects', () => {
  it('合并同一行的横向连续格', () => {
    const rects = groupDayNightRects([entry('Back', 3, 4, 574, 638), entry('Back', 4, 4, 574, 638), entry('Back', 5, 4, 574, 638)])
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 3,
        height: 1,
        dayTile: 574,
        nightTile: 638,
        cells: cells([
          [3, 4],
          [4, 4],
          [5, 4],
        ]),
      },
    ])
  })

  it('合并同一列的纵向连续格', () => {
    const rects = groupDayNightRects([entry('Back', 3, 4, 574, 638), entry('Back', 3, 5, 574, 638), entry('Back', 3, 6, 574, 638)])
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 1,
        height: 3,
        dayTile: 574,
        nightTile: 638,
        cells: cells([
          [3, 4],
          [3, 5],
          [3, 6],
        ]),
      },
    ])
  })

  it('合并 2D 矩形块', () => {
    const rects = groupDayNightRects([
      entry('Back', 1, 1, 574, 638),
      entry('Back', 2, 1, 574, 638),
      entry('Back', 3, 1, 574, 638),
      entry('Back', 1, 2, 574, 638),
      entry('Back', 2, 2, 574, 638),
      entry('Back', 3, 2, 574, 638),
    ])
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 1,
        y: 1,
        width: 3,
        height: 2,
        dayTile: 574,
        nightTile: 638,
        cells: cells([
          [1, 1],
          [2, 1],
          [3, 1],
          [1, 2],
          [2, 2],
          [3, 2],
        ]),
      },
    ])
  })

  it('不同 tile 不合并', () => {
    const rects = groupDayNightRects([entry('Back', 3, 4, 574, 638), entry('Back', 4, 4, 575, 638)])
    expect(rects).toEqual([
      { layer: 'Back', x: 3, y: 4, width: 1, height: 1, dayTile: 574, nightTile: 638, cells: cells([[3, 4]]) },
      { layer: 'Back', x: 4, y: 4, width: 1, height: 1, dayTile: 575, nightTile: 638, cells: cells([[4, 4]]) },
    ])
  })

  it('L 形集合按贪心矩形拆分', () => {
    const rects = groupDayNightRects([entry('Back', 1, 1, 574, 638), entry('Back', 2, 1, 574, 638), entry('Back', 1, 2, 574, 638)])
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 1,
        y: 1,
        width: 2,
        height: 1,
        dayTile: 574,
        nightTile: 638,
        cells: cells([
          [1, 1],
          [2, 1],
        ]),
      },
      { layer: 'Back', x: 1, y: 2, width: 1, height: 1, dayTile: 574, nightTile: 638, cells: cells([[1, 2]]) },
    ])
  })

  it('单格保持 1×1', () => {
    const rects = groupDayNightRects([entry('Back', 3, 4, 574, null)])
    expect(rects).toEqual([{ layer: 'Back', x: 3, y: 4, width: 1, height: 1, dayTile: 574, nightTile: null, cells: cells([[3, 4]]) }])
  })

  it('day/night 不对称的格按 key 分组不互相合并', () => {
    const rects = groupDayNightRects([entry('Back', 3, 4, 574, null), entry('Back', 3, 5, null, 638), entry('Back', 4, 4, 574, 638)])
    expect(rects).toEqual([
      { layer: 'Back', x: 3, y: 4, width: 1, height: 1, dayTile: 574, nightTile: null, cells: cells([[3, 4]]) },
      { layer: 'Back', x: 4, y: 4, width: 1, height: 1, dayTile: 574, nightTile: 638, cells: cells([[4, 4]]) },
      { layer: 'Back', x: 3, y: 5, width: 1, height: 1, dayTile: null, nightTile: 638, cells: cells([[3, 5]]) },
    ])
  })

  it('不同 layer 不合并，输出按 layer → y → x 排序', () => {
    const rects = groupDayNightRects([entry('Front', 3, 3, 574, 638), entry('Back', 3, 3, 574, 638), entry('Back', 5, 5, 574, 638)])
    expect(rects).toEqual([
      { layer: 'Back', x: 3, y: 3, width: 1, height: 1, dayTile: 574, nightTile: 638, cells: cells([[3, 3]]) },
      { layer: 'Back', x: 5, y: 5, width: 1, height: 1, dayTile: 574, nightTile: 638, cells: cells([[5, 5]]) },
      { layer: 'Front', x: 3, y: 3, width: 1, height: 1, dayTile: 574, nightTile: 638, cells: cells([[3, 3]]) },
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
    const rects = groupDayNightRects(mergeDayNight(day, night))
    expect(rects).toEqual([
      {
        layer: 'Back',
        x: 3,
        y: 4,
        width: 1,
        height: 3,
        dayTile: 574,
        nightTile: 638,
        cells: cells([
          [3, 4],
          [3, 5],
          [3, 6],
        ]),
      },
    ])
  })
})
