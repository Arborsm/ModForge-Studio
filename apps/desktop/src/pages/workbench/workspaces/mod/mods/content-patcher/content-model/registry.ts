import type { LocaleCode } from '@locales'
import type { WorkspacePluginDefinition } from './types'

export const builtInWorkspacePlugins: WorkspacePluginDefinition[] = [
  {
    id: 'content-patcher',
    pluginKind: 'content-patcher',
    capabilities: ['import', 'edit', 'save', 'export', 'validate'],
    futureScopes: ['cp-pack-builder', 'map-editing', 'api-packaging'],
    getDisplayName(locale: LocaleCode) {
      return locale === 'zh-CN' ? 'Content Patcher' : 'Content Patcher'
    },
    getDescription(locale: LocaleCode) {
      return locale === 'zh-CN'
        ? '导入、检查、编辑并导出 Content Patcher 内容包。'
        : 'Import, inspect, edit, and export Content Patcher content packs.'
    },
  },
]

export function getWorkspacePluginDefinition(id: WorkspacePluginDefinition['id']) {
  return builtInWorkspacePlugins.find((plugin) => plugin.id === id) ?? null
}
