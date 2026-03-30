import { describe, expect, it } from 'vitest'
import {
  buildContentPatcherCanvas,
  collectContentPatcherAssets,
  collectContentPatcherTargets,
  getContentPatcherConditionPresets,
  getPatchPreviewJson,
  validateContentPatcherConnection,
} from './contentPatcher'

describe('contentPatcher data helpers', () => {
  it('collects assets by kind and dedupes by path', () => {
    const content = {
      Changes: [
        {
          Action: 'EditImage',
          FromFile: 'assets/abby.png',
          Target: 'Portraits/Abigail',
        },
        {
          Action: 'EditData',
          FromFile: ['data/a.json', 'data/b.json', 'data/a.json'],
          Target: 'Data/Locations',
        },
        {
          Action: 'Load',
          FromFile: 'other/legacy.tbin',
          Target: 'Maps/Forest',
        },
      ],
    }

    expect(collectContentPatcherAssets(content)).toEqual([
      { path: 'assets/abby.png', kind: 'image' },
      { path: 'data/a.json', kind: 'json' },
      { path: 'data/b.json', kind: 'json' },
      { path: 'other/legacy.tbin', kind: 'other' },
    ])
  })

  it('collects unique target paths from patches', () => {
    const content = {
      Changes: [
        { Action: 'EditData', Target: 'Data/Locations' },
        { Action: 'EditImage', Target: ['Maps/Town', ' Maps/Town', 'Maps/Forest'] },
      ],
    }

    expect(collectContentPatcherTargets(content)).toEqual(['Data/Locations', 'Maps/Forest', 'Maps/Town'])
  })

  it('exposes standard condition presets', () => {
    const presets = getContentPatcherConditionPresets()
    const keys = presets.map((preset) => preset.key)
    expect(keys).toEqual(expect.arrayContaining(['Season', 'Weather', 'Relationship', 'Config']))
  })

  it('builds canvas nodes/edges and applies simulation state', () => {
    const content = {
      Changes: [
        {
          Action: 'EditImage',
          Target: 'Portraits/Abigail',
          FromFile: 'assets/abby.png',
          When: {
            Season: 'spring',
            Weather: ['sunny', 'clear'],
          },
        },
        {
          Action: 'EditData',
          Target: 'Data/Locations',
          FromFile: 'data/loc.json',
          When: {
            Relationship: 'Married',
            ShowDresses: true,
          },
        },
      ],
    }

    const result = buildContentPatcherCanvas(content, {
      simulation: {
        season: 'winter',
        weather: 'sunny',
        relationship: 'Married',
        config: { ShowDresses: true },
      },
    })

    const actionNodes = result.nodes.filter((node) => node.kind === 'action')
    expect(actionNodes).toHaveLength(2)

    const springNode = actionNodes.find((node) => node.data.patchId === 'patch:0')
    const dataNode = actionNodes.find((node) => node.data.patchId === 'patch:1')

    expect(springNode?.data.simulation?.isActive).toBe(false)
    expect(dataNode?.data.simulation?.isActive).toBe(true)

    const hasLogicEdge = result.edges.some((edge) => edge.type === 'logic')
    const hasFileEdge = result.edges.some((edge) => edge.type === 'file')
    const hasDataEdge = result.edges.some((edge) => edge.type === 'data')

    expect(hasLogicEdge).toBe(true)
    expect(hasFileEdge).toBe(true)
    expect(hasDataEdge).toBe(true)
  })

  it('validates incompatible connections', () => {
    const invalid = validateContentPatcherConnection({
      sourceKind: 'action',
      targetKind: 'target',
      action: 'EditImage',
      targetPath: 'Data/Locations',
    })

    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.reason).toBe('action-target-mismatch')
    }

    const valid = validateContentPatcherConnection({
      sourceKind: 'condition',
      targetKind: 'action',
    })

    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.edgeType).toBe('logic')
    }
  })

  it('builds preview json for a selected patch', () => {
    const content = {
      Changes: [
        { Action: 'EditImage', Target: 'Portraits/Abigail', FromFile: 'assets/abby.png' },
      ],
    }

    const preview = getPatchPreviewJson(content, 'patch:0')
    expect(preview).toContain('"Action": "EditImage"')
    expect(preview).toContain('"Target": "Portraits/Abigail"')
  })
})
