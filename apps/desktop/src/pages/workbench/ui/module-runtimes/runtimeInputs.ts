import { useEditorCopy, useLocale } from '@locales/provider'
import { usePreferencesStore } from '@shared/lib/app-state/preferencesStore'
import { useWorkbenchEnvironment, useWorkbenchModuleState } from '../../model/workbenchModuleContexts'

/** Resolves the provider-owned inputs shared by Workbench module runtimes. */
export function useWorkbenchRuntimeInputs() {
  const locale = useLocale()
  const copy = useEditorCopy()
  const theme = usePreferencesStore((state) => state.theme)
  const environment = useWorkbenchEnvironment()
  const moduleState = useWorkbenchModuleState()
  return { locale, theme, copy, environment, moduleState }
}
