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

export function useModWorkspaceCopy() {
  return useLocaleBundle().mods
}

export function useModI18nCopy() {
  return useLocaleBundle().modI18n
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
