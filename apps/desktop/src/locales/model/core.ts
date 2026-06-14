export type LocaleCode = 'zh-CN' | 'en-US'
export type ThemeMode = 'dark' | 'light'
export type CoreWorkspaceMode = 'map' | 'characters' | 'buildings' | 'items' | 'mod-i18n' | 'events'
export type WorkspaceMode = CoreWorkspaceMode | 'mods'
export type AppMode = 'workbench' | 'launcher'
export type LauncherPage = 'library' | 'discover' | 'updates' | 'configuration'
export type WorkspaceTone = 'idle' | 'working' | 'ready' | 'error'

type ModuleNode = {
  title: string
  detail: string
}

export type ModuleBlueprint = {
  title: string
  state: string
  summary: string
  focusTitle: string
  listTitle: string
  inspectorTitle: string
  list: string[]
  lanes: string[]
  bullets: string[]
  nodes: ModuleNode[]
}
