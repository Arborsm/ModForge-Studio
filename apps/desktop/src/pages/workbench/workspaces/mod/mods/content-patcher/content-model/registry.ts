import type { LocaleCode } from '@locales'
import type { WorkspacePluginDefinition } from './types'

export const builtInWorkspacePlugins: WorkspacePluginDefinition[] = [
  {
    id: 'content-patcher',
    pluginKind: 'content-patcher',
    capabilities: ['import', 'edit', 'save', 'export', 'validate'],
    futureScopes: ['cp-pack-builder', 'map-editing', 'api-packaging'],
    displayName: {
      'zh-CN': 'Content Patcher',
      'en-US': 'Content Patcher',
    },
    description: {
      'zh-CN': '导入、检查、编辑并导出 Content Patcher 内容包。',
      'en-US': 'Import, inspect, edit, and export Content Patcher content packs.',
    },
    getDisplayName(locale: LocaleCode) {
      return this.displayName[locale]
    },
    getDescription(locale: LocaleCode) {
      return this.description[locale]
    },
  },
]

export function getWorkspacePluginDefinition(id: WorkspacePluginDefinition['id']) {
  return builtInWorkspacePlugins.find((plugin) => plugin.id === id) ?? null
}
