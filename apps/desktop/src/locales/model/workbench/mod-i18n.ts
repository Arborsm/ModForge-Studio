export type ModI18nWorkspaceCopy = {
  workspaceLabel: string
  workspaceSubtitle: string
  noProject: string
  noI18n: string
  projectLabel: string
  fileLabel: string
  sourceLabel: string
  targetLabel: string
  searchPlaceholder: string
  allStatus: string
  translatedStatus: string
  missingStatus: string
  emptyStatus: string
  errorStatus: string
  saveTranslations: string
  addLocale: string
  newLocalePrompt: string
  progressLabel: string
  entriesLabel: (count: number) => string
  missingTokens: (tokens: string) => string
  invalidJson: string
}
