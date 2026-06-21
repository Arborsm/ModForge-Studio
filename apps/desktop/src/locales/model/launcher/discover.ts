export type LauncherDiscoverCopy = {
  title: string
  subtitle: string
  empty: string
  emptyTitle: string
  emptyDetail: string
  emptyClearFiltersAction: string
  credentialsHint: string
  loadingResults: string
  loadingPage: (page: number) => string
  loadingCover: string
  updateAvailable: string
  fallbackCategory: string
  blockedTitle: string
  blockedDetail: string
  blockedIssueLabel: string
  blockedRetryAction: string
  blockedDiagnosticsAction: string
  blockedDetailsExpandAction: string
  blockedDetailsCollapseAction: string
  blockedCopyLogsAction: string
  errorTitle: string
  errorDetail: string
  consoleTitle: string
  resultRange: (start: number, end: number, total: string) => string
  searchPlaceholder: string
  searchAction: string
  showFilters: string
  hideFilters: string
  timeRangeLabel: string
  timeRangeOptions: Record<'all' | 'day' | 'week' | 'month' | 'year', string>
  sortLabel: string
  sortOptions: Record<'newest' | 'updated' | 'trending' | 'downloads' | 'endorsements' | 'name', string>
  ascendingShort: string
  descendingShort: string
  pageSizeLabel: string
  pageSizeOption: (count: number) => string
  gridViewLabel: string
  categorySection: string
  categoryLabels: Record<string, string>
  tagsSection: string
  tagsIncludeLabel: string
  tagsExcludeLabel: string
  tagsIncludePlaceholder: string
  tagsExcludePlaceholder: string
  tagsIncludeSuggestionsLabel: string
  tagsExcludeSuggestionsLabel: string
  searchParametersSection: string
  titleContainsLabel: string
  descriptionContainsLabel: string
  authorContainsLabel: string
  uploaderContainsLabel: string
  titleSearchPlaceholder: string
  descriptionSearchPlaceholder: string
  authorSearchPlaceholder: string
  uploaderSearchPlaceholder: string
  languageSection: string
  languageLabels: Record<string, string>
  anyLabel: string
  limitsSection: string
  includeAdultContent: string
  fileSizeLabel: string
  downloadsLabel: string
  endorsementsLabel: string
  advancedAction: string
  rangePresetLabels: Record<'any' | 'lt10kb' | '10to100kb' | 'gt100kb' | '10kPlus' | '100kPlus' | '500kPlus' | '1kPlus' | '5kPlus', string>
  rangePresetsLabel: (label: string) => string
  noMinimumPlaceholder: string
  noMaximumPlaceholder: string
  loadingResultsLabel: string
  previousPage: string
  nextPage: string
  pageLabel: (page: number) => string
  jumpToPage: string
  pageUnit: string
}
