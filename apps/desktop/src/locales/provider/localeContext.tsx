import { useEffect, type ReactNode } from 'react'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { localeBundles } from '../dictionaries'
import type { LocaleCode } from '../model'

type LocaleProviderProps = {
  locale: LocaleCode
  children: ReactNode
}

export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  const setLocale = usePreferencesStore((state) => state.setLocale)

  useEffect(() => {
    setLocale(locale)
  }, [locale, setLocale])

  return <>{children}</>
}

export function useLocale(): LocaleCode {
  return usePreferencesStore((state) => state.locale)
}

export function useSetLocale() {
  return usePreferencesStore((state) => state.setLocale)
}

export function useLocaleBundle() {
  const locale = useLocale()
  return localeBundles[locale]
}

export function useEditorCopy() {
  return useLocaleBundle().editor
}

export function useAuthoringShellCopy() {
  return useEditorCopy().authoringShell
}

export function useModCopy() {
  return useLocaleBundle().mods
}

export function useTranslationEditorCopy() {
  return useLocaleBundle().translationEditor
}

export function useNotificationCopy() {
  return useLocaleBundle().notifications
}

export function useViewMenuCopy() {
  return useLocaleBundle().viewMenu
}

export function useSettingsMenuCopy() {
  return useLocaleBundle().settingsMenu
}

export function useGuidesCopy() {
  return useLocaleBundle().guides
}

export function useCharactersCopy() {
  return useEditorCopy().charactersPanel
}

export function useBuildingsCopy() {
  return useEditorCopy().buildingsPanel
}

export function useItemsCopy() {
  return useEditorCopy().itemsPanel
}

export function useEventStageCopy() {
  return useEditorCopy().eventStage
}

export function useMapPanelCopy() {
  return useEditorCopy().mapPanel
}

export function useMapAuthoringCopy() {
  return useEditorCopy().mapAuthoring
}

export function useAiLocalizationCopy() {
  return useEditorCopy().aiLocalization
}

export function useCharacterDataEditorCopy() {
  return useEditorCopy().characterDataEditor
}

export function useBuildingDataEditorCopy() {
  return useEditorCopy().buildingDataEditor
}

export function useItemDataEditorCopy() {
  return useEditorCopy().itemDataEditor
}

export function useAssetAuthoringCopy() {
  return useEditorCopy().assetAuthoring
}

export function useDialogueEditorCopy() {
  return useEditorCopy().dialogueEditor
}

export function useDialogueScriptFieldCopy() {
  return useEditorCopy().dialogueScriptField
}

export function useScheduleEditorCopy() {
  return useEditorCopy().scheduleEditor
}

export function useMailEditorCopy() {
  return useEditorCopy().mailEditor
}

export function useGameDebuggerCopy() {
  return useEditorCopy().gameDebugger
}

export function useAssetLibraryCopy() {
  return useEditorCopy().assetLibrary
}

export function useResourceBrowserCopy() {
  return useEditorCopy().resourceBrowser
}

export function useAudioPanelCopy() {
  return useEditorCopy().audioPanel
}
