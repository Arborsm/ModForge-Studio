export type EventStageCopy = {
  empty: string
  scene: string
  sceneIdle: string
  stageWaiting: string
  stageMissing: string
  stageFailed: string
  play: string
  pause: string
  step: string
  reset: string
  branch: string
  choose: string
  toggleGrid: string
  showPathsLayer: string
  configurePlayerAppearance: string
  statusMusic: string
  statusSound: string
  statusAmbient: string
  statusFade: string
  stageMapUnsupported: string
  musicStopped: string
  stopCurrentEventMusic: string
  stopTrackedSound: string
  fadeCleared: string
  screenFadeToBlack: string
  globalFadeToBlack: string
  globalFadeCleared: string
  clear: string
  cueLabel: (cue: string) => string
  stopCueLabel: (cue: string) => string
  flashAlphaLabel: (alpha: string) => string
  resourcePicker: {
    close: string
    searchLabel: string
    categorySearchPlaceholder: string
    allCategory: string
    allResources: string
    visibleCount: (count: number) => string
    summary: (visible: number, total: number, selected: string) => string
    customSubtitle: string
    selectedLabel: (label: string) => string
    cancel: string
    confirm: string
    gridView: string
    listView: string
    filtersAll: string
    filtersGame: string
    filtersProject: string
    filtersCatalog: string
    filterLabels: Record<'all' | 'game' | 'project' | 'catalog', string>
    pageRange: (start: number, end: number, total: number) => string
    pageInfo: (page: number, pageCount: number) => string
    pageSizeLabel: string
    pageSizeOption: (size: number) => string
    detailAction: string
    detailsTitle: string
    detailsGeneral: string
    detailsVisual: string
    detailsSource: string
    fieldName: string
    fieldValue: string
    fieldDisplayName: string
    fieldInternalName: string
    fieldType: string
    fieldCategory: string
    fieldPrice: string
    fieldDescription: string
    fieldTexture: string
    fieldSpriteIndex: string
    fieldSourcePath: string
    fieldMeta: string
    fieldSubtitle: string
    none: string
  }
}
