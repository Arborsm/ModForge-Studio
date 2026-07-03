export type LauncherUpdatesCopy = {
  title: string
  subtitle: string
  empty: string
  selectionSummary: (selected: number, total: number) => string
  availableCount: (count: number) => string
  toggleSelection: (allSelected: boolean) => string
  recheck: string
  updateSelected: string
  updateOne: string
  expandDetails: string
  viewChangelog: string
  fetchDetails: string
  fetchChangelog: string
  openHomepage: string
  openComments: string
  overviewTitle: string
  releaseLabel: string
  sizeLabel: string
  detailsLoading: string
  detailsEmpty: string
  changelogTitle: (version: string | null) => string
  changelogLoading: string
  changelogEmpty: string
  fetchDetailNotice: string
  fetchChangelogNotice: string
  releaseUnknown: string
  sizeUnknown: string
  checkingProgressTitle: string
  checkingProgressDetail: (checked: number, total: number, currentModName: string | null) => string
  checkFailedTitle: string
  checkFailedDetail: string
  issueLabel: string
  diagnosticsAction: string
  detailsExpandAction: string
  detailsCollapseAction: string
  copyLogsAction: string
  blockedTitle: string
  blockedDetail: string
}
