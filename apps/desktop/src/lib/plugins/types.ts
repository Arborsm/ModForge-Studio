import type { LocaleCode } from '../editor-shell'
import type { PluginKind } from '../desktop'

export type WorkspacePluginId = 'content-patcher'
export type WorkspacePluginCapability = 'import' | 'edit' | 'save' | 'export' | 'validate'

export type WorkspacePluginDefinition = {
  id: WorkspacePluginId
  pluginKind: Extract<PluginKind, 'content-patcher'>
  capabilities: WorkspacePluginCapability[]
  futureScopes: string[]
  getDisplayName: (locale: LocaleCode) => string
  getDescription: (locale: LocaleCode) => string
}

export type JsonEditorState = {
  text: string
  value: unknown | null
  error: string | null
}
