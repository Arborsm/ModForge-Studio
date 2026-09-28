/** Resource kinds exposed by the reusable workbench resource browser. */
export type ResourceBrowserKindKey = 'actor' | 'item' | 'location' | 'music' | 'sound' | 'texture' | 'map' | 'building'

export type ResourceBrowserCopy = {
  picker: {
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
    audioPlay: string
    audioPause: string
    audioLoading: string
  }
  lab: {
    introTitle: string
    introDesc: string
    statusLoaded: string
    statusLoading: string
    statusFallback: string
    statusPartial: string
    kinds: Record<ResourceBrowserKindKey, { title: string; description: string; placeholder: string }>
    audioCombined: { title: string; description: string; placeholder: string }
  }
}
