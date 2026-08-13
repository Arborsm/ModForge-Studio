import { describe, expect, it } from 'vite-plus/test'
import type { MapAssetSummary } from '@entities/game/api'
import { toMapResourceBrowserOptions } from '@features/resource-browser'

const ASSET: MapAssetSummary = {
  id: 'town',
  name: 'Maps\\Town.xnb',
  fileName: 'Town.xnb',
  format: 'xnb',
  absolutePath: 'C:\\Game\\Content\\Maps\\Town.xnb',
  relativePath: 'Content\\Maps\\Town.xnb',
  sizeBytes: 2048,
}

describe('map resource browser adapter', () => {
  it('emits a logical map target without duplicating Maps or retaining the extension', () => {
    expect(toMapResourceBrowserOptions([ASSET], () => 'Town', 'warp')).toEqual([
      {
        id: 'warp:town',
        kind: 'map',
        value: 'Maps/Town',
        aliases: ['Maps\\Town.xnb', 'Town.xnb', 'Content\\Maps\\Town.xnb'],
        label: 'Maps\\Town.xnb',
        category: 'Town',
        subtitle: 'XNB',
        meta: '2048',
        sourcePath: 'Content\\Maps\\Town.xnb',
        sourceKind: 'game',
      },
    ])
  })
})
