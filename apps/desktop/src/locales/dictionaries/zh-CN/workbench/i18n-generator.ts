import type { I18nGeneratorCopy } from '../../../model/workbench/i18n-generator'

const tools: I18nGeneratorCopy = {
  generatorTitle: 'i18n 生成器',
  importAction: '导入 Patch',
  importProjectAction: '导入项目',
  prefixLabel: '总前缀',
  prefixPlaceholder: '作者.模组名',
  toggleTargetPrefix: (target) => `切换 ${target} 的分组前缀`,
  extractedCount: (count) => `${count} 项`,
  projectSessionMeta: (files, items) => `${files} 文件 · ${items} 项`,
  closeAction: '关闭',
  emptyTitle: '导入 Content Patcher JSON',
  emptyDescription: '单文件或完整项目。导入后左侧配置分组前缀；项目按源 Patch 文件查看提取结果。',
  errorTitle: '无法生成 i18n 文件',
  keyColumn: '生成的 Key',
  sourceColumn: '原文',
  targetColumn: 'Target',
  exportI18n: 'default.json',
  exportPatch: 'Patch',
  exportProject: 'ZIP',
  fileTransformed: '已改造',
  fileNeedsReview: '需检查',
  fileMergeTarget: '合并目标',
  mergeTargetHint: '生成的翻译合并进此文件；导出 ZIP 时一并写入。',
  extractionCountLabel: (count) => String(count),
}

export default tools
