import { describe, expect, it } from 'vite-plus/test'
import { summarizeContentPatcherContent } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-model/contentPatcher'

describe('contentPatcher inspection helpers', () => {
  it('summarizes content without constructing editor or simulation state', () => {
    const summary = summarizeContentPatcherContent({
      Format: '2.0.0',
      Changes: [
        { Action: 'EditData', Target: 'Data/Objects', LogName: 'Prices' },
        { Action: 'Load', Target: ['Maps/Town', 'Maps/BusStop'], FromFile: 'assets/map.tbin' },
      ],
      ConfigSchema: { Enable: { Default: true } },
    })
    expect(summary).toMatchObject({ format: '2.0.0', changeCount: 2, configKeys: ['Enable'] })
    expect(summary.patches[1]?.target).toBe('Maps/Town, Maps/BusStop')
  })
})
