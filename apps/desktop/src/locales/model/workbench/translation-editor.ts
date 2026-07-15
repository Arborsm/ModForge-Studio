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
  translationEngine: string
  generativeEngine: string
  machineTranslationEngine: string
  machineTranslationKnowledgeNotice: string
  noTranslationEngine: string
  aiTranslateCurrent: string
  aiTranslateMissing: string
  aiTranslateAll: string
  aiKnowledgeEnabled: string
  aiKnowledgeDisabled: string
  aiOfficialCorpus: string
  aiGlobalKnowledge: string
  aiProjectKnowledge: string
  memoryLearningFailed: string
  retry: string
  review: string
  reviewCurrent: string
  reviewTranslated: string
  reviewAll: string
  reviewWithAi: string
  reviewing: (completed: number, total: number) => string
  reviewCancel: string
  reviewInspector: string
  reviewEmpty: string
  reviewNotRun: string
  reviewRunningState: string
  reviewPartial: string
  reviewFailed: string
  reviewAccept: string
  reviewIgnore: string
  reviewReopen: string
  reviewAcceptSelected: string
  reviewSelectIssue: string
  reviewSuggestion: string
  reviewReason: string
  reviewStale: string
  reviewSeverity: Record<'minor' | 'major' | 'critical', string>
  reviewStatus: Record<'open' | 'ignored' | 'accepted' | 'stale', string>
  reviewLocalReasons: Record<string, string>
  reviewAfterTranslation: string
  mobileEntries: string
  mobileTranslation: string
  manageLocalizationKnowledge: string
  aiTranslateAllConfirm: string
  aiTranslating: (completed: number, total: number) => string
  aiCancel: string
  aiNotConfigured: string
  aiFailed: string
  aiPartialFailed: (count: number) => string
  aiValidationWarningTitle: string
  aiValidationWarnings: (count: number) => string
  browserTitle: string
  browserSearchPlaceholder: string
  browserRefreshProjects: string
  browserEmptyTitle: string
  browserEmptyDescription: string
  browserProjectsCount: (count: number) => string
  browserSelectedLabel: string
  browserProjectMeta: (author: string | null, version: string | null, uniqueId: string | null) => string
}
