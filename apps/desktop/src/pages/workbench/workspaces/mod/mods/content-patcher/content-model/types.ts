import type { LocaleCode } from '@locales'
export type WorkspacePluginId = 'content-patcher'
export type WorkspacePluginCapability = 'import' | 'edit' | 'save' | 'export' | 'validate'

export type WorkspacePluginDefinition = {
  id: WorkspacePluginId
  pluginKind: 'content-patcher'
  capabilities: WorkspacePluginCapability[]
  futureScopes: string[]
  displayName: Record<LocaleCode, string>
  description: Record<LocaleCode, string>
  getDisplayName: (locale: LocaleCode) => string
  getDescription: (locale: LocaleCode) => string
}

export type JsonEditorState = {
  text: string
  value: object | null
  error: string | null
}
