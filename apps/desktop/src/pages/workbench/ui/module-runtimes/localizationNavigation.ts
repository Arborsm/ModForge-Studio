import { applyAppUiStatePatch } from '@shared/lib/app-state'

/** Persists the requested localization scope before opening the center module. */
export async function openLocalizationCenter(scopeId: string | null, onOpenModule: (moduleId: string) => void) {
  await applyAppUiStatePatch({
    workspace: {
      modules: {
        'ai-localization/scope': { value: scopeId ?? '' },
      },
    },
  })
  onOpenModule('ai-localization')
}
