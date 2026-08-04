import type { LocalizationEngineRef } from '@shared/contracts'

/**
 * 为 launcher mod detail 的 AI 批次翻译选择 profile：
 * 优先 AI 设置里的默认 profile；未配置时回退到统一默认翻译引擎，
 * 仅当其为 generative-ai 且带有 profileId 时使用，否则返回 null（维持 not-configured）。
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
