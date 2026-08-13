export type TextOperationPreset = {
  id: string
  labelKey: string
  target: string
  presets: Array<{ value: string; labelKey: string }>
}

export const TEXT_OPERATION_PRESETS: readonly TextOperationPreset[] = [
  {
    id: 'light',
    labelKey: 'light',
    target: 'MapProperties,Light',
    presets: [
      { value: '5 7 4 16 10 4', labelKey: 'lightEntrance' },
      { value: '31 94 4', labelKey: 'lightSingle' },
      { value: '38 56 4 47 57 4', labelKey: 'lightRoad' },
    ],
  },
  {
    id: 'warp',
    labelKey: 'warp',
    target: 'MapProperties,Warp',
    presets: [
      { value: '31 6 Forest 96 57', labelKey: 'warpForest' },
      { value: '12 9 Farm {{SpousePatioExit}}', labelKey: 'warpFarm' },
      { value: '21 22 Town 56 21', labelKey: 'warpTown' },
    ],
  },
  {
    id: 'npcWarp',
    labelKey: 'npcWarp',
    target: 'MapProperties,NPCWarp',
    presets: [
      { value: '10 22 {{ModId}}_SecretOrchard 20 19', labelKey: 'npcWarpOrchard' },
      { value: '12 8 BusStop 10 23', labelKey: 'npcWarpBus' },
    ],
  },
  {
    id: 'dayTiles',
    labelKey: 'dayTiles',
    target: 'MapProperties,DayTiles',
    presets: [
      { value: 'AlwaysFront 15 10 507', labelKey: 'dayTilesEntrance' },
      { value: 'Buildings 22 14 336', labelKey: 'dayTilesBuilding' },
    ],
  },
  {
    id: 'nightTiles',
    labelKey: 'nightTiles',
    target: 'MapProperties,NightTiles',
    presets: [
      { value: 'AlwaysFront 15 10 908', labelKey: 'nightTilesEntrance' },
      { value: 'Buildings 22 14 337', labelKey: 'nightTilesBuilding' },
    ],
  },
  {
    id: 'doors',
    labelKey: 'doors',
    target: 'MapProperties,Doors',
    presets: [
      { value: '18 7 {{ModId}}_TownGarden', labelKey: 'doorsGarden' },
      { value: '24 15 {{ModId}}_SecretOrchard', labelKey: 'doorsOrchard' },
    ],
  },
  {
    id: 'sounds',
    labelKey: 'sounds',
    target: 'MapProperties,BrookSounds',
    presets: [
      { value: '11 9', labelKey: 'soundsEntrance' },
      { value: '24 15', labelKey: 'soundsWarp' },
    ],
  },
]
