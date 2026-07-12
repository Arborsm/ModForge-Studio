import { localeBundles } from '../dictionaries'
import type {
  CoreWorkspaceMode,
  EditorCopy,
  LauncherCopy,
  LauncherPage,
  LocaleCode,
  ModI18nWorkspaceCopy,
  ModWorkspaceCopy,
  NotificationCopy,
  SettingsMenuCopy,
  ViewMenuCopy,
  WorkspaceMode,
  WorldAtlasViewId,
} from '../model'

export type {
  BuildingsPanelCopy,
  CharactersPanelCopy,
  AppMode,
  CoreWorkspaceMode,
  EditorCopy,
  EventStageCopy,
  EventWorkflowCopy,
  EventWorkflowCommandKey,
  EventScenarioPresetId,
  ItemsPanelCopy,
  LauncherCopy,
  LauncherUpdatesCopy,
  LauncherPage,
  LocaleBundle,
  LocaleCode,
  ModI18nWorkspaceCopy,
  ModWorkspaceCopy,
  NotificationCopy,
  ModuleBlueprint,
  SettingsMenuCopy,
  ThemeMode,
  ViewMenuCopy,
  MapPanelCopy,
  ViewportLabels,
  ScriptEditorCopy,
  WorkspaceMode,
  WorkspaceTone,
  WorldAtlasViewId,
} from '../model'

export const workspaceModes: CoreWorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items']
export const launcherPages: LauncherPage[] = ['library', 'discover', 'updates', 'configuration']

export const editorCopy: Record<LocaleCode, EditorCopy> = {
  'zh-CN': localeBundles['zh-CN'].editor,
  'en-US': localeBundles['en-US'].editor,
}

export function getEditorCopy(locale: LocaleCode): EditorCopy {
  return localeBundles[locale].editor
}

export function getModWorkspaceCopy(locale: LocaleCode): ModWorkspaceCopy {
  return localeBundles[locale].mods
}

export function getModI18nWorkspaceCopy(locale: LocaleCode): ModI18nWorkspaceCopy {
  return localeBundles[locale].modI18n
}

export function getNotificationCopy(locale: LocaleCode): NotificationCopy {
  return localeBundles[locale].notifications
}

export function getWorldAtlasViewLabel(locale: LocaleCode, viewId: WorldAtlasViewId): string {
  return localeBundles[locale].worldAtlasViews[viewId]
}

export function getViewMenuCopy(locale: LocaleCode): ViewMenuCopy {
  return localeBundles[locale].viewMenu
}

export function getSettingsMenuCopy(locale: LocaleCode): SettingsMenuCopy {
  return localeBundles[locale].settingsMenu
}

export function getWorkspaceModeLabel(locale: LocaleCode, copy: Pick<EditorCopy, 'nav'>, mode: WorkspaceMode) {
  if (mode === 'mod-browser') {
    return getModWorkspaceCopy(locale).workspaceLabel
  }

  if (mode === 'mod-i18n') {
    return localeBundles[locale].modI18n.workspaceLabel
  }

  return copy.nav[mode]
}

export function getLauncherCopy(locale: LocaleCode): LauncherCopy {
  return localeBundles[locale].editor.launcher
}

export function getLauncherPageLabel(locale: LocaleCode, page: LauncherPage): string {
  return getLauncherCopy(locale).pages[page]
}
