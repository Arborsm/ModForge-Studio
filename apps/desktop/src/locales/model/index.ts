export type {
  LocaleCode,
  ThemeMode,
  CoreWorkspaceMode,
  ToolWorkspaceMode,
  WorkspaceMode,
  AppMode,
  LauncherPage,
  WorkspaceTone,
  ModuleBlueprint,
} from './core'
export type { SettingsMenuCopy } from './settings'
export type { NotificationCopy } from './notifications'
export type { LauncherCopy, LauncherUpdatesCopy } from './launcher'
export type {
  ViewportLabels,
  MapPanelCopy,
  EventStageCopy,
  EventWorkflowCopy,
  EventWorkflowCommandKey,
  EventScenarioPresetId,
  ScriptEditorCopy,
  CharactersPanelCopy,
  BuildingsPanelCopy,
  ItemsPanelCopy,
  EditorCopy,
  ModWorkspaceCopy,
  ModI18nWorkspaceCopy,
  ViewMenuCopy,
  WorldAtlasViewId,
} from './workbench'

import type { EditorCopy } from './workbench'
import type { ModWorkspaceCopy, ModI18nWorkspaceCopy } from './workbench'
import type { NotificationCopy } from './notifications'
import type { ViewMenuCopy } from './workbench'
import type { SettingsMenuCopy } from './settings'
import type { WorldAtlasViewId } from './workbench'

export type LocaleBundle = {
  editor: EditorCopy
  mods: ModWorkspaceCopy
  modI18n: ModI18nWorkspaceCopy
  notifications: NotificationCopy
  viewMenu: ViewMenuCopy
  settingsMenu: SettingsMenuCopy
  worldAtlasViews: Record<WorldAtlasViewId, string>
}
