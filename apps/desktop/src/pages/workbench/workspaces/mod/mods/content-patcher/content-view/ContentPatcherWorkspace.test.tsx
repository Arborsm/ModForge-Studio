import type { ComponentProps } from 'react'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { getModWorkspaceCopy } from '@locales/api'
import { createDefaultContentPatcherSimulationContext } from '../content-model/contentPatcher'
import type { WorkspacePluginCapability } from '../content-model/types'
import { renderWithLocale } from '@test/renderWithLocale'
import { ContentPatcherWorkspace } from './ContentPatcherWorkspace'

const copy = getModWorkspaceCopy('en-US')

afterEach(() => {
  cleanup()
})

function buildProps(): ComponentProps<typeof ContentPatcherWorkspace> {
  return {
    pluginDefinition: {
      id: 'content-patcher' as const,
      pluginKind: 'content-patcher' as const,
      capabilities: ['edit', 'save', 'export', 'validate'] as WorkspacePluginCapability[],
      futureScopes: ['wizard'],
      displayName: { 'zh-CN': 'Content Patcher', 'en-US': 'Content Patcher' },
      description: { 'zh-CN': '测试插件', 'en-US': 'Test plugin' },
      getDisplayName: () => 'Content Patcher',
      getDescription: () => 'Test plugin',
    },
    projectDetail: {
      pluginKind: 'content-patcher' as const,
      capabilities: ['edit', 'save', 'export', 'validate'],
      summary: {
        id: 'seasonal-garden',
        name: 'Seasonal Garden',
        author: 'Aly',
        version: '1.2.0',
        description: 'A patch-heavy content pack',
        uniqueId: 'Aly.SeasonalGarden',
        contentPackFor: 'Pathoschild.ContentPatcher',
        folderName: 'SeasonalGarden',
        pluginKind: 'content-patcher' as const,
        absolutePath: 'E:\\Mods\\SeasonalGarden',
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
        status: 'ready' as const,
        missingRequiredDependencies: [],
      },
      diagnostics: [],
      contentPatcher: {
        manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
        contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
        manifestJson: '{\n  "Name": "Seasonal Garden"\n}\n',
        contentJson: '{\n  "Changes": []\n}\n',
        format: '2.0.0',
        changeCount: 1,
        includeCount: 0,
        dynamicTokenCount: 0,
        configKeys: [],
        hasI18n: false,
        i18nFiles: [],
        patches: [],
      },
    },
    diagnostics: [],
    statusMessage: 'ready',
    lastSaveResult: null,
    gameRootPath: 'E:\\Games\\Stardew Valley',
    manifestEditor: {
      text: '{\n  "Name": "Seasonal Garden"\n}\n',
      value: { Name: 'Seasonal Garden' },
      error: null,
    },
    contentEditor: {
      text: '{\n  "Format": "2.0.0",\n  "Changes": []\n}\n',
      value: { Format: '2.0.0', Changes: [] },
      error: null,
    },
    contentSummary: {
      format: '2.0.0',
      changeCount: 1,
      includeCount: 0,
      dynamicTokenCount: 0,
      configKeys: [],
      patches: [],
    },
    selectedPatchId: null,
    selectedPatch: null,
    patchWhenError: null,
    hasUnsavedChanges: false,
    canPersist: true,
    contentPatcherSnapshot: {
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
    },
    contentPatcherSimulation: {
      plan: {
        patches: [
          {
            id: 'content.json:0#target:0#from:0',
            sourcePath: 'content.json',
            logName: 'Price patch',
            action: 'EditData',
            target: 'Data/Objects',
            fromFile: null,
            when: {},
            priority: 0,
            update: [],
          },
        ],
      },
      targets: [
        {
          path: 'Data/Objects',
          assetKind: 'json',
          touchedPatchCount: 1,
          resultState: 'determinate',
          patchIds: ['content.json:0#target:0#from:0'],
        },
      ],
      patchStatuses: [{ patchId: 'content.json:0#target:0#from:0', status: 'applied', reasons: [] }],
      diagnostics: [],
      dynamicTokens: {},
    },
    contentPatcherResultAsset: {
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
    },
    contentPatcherResultLoading: false,
    contentPatcherResultError: null,
    simulationContext: createDefaultContentPatcherSimulationContext(),
    scaleUpEditor: null,
    onScaleUpContentChange: vi.fn(),
    onCloseScaleUpEditor: vi.fn(),
    navigatorMode: 'targets',
    selectedTargetPath: 'Data/Objects',
    onNavigatorModeChange: vi.fn(),
    onSimulationContextChange: vi.fn(),
    onSelectPatch: vi.fn(),
    onSelectTarget: vi.fn(),
    onManifestFieldChange: vi.fn(),
    onManifestTextChange: vi.fn(),
    onContentTextChange: vi.fn(),
    onPatchFieldChange: vi.fn(),
    onPatchWhenChange: vi.fn(),
    onAddPatch: vi.fn(),
    onRemoveSelectedPatch: vi.fn(),
    onSaveProject: vi.fn(),
    onExportProject: vi.fn(),
  } as ComponentProps<typeof ContentPatcherWorkspace>
}

describe('ContentPatcherWorkspace', () => {
  it('shows an empty state when no project detail is available', () => {
    const props = buildProps()
    renderWithLocale(<ContentPatcherWorkspace {...props} projectDetail={null} />)
    expect(screen.getByText(copy.noProject)).toBeTruthy()
  })

  it('renders the debugger layout for the selected target', async () => {
    const { container } = renderWithLocale(<ContentPatcherWorkspace {...buildProps()} />)
    const workspaceShell = container.querySelector('.cp-debugger-shell')

    expect(workspaceShell).toBeTruthy()
    expect(workspaceShell?.className).toContain('h-full')
    expect(workspaceShell?.querySelector('.cp-debugger-header')).toBeTruthy()
    expect(workspaceShell?.querySelector('.cp-debugger-body')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('Target: Data/Objects')).toBeTruthy()
    })
    expect(workspaceShell?.querySelector('.cp-debugger-preview')).toBeTruthy()
  })

  it('does not render target navigation cards inside the center workspace', () => {
    const props = buildProps()
    const simulation = props.contentPatcherSimulation!
    props.contentPatcherSimulation = {
      ...simulation,
      targets: [
        {
          path: 'Data/Objects',
          assetKind: 'json',
          touchedPatchCount: 1,
          resultState: 'determinate',
          patchIds: ['content.json:0#target:0#from:0'],
        },
        {
          path: 'TileSheets/crops',
          assetKind: 'image',
          touchedPatchCount: 2,
          resultState: 'determinate',
          patchIds: ['content.json:1#target:0#from:0'],
        },
        {
          path: 'Maps/Town',
          assetKind: 'map',
          touchedPatchCount: 1,
          resultState: 'indeterminate',
          patchIds: ['content.json:2#target:0#from:0'],
        },
      ],
    }

    renderWithLocale(<ContentPatcherWorkspace {...props} />)

    expect(screen.queryByText('JSON Targets')).toBeNull()
    expect(screen.queryByText('Image Targets')).toBeNull()
    expect(screen.queryByText('Map Targets')).toBeNull()
    expect(screen.queryByText('TileSheets/crops')).toBeNull()
  })

  it('updates simulation context from the image-toolbar popup', async () => {
    const props = buildProps()
    props.contentSummary = {
      ...props.contentSummary,
      configKeys: ['Variant'],
      configEntries: [{ key: 'Variant', defaultValue: 'festive' }],
    }
    props.onSimulationContextChange = vi.fn()
    props.contentPatcherResultAsset = {
      target: {
        path: 'TileSheets/crops',
        assetKind: 'image',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
      trace: [],
      result: {
        kind: 'image',
        json: null,
        imageDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC',
        originalImageDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AAAAAAAABQABZHiVOAAAAABJRU5ErkJggg==',
        originalImageSource: 'Game content -> Content/TileSheets/crops.png',
        mapDebug: null,
      },
      diagnostics: [],
      exportable: true,
    }

    renderWithLocale(<ContentPatcherWorkspace {...props} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Simulation Context' }))
    const input = await screen.findByLabelText('Config Variant')
    fireEvent.change(input, { target: { value: 'harvest' } })

    expect(props.onSimulationContextChange).toHaveBeenCalledWith({
      ...props.simulationContext,
      config: {
        Variant: 'harvest',
      },
    })
  })

  it('keeps simulation controls in the center workspace', async () => {
    const { container } = renderWithLocale(<ContentPatcherWorkspace {...buildProps()} />)

    await waitFor(() => {
      expect(container.querySelector('.cp-debugger-preview')).toBeTruthy()
    })
  })

  it('renders a dedicated scroll wrapper for the navigator list', async () => {
    const { container } = renderWithLocale(<ContentPatcherWorkspace {...buildProps()} />)

    await waitFor(() => {
      expect(container.querySelector('.cp-debugger-nav')).toBeNull()
      expect(container.querySelector('.cp-debugger-nav-scroll')).toBeNull()
    })
  })

  it('renders the built-in ScaleUp panel for the active image target', async () => {
    const props = buildProps()
    props.selectedTargetPath = 'Characters/Lewis'
    props.scaleUpEditor = {
      targetPath: 'Characters/Lewis',
      focusSection: 'preview',
    }
    props.contentPatcherResultAsset = {
      target: {
        path: 'Characters/Lewis',
        assetKind: 'image',
        touchedPatchCount: 1,
        resultState: 'determinate',
        patchIds: ['content.json:0#target:0#from:0'],
      },
      trace: [],
      result: {
        kind: 'image',
        json: null,
        imageDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC',
        originalImageDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AAAAAAAABQABZHiVOAAAAABJRU5ErkJggg==',
        originalImageSource: 'Game content -> Content/Characters/Lewis.png',
        mapDebug: null,
      },
      diagnostics: [],
      exportable: true,
    }

    renderWithLocale(<ContentPatcherWorkspace {...props} />)

    expect(await screen.findByText('ScaleUp')).toBeTruthy()
    expect(screen.getByText('Headshot Preview')).toBeTruthy()
  })
})
