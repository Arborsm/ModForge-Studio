import { applyAppUiStatePatch } from '@shared/lib/app-state'

/** Persists the requested localization scope before opening the center module. */
export async function openLocalizationCenter(
  scopeId: string | null,
  onOpenModule: (moduleId: string) => void,
  tab: 'overview' | 'glossary' | 'memory' | 'style' | 'quality' = 'glossary',
) {
  await applyAppUiStatePatch({
    workspace: {
      modules: {
        'ai-localization/scope': { value: scopeId ?? '' },
        'ai-localization/tab': { value: tab },
      },
    },
  })
  onOpenModule('ai-localization')
}
