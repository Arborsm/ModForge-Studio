import { parseOptionalNumberInput, type AiGenerationParamError, type AiGenerationParamField } from '@entities/ai'
import type { AiProviderPreset, AiSettingsSnapshot, SaveAiProviderProfile } from '@shared/contracts'

/** Generation parameters kept as raw strings while editing; parsed on save. */
export const AI_GENERATION_PARAM_FIELDS = [
  'contextWindowTokens',
  'maxOutputTokens',
  'maxBatchBytes',
  'temperature',
  'topP',
  'frequencyPenalty',
  'presencePenalty',
] as const satisfies readonly AiGenerationParamField[]

export type ParamDraftStrings = Record<(typeof AI_GENERATION_PARAM_FIELDS)[number], string>

/** Editable generative profile draft; keyStatus mirrors the resolved credential source. */
export type ProfileDraft = SaveAiProviderProfile & { keyStatus: 'keychain' | 'environment' | null }

export type GenerationParamSource = Pick<ProfileDraft, 'id' | (typeof AI_GENERATION_PARAM_FIELDS)[number]>

/** Minimal slice of the settings copy the numeric-parameter error formatter needs. */
type ParamErrorCopy = {
  advancedParamsInvalidNumber: string
  advancedParamsPositiveInt: (max: number) => string
  advancedParamsRange: (min: number, max: number) => string
}

/** Seeds the string-backed parameter drafts from a saved profile. */
export function paramStringsFromProfile(profile: GenerationParamSource): ParamDraftStrings {
  return {
    contextWindowTokens: profile.contextWindowTokens == null ? '' : String(profile.contextWindowTokens),
    maxOutputTokens: profile.maxOutputTokens == null ? '' : String(profile.maxOutputTokens),
    maxBatchBytes: profile.maxBatchBytes == null ? '' : String(profile.maxBatchBytes),
    temperature: profile.temperature == null ? '' : String(profile.temperature),
    topP: profile.topP == null ? '' : String(profile.topP),
    frequencyPenalty: profile.frequencyPenalty == null ? '' : String(profile.frequencyPenalty),
    presencePenalty: profile.presencePenalty == null ? '' : String(profile.presencePenalty),
  }
}

/** Parses one parameter string back to a number; token fields truncate to integers. */
export function paramValueFromString(field: (typeof AI_GENERATION_PARAM_FIELDS)[number], raw: string): number | null {
  if (field === 'temperature' || field === 'topP' || field === 'frequencyPenalty' || field === 'presencePenalty') {
    return parseOptionalNumberInput(raw)
  }
  const parsed = parseOptionalNumberInput(raw)
  return parsed === null ? null : Math.trunc(parsed)
}

/** Localizes a field-level generation parameter validation error. */
export function paramErrorMessage(copy: ParamErrorCopy, error: AiGenerationParamError): string {
  switch (error.kind) {
    case 'invalid-number':
      return copy.advancedParamsInvalidNumber
    case 'positive-int':
      return copy.advancedParamsPositiveInt(error.max)
    case 'range':
      return copy.advancedParamsRange(error.min, error.max)
  }
}

/** Maps a persisted settings snapshot into editable profile drafts. */
export function toDrafts(snapshot: AiSettingsSnapshot): ProfileDraft[] {
  return snapshot.profiles.map((profile) => ({
    id: profile.id,
    name: profile.name,
    presetId: profile.presetId,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    credentialEnvironment: profile.credentialEnvironment,
    allowInsecureHttp: profile.allowInsecureHttp,
    contextWindowTokens: profile.contextWindowTokens,
    maxOutputTokens: profile.maxOutputTokens,
    maxBatchBytes: profile.maxBatchBytes,
    temperature: profile.temperature,
    topP: profile.topP,
    frequencyPenalty: profile.frequencyPenalty,
    presencePenalty: profile.presencePenalty,
    enableReasoning: profile.enableReasoning,
    reasoningEffort: profile.reasoningEffort,
    streamTranslation: profile.streamTranslation,
    keyStatus: profile.resolvedCredentialSource,
  }))
}

/**
 * True when the drafts exactly match the persisted snapshot, including the
 * absence of pending credential edits (apiKey/clearApiKey must be untouched).
 */
export function profilesAreSaved(snapshot: AiSettingsSnapshot | null, profiles: ProfileDraft[], defaultProfileId: string | null) {
  if (!snapshot || snapshot.defaultProfileId !== defaultProfileId || snapshot.profiles.length !== profiles.length) return false
  return profiles.every((profile, index) => {
    const saved = snapshot.profiles[index]
    return (
      saved?.id === profile.id &&
      saved.name === profile.name &&
      saved.presetId === profile.presetId &&
      saved.protocol === profile.protocol &&
      saved.baseUrl === profile.baseUrl &&
      saved.model === profile.model &&
      saved.credentialEnvironment === profile.credentialEnvironment &&
      saved.allowInsecureHttp === profile.allowInsecureHttp &&
      saved.contextWindowTokens === profile.contextWindowTokens &&
      saved.maxOutputTokens === profile.maxOutputTokens &&
      saved.maxBatchBytes === profile.maxBatchBytes &&
      saved.temperature === profile.temperature &&
      saved.topP === profile.topP &&
      saved.frequencyPenalty === profile.frequencyPenalty &&
      saved.presencePenalty === profile.presencePenalty &&
      saved.enableReasoning === profile.enableReasoning &&
      saved.reasoningEffort === profile.reasoningEffort &&
      saved.streamTranslation === profile.streamTranslation &&
      !profile.apiKey &&
      !profile.clearApiKey
    )
  })
}

/** Patch applied when a provider preset is chosen: adopt its endpoint and clear any typed key. */
export function applyPresetSelection(preset: AiProviderPreset): Partial<ProfileDraft> {
  return {
    presetId: preset.id,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    credentialEnvironment: preset.credentialEnvironment,
    keyStatus: null,
    apiKey: '',
    clearApiKey: true,
  }
}
