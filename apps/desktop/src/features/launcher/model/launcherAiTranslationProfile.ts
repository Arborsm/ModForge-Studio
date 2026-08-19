/**
 * @file Resolves the AI translation profile id for launcher mod-detail batch
 * translation, falling back to the default generative-ai engine profile.
 */
import type { LocalizationEngineRef } from '@shared/contracts'

/**
 * Selects the AI profile for launcher mod detail batch translation:
 * prefers the default profile from AI settings; when unconfigured, falls back
 * to the unified default translation engine, used only when it is generative-ai
 * with a profileId; otherwise returns null (stays not-configured).
 */
export function resolveLauncherAiTranslationProfileId(
  aiDefaultProfileId: string | null | undefined,
  defaultEngine: LocalizationEngineRef | null,
): string | null {
  if (aiDefaultProfileId) {
    return aiDefaultProfileId
  }
  if (defaultEngine?.kind === 'generative-ai' && defaultEngine.profileId) {
    return defaultEngine.profileId
  }
  return null
}
