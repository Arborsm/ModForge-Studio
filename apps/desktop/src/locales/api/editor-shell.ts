import { localeBundles } from '../dictionaries'
import type {
  EditorCopy,
  LauncherCopy,
  LauncherPage,
  LocaleCode,
  TranslationEditorCopy,
  ModWorkspaceCopy,
  NotificationCopy,
  SettingsMenuCopy,
  ViewMenuCopy,
  WorldAtlasViewId,
} from '../model'

export type {
  BuildingsPanelCopy,
  CharactersPanelCopy,
  AppMode,
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
  TranslationEditorCopy,
  ModWorkspaceCopy,
  NotificationCopy,
  SettingsMenuCopy,
  ThemeMode,
  ViewMenuCopy,
  MapPanelCopy,
  ViewportLabels,
  ScriptEditorCopy,
  WorkspaceTone,
  WorldAtlasViewId,
} from '../model'

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

export function getTranslationEditorCopy(locale: LocaleCode): TranslationEditorCopy {
  return localeBundles[locale].translationEditor
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

export function getLauncherCopy(locale: LocaleCode): LauncherCopy {
  return localeBundles[locale].editor.launcher
}

export function getLauncherPageLabel(locale: LocaleCode, page: LauncherPage): string {
  return getLauncherCopy(locale).pages[page]
}
