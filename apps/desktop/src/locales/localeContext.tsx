import { createContext, useContext, type ReactNode } from 'react'
import { localeBundles } from '@locales'
import type { LocaleCode } from '@locales'

const LocaleContext = createContext<LocaleCode | null>(null)

type LocaleProviderProps = {
  locale: LocaleCode
  children: ReactNode
}

export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleCode {
  const locale = useContext(LocaleContext)
  if (!locale) {
    throw new Error('useLocale must be used within LocaleProvider')
  }

  return locale
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
