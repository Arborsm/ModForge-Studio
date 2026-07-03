import type { ModI18nWorkspaceCopy } from '../../../model/workbench'

const modi18n: ModI18nWorkspaceCopy = {
  workspaceLabel: '翻译',
  workspaceSubtitle: '项目 i18n 工作区',
  noProject: '选择一个 Content Patcher 项目后编辑它的 i18n 文件。',
  noI18n: '这个项目还没有 i18n 文件。',
  projectLabel: '项目',
  fileLabel: '语言文件',
  sourceLabel: '源文案',
  targetLabel: '目标翻译',
  searchPlaceholder: '搜索键名、源文案或译文',
  allStatus: '全部状态',
  translatedStatus: '已翻译',
  missingStatus: '缺失',
  emptyStatus: '空值',
  errorStatus: '需修复',
  saveTranslations: '保存翻译',
  addLocale: '新增语言',
  newLocalePrompt: '语言代码，例如 zh-CN',
  progressLabel: '翻译进度',
  entriesLabel: (count) => `${count} 条文案`,
  missingTokens: (tokens) => `缺少占位符：${tokens}`,
  invalidJson: '这个 i18n 文件不是有效 JSON。',
}

export default modi18n
