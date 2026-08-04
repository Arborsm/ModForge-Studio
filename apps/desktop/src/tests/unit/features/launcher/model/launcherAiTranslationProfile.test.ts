import { describe, expect, it } from 'vite-plus/test'
import { resolveLauncherAiTranslationProfileId } from '@features/launcher/model/launcherAiTranslationProfile'

describe('resolveLauncherAiTranslationProfileId', () => {
  it('prefers the AI settings default profile when configured', () => {
    expect(resolveLauncherAiTranslationProfileId('ai-profile', { kind: 'generative-ai', profileId: 'engine-profile' })).toBe('ai-profile')
  })

  it('falls back to the unified default engine when it is a generative-ai profile', () => {
    expect(resolveLauncherAiTranslationProfileId(null, { kind: 'generative-ai', profileId: 'engine-profile' })).toBe('engine-profile')
    expect(resolveLauncherAiTranslationProfileId('', { kind: 'generative-ai', profileId: 'engine-profile' })).toBe('engine-profile')
  })

  it('does not route to machine-translation engines and stays not-configured', () => {
    expect(resolveLauncherAiTranslationProfileId(null, { kind: 'machine-translation', profileId: 'mt-profile' })).toBeNull()
    expect(resolveLauncherAiTranslationProfileId(null, null)).toBeNull()
  })
})
