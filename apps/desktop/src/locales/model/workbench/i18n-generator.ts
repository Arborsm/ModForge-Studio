export type I18nGeneratorCopy = {
  generatorTitle: string
  importAction: string
  importProjectAction: string
  prefixLabel: string
  prefixPlaceholder: string
  toggleTargetPrefix: (target: string) => string
  extractedCount: (count: number) => string
  projectSessionMeta: (files: number, items: number) => string
  closeAction: string
  emptyTitle: string
  emptyDescription: string
  errorTitle: string
  keyColumn: string
  sourceColumn: string
  targetColumn: string
  exportI18n: string
  exportPatch: string
  exportProject: string
  fileTransformed: string
  fileNeedsReview: string
  fileMergeTarget: string
  mergeTargetHint: string
  extractionCountLabel: (count: number) => string
}
