import { describe, expect, it } from 'vitest'
import {
  buildContentPatcherSimulationRequest,
  getPatchObject,
  parseJsonText,
  summarizeContentPatcherContent,
  updatePatchWhen,
} from './contentPatcher'

describe('contentPatcher helpers', () => {
  it('builds simulation requests without canvas helpers', () => {
    const snapshot = {
      summary: {
        name: 'Seasonal Garden',
        uniqueId: 'Aly.SeasonalGarden',
        contentPackFor: 'Pathoschild.ContentPatcher',
        absolutePath: 'E:\\Mods\\SeasonalGarden',
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
      },
      sources: [],
      includeTree: [],
      diagnostics: [],
    }
    const context = {
      season: '',
      weather: '',
      relationship: '',
      config: {},
      installedMods: [],
      customTokens: {},
    }

    const request = buildContentPatcherSimulationRequest(snapshot as never, context, {
      path: 'E:\\Mods\\SeasonalGarden',
      gameRootPath: 'E:\\Games\\Stardew Valley',
      manifestJson: '{ "Name": "Seasonal Garden" }',
      contentJson: '{ "Format": "2.0.0", "Changes": [] }',
    })

    expect(request.path).toBe('E:\\Mods\\SeasonalGarden')
    expect(request.gameRootPath).toBe('E:\\Games\\Stardew Valley')
    expect(request.context?.installedMods).toEqual([])
  })

  it('summarizes content.json into patch metadata', () => {
    const summary = summarizeContentPatcherContent({
      Format: '2.0.0',
      Changes: [
        { Action: 'EditData', Target: 'Data/Objects', LogName: 'Prices' },
        { Action: 'Load', Target: 'Maps/Farm', FromFile: 'assets/farm.tbin' },
      ],
      ConfigSchema: { Enable: { AllowValues: 'true,false' } },
    })

    expect(summary.format).toBe('2.0.0')
    expect(summary.changeCount).toBe(2)
    expect(summary.patches[0]?.id).toBe('patch:0')
    expect(summary.configKeys).toEqual(['Enable'])
  })

  it('joins array targets in patch summaries', () => {
    const summary = summarizeContentPatcherContent({
      Format: '2.0.0',
      Changes: [{ Action: 'Load', Target: ['Maps/Town', 'Maps/BusStop'] }],
    })

    expect(summary.patches[0]?.target).toBe('Maps/Town, Maps/BusStop')
  })

  it('reads and updates patch When blocks', () => {
    const content = {
      Changes: [{ Action: 'EditData', Target: 'Data/Objects', When: { Season: 'spring' } }],
    }

    const patch = getPatchObject(content, 'patch:0')
    expect(patch?.Action).toBe('EditData')

    const updated = updatePatchWhen(content, 'patch:0', '{ "Season": "winter" }')
    expect(updated.error).toBeNull()
    expect(getPatchObject(updated.value, 'patch:0')?.When).toEqual({ Season: 'winter' })
  })

  it('returns parse errors for invalid JSON text', () => {
    const parsed = parseJsonText('{ "Changes": [ }')
    expect(parsed.error).toBeTruthy()
  })
})
