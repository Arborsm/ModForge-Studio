import type { ModI18nWorkspaceCopy } from '../../../model/workbench'

const modi18n: ModI18nWorkspaceCopy = {
  workspaceLabel: 'Translations',
  workspaceSubtitle: 'Project i18n workspace',
  noProject: 'Select a Content Patcher project to edit its i18n files.',
  noI18n: 'This project has no i18n files yet.',
  projectLabel: 'Project',
  fileLabel: 'Locale file',
  sourceLabel: 'Source',
  targetLabel: 'Target',
  searchPlaceholder: 'Search keys, source text, or translated text',
  allStatus: 'All Status',
  translatedStatus: 'Translated',
  missingStatus: 'Missing',
  emptyStatus: 'Empty',
  errorStatus: 'Needs Fix',
  saveTranslations: 'Save Translations',
  addLocale: 'Add Locale',
  newLocalePrompt: 'Locale code, for example zh-CN',
  progressLabel: 'Translation Progress',
  entriesLabel: (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`,
  missingTokens: (tokens) => `Missing placeholders: ${tokens}`,
  invalidJson: 'This i18n file is not valid JSON.',
}

export default modi18n
