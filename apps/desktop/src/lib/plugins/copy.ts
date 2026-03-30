import type { LocaleCode } from '../editor-shell'

export type ModWorkspaceCopy = {
  workspaceLabel: string
  workspaceSubtitle: string
  browserTitle: string
  browserSubtitle: string
  browserFilterPlaceholder: string
  browserEmpty: string
  projectsLabel: string
  filteredLabel: string
  unknownLabel: string
  noVersionLabel: string
  importProject: string
  refreshProjects: string
  openFolder: string
  saveProject: string
  exportProject: string
  manifestTitle: string
  manifestSubtitle: string
  patchesTitle: string
  patchesSubtitle: string
  patchWhenLabel: string
  rawJsonTitle: string
  rawJsonSubtitle: string
  inspectorTitle: string
  inspectorSubtitle: string
  diagnosticsTitle: string
  diagnosticsSubtitle: string
  noProject: string
  noPatch: string
  projectFacts: string
  capabilities: string
  futureScopes: string
  dirtyLabel: string
  cleanLabel: string
  sourcePath: string
  outputPath: string
  patchAction: string
  patchTarget: string
  patchFromFile: string
  patchLogName: string
  formatLabel: string
  patchesCountLabel: string
  configKeysLabel: string
  dynamicTokensLabel: string
  includesLabel: string
  hasI18nLabel: string
  addPatch: string
  removePatch: string
  noTargetLabel: string
  whenLabel: string
  alwaysLabel: string
  noPatchesLabel: string
  diagnosticsListTitle: string
  noDiagnosticsLabel: string
  manifestPathLabel: string
  contentPathLabel: string
  manifestName: string
  manifestAuthor: string
  manifestVersion: string
  manifestUniqueId: string
  manifestDescription: string
  manifestContentPackFor: string
  selectExportFolder: string
  selectProjectFolder: string
  importedFrom: (path: string) => string
  saveSuccess: (path: string) => string
  exportSuccess: (path: string) => string
  scanStatus: (count: number) => string
}

const zhCN: ModWorkspaceCopy = {
  workspaceLabel: '模组',
  workspaceSubtitle: '内建插件工作区',
  browserTitle: '模组浏览器',
  browserSubtitle: 'Mods 目录与手动导入',
  browserFilterPlaceholder: '按名称、作者、UniqueID 或路径筛选',
  browserEmpty: '当前没有可用的 Content Patcher 项目。',
  projectsLabel: '项目数',
  filteredLabel: '筛选后',
  unknownLabel: '未知',
  noVersionLabel: '无版本',
  importProject: '导入模组',
  refreshProjects: '刷新扫描',
  openFolder: '打开目录',
  saveProject: '保存',
  exportProject: '导出',
  manifestTitle: 'Manifest',
  manifestSubtitle: '基础元数据与 Content Pack 绑定',
  patchesTitle: 'Patches',
  patchesSubtitle: 'Changes 列表与 Patch 摘要',
  patchWhenLabel: 'When JSON',
  rawJsonTitle: '原始 JSON',
  rawJsonSubtitle: '可直接编辑 manifest.json 与 content.json',
  inspectorTitle: 'Patch 检查器',
  inspectorSubtitle: '当前选中 Patch 的结构化字段',
  diagnosticsTitle: '诊断与导出',
  diagnosticsSubtitle: '结构检查、保存状态与路径信息',
  noProject: '选择一个 Content Patcher 项目后在这里编辑。',
  noPatch: '当前没有选中的 Patch。',
  projectFacts: '项目事实',
  capabilities: '能力',
  futureScopes: '未来扩展',
  dirtyLabel: '未保存',
  cleanLabel: '已同步',
  sourcePath: '源目录',
  outputPath: '导出目录',
  patchAction: 'Action',
  patchTarget: 'Target',
  patchFromFile: 'FromFile',
  patchLogName: 'LogName',
  formatLabel: 'Format',
  patchesCountLabel: 'Patches',
  configKeysLabel: 'Config 键',
  dynamicTokensLabel: '动态 Token',
  includesLabel: 'Include',
  hasI18nLabel: 'i18n',
  addPatch: '新增 Patch',
  removePatch: '删除 Patch',
  noTargetLabel: '无 Target',
  whenLabel: 'When',
  alwaysLabel: '总是',
  noPatchesLabel: '还没有 Patch。',
  diagnosticsListTitle: '诊断',
  noDiagnosticsLabel: '暂无诊断信息。',
  manifestPathLabel: 'Manifest',
  contentPathLabel: 'Content',
  manifestName: '名称',
  manifestAuthor: '作者',
  manifestVersion: '版本',
  manifestUniqueId: 'UniqueID',
  manifestDescription: '描述',
  manifestContentPackFor: 'ContentPackFor',
  selectExportFolder: '选择导出目录',
  selectProjectFolder: '选择模组目录',
  importedFrom: (path) => `已导入: ${path}`,
  saveSuccess: (path) => `已保存到 ${path}`,
  exportSuccess: (path) => `已导出到 ${path}`,
  scanStatus: (count) => `已识别 ${count} 个模组项目。`,
}

const enUS: ModWorkspaceCopy = {
  workspaceLabel: 'Mods',
  workspaceSubtitle: 'Built-in plugin workspace',
  browserTitle: 'Mod Browser',
  browserSubtitle: 'Mods directory plus manual import',
  browserFilterPlaceholder: 'Filter by name, author, UniqueID, or path',
  browserEmpty: 'No Content Patcher projects are currently available.',
  projectsLabel: 'Projects',
  filteredLabel: 'Filtered',
  unknownLabel: 'Unknown',
  noVersionLabel: 'No Version',
  importProject: 'Import Mod',
  refreshProjects: 'Refresh',
  openFolder: 'Open Folder',
  saveProject: 'Save',
  exportProject: 'Export',
  manifestTitle: 'Manifest',
  manifestSubtitle: 'Core metadata and Content Pack linkage',
  patchesTitle: 'Patches',
  patchesSubtitle: 'Changes list and patch summaries',
  patchWhenLabel: 'When JSON',
  rawJsonTitle: 'Raw JSON',
  rawJsonSubtitle: 'Direct editing for manifest.json and content.json',
  inspectorTitle: 'Patch Inspector',
  inspectorSubtitle: 'Structured fields for the selected patch',
  diagnosticsTitle: 'Diagnostics & Export',
  diagnosticsSubtitle: 'Validation, save status, and project paths',
  noProject: 'Select a Content Patcher project to edit it here.',
  noPatch: 'No patch is currently selected.',
  projectFacts: 'Project Facts',
  capabilities: 'Capabilities',
  futureScopes: 'Future Scopes',
  dirtyLabel: 'Unsaved',
  cleanLabel: 'Synced',
  sourcePath: 'Source',
  outputPath: 'Export',
  patchAction: 'Action',
  patchTarget: 'Target',
  patchFromFile: 'FromFile',
  patchLogName: 'LogName',
  formatLabel: 'Format',
  patchesCountLabel: 'Patches',
  configKeysLabel: 'Config Keys',
  dynamicTokensLabel: 'Dynamic Tokens',
  includesLabel: 'Includes',
  hasI18nLabel: 'i18n',
  addPatch: 'Add Patch',
  removePatch: 'Remove Patch',
  noTargetLabel: 'No Target',
  whenLabel: 'When',
  alwaysLabel: 'Always',
  noPatchesLabel: 'No patches yet.',
  diagnosticsListTitle: 'Diagnostics',
  noDiagnosticsLabel: 'No diagnostics.',
  manifestPathLabel: 'Manifest',
  contentPathLabel: 'Content',
  manifestName: 'Name',
  manifestAuthor: 'Author',
  manifestVersion: 'Version',
  manifestUniqueId: 'UniqueID',
  manifestDescription: 'Description',
  manifestContentPackFor: 'ContentPackFor',
  selectExportFolder: 'Select export folder',
  selectProjectFolder: 'Select mod folder',
  importedFrom: (path) => `Imported: ${path}`,
  saveSuccess: (path) => `Saved to ${path}`,
  exportSuccess: (path) => `Exported to ${path}`,
  scanStatus: (count) => `${count} mod projects detected.`,
}

export function getModWorkspaceCopy(locale: LocaleCode) {
  return locale === 'zh-CN' ? zhCN : enUS
}
