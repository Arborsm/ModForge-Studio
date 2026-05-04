import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseDirectory, exportContentPatcherAsset, type LoadContentPatcherResultAssetResult } from '../../../lib/desktop'
import { createDefaultContentPatcherSimulationContext } from '../../../lib/plugins/contentPatcher'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { ContentPatcherExportPanel } from './ContentPatcherExportPanel'

vi.mock('../../../lib/desktop', () => ({
  chooseDirectory: vi.fn(),
  exportContentPatcherAsset: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function buildResult(): LoadContentPatcherResultAssetResult {
  return {
    target: {
      path: 'Data/Objects',
      assetKind: 'json',
      touchedPatchCount: 1,
      resultState: 'determinate',
      patchIds: ['content.json:0#target:0#from:0'],
    },
    trace: [],
    result: {
      kind: 'json',
      json: { 24: { Price: 35 } },
      imageDataUrl: null,
      originalImageDataUrl: null,
      originalImageSource: null,
      mapDebug: null,
    },
    diagnostics: [],
    exportable: true,
  }
}

describe('ContentPatcherExportPanel', () => {
  it('exports the selected target result through the backend command', async () => {
    vi.mocked(chooseDirectory).mockResolvedValue('E:\\Exports' as never)
    vi.mocked(exportContentPatcherAsset).mockResolvedValue({
      target: 'Data/Objects',
      outputPath: 'E:\\Exports\\Data-Objects.json',
      format: 'json',
      diagnostics: [],
    } as never)

    renderWithLocale(
      <ContentPatcherExportPanel
        projectPath="E:\\Mods\\SeasonalGarden"
        gameRootPath="E:\\Games\\Stardew Valley"
        snapshot={{
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
        }}
        manifestJson={'{\n  "Name": "Seasonal Garden"\n}\n'}
        contentJson={'{\n  "Format": "2.0.0",\n  "Changes": []\n}\n'}
        simulationContext={createDefaultContentPatcherSimulationContext()}
        selectedTargetPath="Data/Objects"
        result={buildResult()}
      />,
    )

    fireEvent.click(screen.getByText('Export JSON Result'))

    await waitFor(() => {
      expect(vi.mocked(exportContentPatcherAsset)).toHaveBeenCalledTimes(1)
    })
    const request = vi.mocked(exportContentPatcherAsset).mock.calls[0]?.[0]
    expect(request?.target).toBe('Data/Objects')
    expect(request?.gameRootPath).toContain('Stardew Valley')
  })
})
