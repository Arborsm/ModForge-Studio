import { describe, expect, it } from 'vite-plus/test'
import type { ResourceRefKind } from '@entities/asset-schema'
import { toResourceBrowserOptions } from '@features/resource-browser'

describe('asset resource browser adapter', () => {
  it.each([
    ['npc', 'actor'],
    ['item', 'item'],
    ['location', 'location'],
    ['texture', 'texture'],
    ['map', 'map'],
    ['building', 'building'],
  ] satisfies Array<[ResourceRefKind, string]>)('routes %s references into the shared %s browser catalog', (kind, browserKind) => {
    const [option] = toResourceBrowserOptions(kind, [
      {
        value: 'value',
        aliases: ['alias'],
        label: 'Label',
        category: 'Category',
        detail: 'Detail',
        sourceKind: 'project',
      },
    ])

    expect(option).toMatchObject({
      id: `${browserKind}:value`,
      kind: browserKind,
      value: 'value',
      aliases: ['alias'],
      label: 'Label',
      category: 'Category',
      subtitle: 'Detail',
      sourceKind: 'project',
    })
  })
})
