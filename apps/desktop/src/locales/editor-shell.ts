import { localeBundles } from '../locales'
import type {
  EditorCopy,
  LauncherCopy,
  LauncherPage,
  LocaleCode,
  ModWorkspaceCopy,
  NotificationCopy,
  SettingsMenuCopy,
  ViewMenuCopy,
  WorkspaceMode,
  WorldAtlasViewId,
} from '../locales'

export type {
  BuildingsPanelCopy,
  CharactersPanelCopy,
  AppMode,
  CoreWorkspaceMode,
  EditorCopy,
  EventStageCopy,
  ItemsPanelCopy,
  LauncherCopy,
  LauncherPage,
  LocaleBundle,
  LocaleCode,
  ModWorkspaceCopy,
  NotificationCopy,
  ModuleBlueprint,
  SettingsMenuCopy,
  ThemeMode,
  ViewMenuCopy,
  ViewportLabels,
  WorkspaceMode,
  WorkspaceTone,
  WorldAtlasViewId,
} from '../locales'

export const workspaceModes: WorkspaceMode[] = ['map', 'events', 'characters', 'buildings', 'items', 'mods']
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
  if (mode === 'mods') {
    return getModWorkspaceCopy(locale).workspaceLabel
  }

  return copy.nav[mode]
}

export function getLauncherCopy(locale: LocaleCode): LauncherCopy {
  return localeBundles[locale].editor.launcher
}

export function getLauncherPageLabel(locale: LocaleCode, page: LauncherPage): string {
  return getLauncherCopy(locale).pages[page]
}
