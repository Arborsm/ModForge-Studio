import { describe, expect, it } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { BuildingPrimaryPreview } from '@pages/workbench/workspaces/building/view/BuildingPrimaryPreview'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '@pages/workbench/workspaces/building/entities/building'
import type { ViewportLabels } from '@locales/api'

function createBuilding(): BuildingWorkspaceEntry {
  return {
    key: 'barn',
    sourceKind: 'constructible',
    displayName: 'Barn',
    internalName: 'Barn',
    searchText: 'barn',
    textureAssetName: 'Buildings/Barn',
    texturePathLabel: 'Buildings\\Barn',
    sourceRect: null,
    size: { X: 4, Y: 3 },
    skins: [],
    buildMaterials: [],
    buildCost: 0,
    buildDays: 0,
    builderLabel: null,
    hasIndoorMap: false,
    worldEntrances: [],
    indoorMapAssetName: null,
    indoorMapPathLabel: '',
    indoorMapType: null,
    exteriorMapAssetName: null,
    exteriorMapPathLabel: null,
    exteriorMapName: null,
    exteriorEntryTile: null,
    maxOccupants: 0,
    validOccupantTypes: [],
    allowAnimalPregnancy: false,
    indoorItemMoves: [],
    indoorItems: [],
    addMailOnBuild: [],
    metadata: {},
    modData: {},
    hayCapacity: 0,
    chests: [],
    defaultAction: null,
    additionalTilePropertyRadius: 0,
    allowsFlooringUnderneath: false,
    actionTiles: [],
    tileProperties: [],
    itemConversions: [],
    drawLayers: [],
    customFields: {},
    upgradeChainKeys: ['barn'],
    stageIndex: 0,
    stageCount: 1,
    upgradeToKeys: [],
    magicalConstruction: false,
    buildMenuDrawOffset: null,
    humanDoor: null,
    animalDoor: null,
    animalDoorOpenDuration: null,
    animalDoorCloseSound: null,
    animalDoorCloseDuration: null,
    animalDoorOpenSound: null,
    nonInstancedIndoorLocation: null,
  } as unknown as BuildingWorkspaceEntry
}

describe('BuildingPrimaryPreview loading skeleton', () => {
  it('renders a skeleton overlay while the building texture is loading', () => {
    const activeTextureState: BuildingTextureAssetState = {
      loading: true,
      path: null,
      url: null,
      width: null,
      height: null,
    }

    const { container } = renderWithLocale(
      <BuildingPrimaryPreview
        building={createBuilding()}
        activeTextureState={activeTextureState}
        activeExteriorMapDocument={null}
        activeExteriorMapMessage="No exterior map"
        activeExteriorFocusPoint={null}
        activeExteriorMapPath={null}
        locale="en-US"
        viewportLabels={{ zoomLabel: (zoom) => `${zoom}x` } as ViewportLabels}
        theme="dark"
        accentColor="#3b82f6"
        showGrid={false}
        exteriorVisibleLayerIds={[]}
        exteriorVisibleObjectGroupIds={[]}
      />,
    )

    expect(container.querySelector('.building-primary-skeleton')).toBeTruthy()
    expect(container.querySelector('.image-skeleton')).toBeTruthy()
  })
})
