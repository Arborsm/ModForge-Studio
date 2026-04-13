import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../editor-shell'
import { getModWorkspaceCopy } from '../editor-shell'
import { renderWithLocale } from '../../test/renderWithLocale'
import type { BuildingTextureAssetState } from './buildingWorkspace'
import type { CharacterVisualAssetState } from './characterWorkspace'
import { buildWorkspacePanels } from './workspacePanels'
import { buildCoreWorkspacePanels } from './workspacePanels/core'
import { buildItemsWorkspacePanels } from './workspacePanels/items'
import { buildModsWorkspacePanels } from './workspacePanels/mods'

type BuildOptions = Parameters<typeof buildWorkspacePanels>[0]

const noop = vi.fn()
const copy = editorCopy['en-US']
const modWorkspaceCopy = getModWorkspaceCopy('en-US')

function buildOptions(overrides: Partial<BuildOptions> = {}): BuildOptions {
  return {
    copy,
    locale: 'en-US',
    workspaceMode: 'map',
    directoryInfo: null,
    mapAssets: [],
    filteredAssets: [],
    mapBrowserSourceMode: 'original',
    onMapBrowserSourceModeChange: noop,
    modMapGroups: [],
    activeModMapSelectionId: null,
    activeMapModSources: [],
    activeMapId: null,
    assetFilter: '',
    onAssetFilterChange: noop,
    onOpenAsset: noop,
    onOpenModAsset: noop,
    workspaceTabs: [],
    activeTabId: '',
    onSelectWorkspaceTab: noop,
    onCloseWorkspaceTab: noop,
    onReorderWorkspaceTabs: noop,
    mapDocument: null,
    worldAtlasViews: [],
    activeWorldAtlasViewId: null,
    onSelectWorldAtlasView: noop,
    onOpenAtlasTarget: noop,
    theme: 'dark',
    accentColor: '#000000',
    visibleLayerIds: [],
    onToggleLayer: noop,
    onShowAllLayers: noop,
    onHideAllLayers: noop,
    visibleObjectGroupIds: [],
    onToggleObjectGroup: noop,
    onShowAllObjectGroups: noop,
    onHideAllObjectGroups: noop,
    focusedObjectTarget: null,
    showGameWorldAdditions: false,
    onToggleGameWorldAdditions: noop,
    worldOverlaySprites: [],
    worldOverlayTextureAssets: {},
    onFocusObject: noop,
    onHoverChange: noop,
    workspaceStatus: {
      tone: 'idle',
      message: '',
    },
    moduleBlueprint: undefined,
    eventAssets: [],
    filteredEventAssets: [],
    eventBrowserSourceMode: 'original',
    onEventBrowserSourceModeChange: noop,
    modEventGroups: [],
    activeModEventSelectionId: null,
    activeEventModSources: [],
    activeEventAssetId: null,
    eventAssetFilter: '',
    onEventAssetFilterChange: noop,
    onOpenEventAsset: noop,
    onOpenModEventAsset: noop,
    parsedEventAsset: null,
    selectedEventKey: null,
    selectedEvent: null,
    selectedTimelineEntryId: '',
    timelineJumpRequestId: null,
    currentEventCommandId: null,
    eventStatusMessage: '',
    onSelectEvent: noop,
    onSelectTimelineEntry: noop,
    onActivateTimelineEntry: noop,
    onTimelineJumpHandled: noop,
    onPlaybackCommandChange: noop,
    activePlayerAppearanceProfile: null,
    onOpenPlayerAppearanceWindow: noop,
    characters: [],
    filteredCharacters: [],
    characterBrowserSourceMode: 'original',
    onCharacterBrowserSourceModeChange: noop,
    modCharacterGroups: [],
    activeModCharacterSelectionId: null,
    activeCharacterModSources: [],
    activeCharacterId: null,
    activeCharacter: null,
    activeCharacterVariant: null,
    characterFilter: '',
    characterStatusMessage: '',
    activeCharacterAssetState: {} as CharacterVisualAssetState,
    onCharacterFilterChange: noop,
    onSelectCharacter: noop,
    onSelectModCharacter: noop,
    onSelectCharacterVariant: noop,
    constructibleGroups: [],
    filteredConstructibleGroups: [],
    worldBuildings: [],
    filteredWorldBuildings: [],
    buildingBrowserSourceMode: 'original',
    onBuildingBrowserSourceModeChange: noop,
    modBuildingGroups: [],
    activeModBuildingSelectionId: null,
    activeBuildingModSources: [],
    activeBuildingId: null,
    activeBuilding: null,
    activeUpgradeChain: [],
    buildingFilter: '',
    buildingStatusMessage: '',
    activeBuildingTextureState: null,
    activeBuildingChainTextureStates: {},
    activeBuildingIndoorMapDocument: null,
    activeBuildingIndoorMapPath: null,
    activeBuildingIndoorMapMessage: '',
    activeBuildingExteriorMapDocument: null,
    activeBuildingExteriorMapPath: null,
    activeBuildingExteriorMapMessage: '',
    activeBuildingExteriorFocusPoint: null,
    buildingSpringObjectsState: {} as BuildingTextureAssetState,
    onBuildingFilterChange: noop,
    onSelectBuilding: noop,
    onSelectModBuilding: noop,
    items: [],
    filteredItems: [],
    itemBrowserSourceMode: 'original',
    onItemBrowserSourceModeChange: noop,
    modItemGroups: [],
    activeModItemSelectionId: null,
    activeItemModSources: [],
    activeItemId: null,
    activeItem: null,
    itemLookup: new Map(),
    itemFilter: '',
    itemStatusMessage: '',
    itemTextureStatesByAssetName: {},
    ensureItemTextureAssetStates: noop,
    onItemFilterChange: noop,
    onSelectItem: noop,
    onSelectModItem: noop,
    modWorkspaceCopy,
    modPluginDefinition: null,
    modProjects: [],
    filteredModProjects: [],
    activeProjectPath: null,
    activeProject: null,
    modFilter: '',
    contentPatcherOnly: true,
    compatibleOnly: true,
    onModFilterChange: noop,
    onContentPatcherOnlyChange: noop,
    onCompatibleOnlyChange: noop,
    onSelectModProject: noop,
    onImportModProject: noop,
    onRefreshModProjects: noop,
    activeModProjectDetail: null,
    modManifestEditor: {
      text: '',
      value: null,
      error: null,
    },
    modContentEditor: {
      text: '',
      value: null,
      error: null,
    },
    modContentSummary: {
      format: null,
      changeCount: 0,
      includeCount: 0,
      dynamicTokenCount: 0,
      configKeys: [],
      patches: [],
    },
    modDiagnostics: [],
    activeModPatchId: null,
    onSelectModPatch: noop,
    activeModPatch: null,
    modPatchWhenError: null,
    modHasUnsavedChanges: false,
    modCanPersist: false,
    modStatusMessage: '',
    modLastSaveResult: null,
    contentPatcherSnapshot: null,
    contentPatcherSimulation: null,
    contentPatcherResultAsset: null,
    contentPatcherResultLoading: false,
    contentPatcherResultError: null,
    simulationContext: {
      season: '',
      weather: '',
      relationship: '',
      config: {},
      installedMods: [],
      customTokens: {},
    },
    onModManifestFieldChange: noop,
    onModManifestTextChange: noop,
    onModContentTextChange: noop,
    onAddModPatch: noop,
    onRemoveModPatch: noop,
    onModPatchFieldChange: noop,
    onModPatchWhenChange: noop,
    onSaveModProject: noop,
    onExportModProject: noop,
    onSimulationContextChange: noop,
    navigatorMode: 'patches',
    selectedTargetPath: null,
    onNavigatorModeChange: noop,
    onSelectTarget: noop,
    heavyWorkspaceReady: true,
    ...overrides,
  }
}

function dockMap(panels: ReturnType<typeof buildWorkspacePanels>) {
  return Object.fromEntries(panels.map((panel) => [panel.id, panel.defaultDock]))
}

function expectPanelLayout(
  panels: ReturnType<typeof buildWorkspacePanels>,
  expectedIds: string[],
  expectedDocks: Record<string, string | undefined>,
) {
  expect(panels.map((panel) => panel.id)).toEqual(expectedIds)
  const docks = dockMap(panels)
  for (const [panelId, dock] of Object.entries(expectedDocks)) {
    expect(docks[panelId]).toBe(dock)
  }
}

describe('workspacePanels mode builders', () => {
  it('builds map panels via the core builder', () => {
    const panels = buildCoreWorkspacePanels(buildOptions({ workspaceMode: 'map' }))
    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'object-groups', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'right-bottom',
      'object-groups': 'right-bottom',
      diagnostics: 'bottom-right',
    })
  })

  it('builds event panels via the core builder', () => {
    const panels = buildCoreWorkspacePanels(buildOptions({ workspaceMode: 'events' }))
    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'right-bottom',
      diagnostics: 'left-bottom',
    })
  })

  it('builds character panels via the core builder', () => {
    const panels = buildCoreWorkspacePanels(buildOptions({ workspaceMode: 'characters' }))
    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'left-bottom',
      diagnostics: 'right-bottom',
    })
  })

  it('builds building panels via the core builder', () => {
    const panels = buildCoreWorkspacePanels(buildOptions({ workspaceMode: 'buildings' }))
    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'right-bottom',
      diagnostics: 'right-bottom',
    })
  })

  it('builds item panels via the items builder', () => {
    const panels = buildItemsWorkspacePanels(buildOptions({ workspaceMode: 'items' }))
    expectPanelLayout(panels, ['item-navigation', 'item-catalog', 'item-details'], {
      'item-navigation': 'left-top',
      'item-catalog': 'center',
      'item-details': 'right-top',
    })
  })

  it('uses the locale bundle title for the items navigation panel', () => {
    const zhCopy = editorCopy['zh-CN']
    const panels = buildItemsWorkspacePanels(buildOptions({ workspaceMode: 'items', copy: zhCopy, locale: 'zh-CN' }))

    expect(panels[0]?.title).toBe((zhCopy.itemsPanel as Record<string, unknown>).filtersTitle)
  })

  it('builds mods panels via the mods builder', () => {
    const panels = buildModsWorkspacePanels(buildOptions({ workspaceMode: 'mods' }))
    expectPanelLayout(panels, ['mods-browser', 'mods-navigator', 'mods-workspace', 'mods-trace', 'mods-target-diagnostics', 'mods-export'], {
      'mods-browser': 'left-top',
      'mods-navigator': 'left-bottom',
      'mods-workspace': 'center',
      'mods-trace': 'right-top',
      'mods-target-diagnostics': 'right-bottom',
      'mods-export': 'right-bottom',
    })
  })
})

describe('buildWorkspacePanels', () => {
  it('locks panel ids and docks for map mode', () => {
    const panels = buildWorkspacePanels(buildOptions({ workspaceMode: 'map' }))

    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'object-groups', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'right-bottom',
      'object-groups': 'right-bottom',
      diagnostics: 'bottom-right',
    })
  })

  it('locks panel ids and docks for events mode', () => {
    const panels = buildWorkspacePanels(buildOptions({ workspaceMode: 'events' }))

    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'right-bottom',
      diagnostics: 'left-bottom',
    })
  })

  it('locks panel ids and docks for characters mode', () => {
    const panels = buildWorkspacePanels(buildOptions({ workspaceMode: 'characters' }))

    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'left-bottom',
      diagnostics: 'right-bottom',
    })
  })

  it('locks panel ids and docks for buildings mode', () => {
    const panels = buildWorkspacePanels(buildOptions({ workspaceMode: 'buildings' }))

    expectPanelLayout(panels, ['assets', 'viewport', 'inspector', 'layers', 'diagnostics'], {
      assets: 'left-top',
      viewport: 'center',
      inspector: 'right-top',
      layers: 'right-bottom',
      diagnostics: 'right-bottom',
    })
  })

  it('locks panel ids and docks for items mode', () => {
    const panels = buildWorkspacePanels(buildOptions({ workspaceMode: 'items' }))

    expectPanelLayout(panels, ['item-navigation', 'item-catalog', 'item-details'], {
      'item-navigation': 'left-top',
      'item-catalog': 'center',
      'item-details': 'right-top',
    })
  })

  it('locks panel ids and docks for mods mode', () => {
    const panels = buildWorkspacePanels(buildOptions({ workspaceMode: 'mods' }))

    expectPanelLayout(panels, ['mods-browser', 'mods-navigator', 'mods-workspace', 'mods-trace', 'mods-target-diagnostics', 'mods-export'], {
      'mods-browser': 'left-top',
      'mods-navigator': 'left-bottom',
      'mods-workspace': 'center',
      'mods-trace': 'right-top',
      'mods-target-diagnostics': 'right-bottom',
      'mods-export': 'right-bottom',
    })
  })

  it('does not render canvas-era content patcher inspector text in mods mode', () => {
    const panels = buildModsWorkspacePanels(
      buildOptions({
        workspaceMode: 'mods',
        activeModProjectDetail: {
          pluginKind: 'content-patcher',
          capabilities: ['edit', 'save', 'export', 'validate'],
          summary: {
            id: 'cp-pack',
            name: 'CP Pack',
            author: null,
            version: '1.0.0',
            description: null,
            uniqueId: 'ModForge.CPPack',
            contentPackFor: 'Pathoschild.ContentPatcher',
            folderName: 'CPPack',
            absolutePath: 'E:\\Mods\\CPPack',
            manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
            contentPath: 'E:\\Mods\\CPPack\\content.json',
            pluginKind: 'content-patcher',
            status: 'ready',
            missingRequiredDependencies: [],
          },
          diagnostics: [],
          contentPatcher: {
            manifestPath: 'E:\\Mods\\CPPack\\manifest.json',
            contentPath: 'E:\\Mods\\CPPack\\content.json',
            manifestJson: '{\n  "Name": "CP Pack"\n}\n',
            contentJson: '{\n  "Format": "2.0.0",\n  "Changes": []\n}\n',
            format: '2.0.0',
            changeCount: 0,
            includeCount: 0,
            dynamicTokenCount: 0,
            configKeys: [],
            hasI18n: false,
            patches: [],
          },
        },
      }),
    )

    renderWithLocale(<>{panels.map((panel) => <div key={panel.id}>{panel.content}</div>)}</>)

    expect(screen.queryByText('Node Canvas')).toBeNull()
    expect(screen.queryByText('Node Inspector')).toBeNull()
    expect(screen.queryByText('Raw Patch JSON')).toBeNull()
    expect(screen.queryByText('content.json Preview')).toBeNull()
  })
})
