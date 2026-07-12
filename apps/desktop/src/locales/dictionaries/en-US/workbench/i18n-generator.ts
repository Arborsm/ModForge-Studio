import type { I18nGeneratorCopy } from '../../../model/workbench/i18n-generator'

const tools: I18nGeneratorCopy = {
  generatorTitle: 'i18n Generator',
  importAction: 'Import patch',
  importProjectAction: 'Import project',
  prefixLabel: 'Root prefix',
  prefixPlaceholder: 'Author.ModName',
  toggleTargetPrefix: (target) => `Toggle prefix for ${target}`,
  extractedCount: (count) => `${count} items`,
  projectSessionMeta: (files, items) => `${files} files · ${items} items`,
  closeAction: 'Close',
  emptyTitle: 'Import Content Patcher JSON',
  emptyDescription:
    'Import a single patch or a full project. Configure target group prefixes on the left; project mode groups extractions by source file.',
  errorTitle: 'Could not generate i18n files',
  keyColumn: 'Generated key',
  sourceColumn: 'Source text',
  targetColumn: 'Target',
  exportI18n: 'default.json',
  exportPatch: 'Patch',
  exportProject: 'ZIP',
  fileTransformed: 'Transformed',
  fileNeedsReview: 'Needs review',
  fileMergeTarget: 'Merge target',
  mergeTargetHint: 'Generated translations merge into this file and ship with the ZIP export.',
  extractionCountLabel: (count) => String(count),
}

export default tools
