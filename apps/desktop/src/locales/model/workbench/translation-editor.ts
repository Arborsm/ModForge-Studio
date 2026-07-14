export type TranslationEditorCopy = {
  workspaceLabel: string
  workspaceSubtitle: string
  noProject: string
  noI18n: string
  noMatchingEntries: string
  projectLabel: string
  fileLabel: string
  sourceLabel: string
  targetLabel: string
  sourceLocaleLabel: string
  targetLocaleLabel: string
  defaultLocaleLabel: string
  searchPlaceholder: string
  allStatus: string
  translatedStatus: string
  missingStatus: string
  errorStatus: string
  saveTranslations: string
  reloadTranslations: string
  addLocale: string
  newLocalePrompt: string
  progressLabel: string
  entriesLabel: (count: number) => string
  missingTokens: (tokens: string) => string
  invalidJson: string
  shortcutSaveAndNext: string
  shortcutSaveAndPrevious: string
  shortcutHint: string
  aiTranslate: string
  aiTranslateCurrent: string
  aiTranslateMissing: string
  aiTranslateAll: string
  aiTranslateAllConfirm: string
  aiTranslating: (completed: number, total: number) => string
  aiCancel: string
  aiNotConfigured: string
  aiFailed: string
  aiPartialFailed: (count: number) => string
  browserTitle: string
  browserSearchPlaceholder: string
  browserRefreshProjects: string
  browserEmptyTitle: string
  browserEmptyDescription: string
  browserProjectsCount: (count: number) => string
  browserSelectedLabel: string
  browserProjectMeta: (author: string | null, version: string | null, uniqueId: string | null) => string
}
