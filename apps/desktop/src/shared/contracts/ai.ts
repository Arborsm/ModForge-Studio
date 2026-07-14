export type AiProtocol = 'openai-responses' | 'openai-chat-completions' | 'anthropic-messages'
export type AiErrorCode =
  | 'not-configured'
  | 'authentication'
  | 'model'
  | 'rate-limit'
  | 'timeout'
  | 'network'
  | 'cache'
  | 'invalid-response'
  | 'placeholder-mismatch'
  | 'cancelled'
  | 'unknown'
export type AiStructuredOutputCapability = 'json-schema' | 'json-object' | 'strict-json-prompt' | 'anthropic-tool'
export type AiAuthentication = 'bearer' | 'anthropic-api-key' | 'none'

export type AiProviderPreset = {
  id: string
  name: string
  protocol: AiProtocol
  baseUrl: string
  credentialEnvironment: string | null
  requiresApiKey: boolean
  authentication: AiAuthentication
  supportsModelListing: boolean
  structuredOutput: AiStructuredOutputCapability
}

export type AiProviderProfile = {
  id: string
  name: string
  presetId: string
  protocol: AiProtocol
  baseUrl: string
  model: string
  credentialEnvironment: string | null
  keyConfigured: boolean
  resolvedCredentialSource: 'keychain' | 'environment' | null
}

export type AiSettingsSnapshot = {
  version: number
  defaultProfileId: string | null
  profiles: AiProviderProfile[]
  presets: AiProviderPreset[]
}

export type SaveAiProviderProfile = Omit<AiProviderProfile, 'keyConfigured' | 'resolvedCredentialSource'> & {
  apiKey?: string
  clearApiKey?: boolean
}

export type SaveAiSettingsRequest = { defaultProfileId: string | null; profiles: SaveAiProviderProfile[] }
export type AiModelInfo = { id: string; displayName: string | null }
export type AiTranslationFormat = 'plainText' | 'nexusBbcodeText' | 'stardewI18n'
export type AiTranslationItem = { id: string; text: string; format: AiTranslationFormat; context?: string }

export type AiTranslateBatchRequest = {
  jobId: string
  profileId?: string
  sourceLocale?: string
  targetLocale: string
  items: AiTranslationItem[]
}

export type AiTranslationResultItem = {
  id: string
  translatedText: string
  detectedLanguage: string | null
  skippedSameLanguage: boolean
}

export type AiTranslateBatchResult = { jobId: string; profileId: string; model: string; items: AiTranslationResultItem[] }
export type AiTranslationProgressPayload = {
  jobId: string
  completed: number
  total: number
  state: 'running' | 'completed' | 'cancelled' | 'error'
}

export type AiTranslationCacheEntry = {
  scopeKey: string
  targetLocale: string
  sourceHash: string
  translatedText: string
  providerProfileId: string
  model: string
  updatedAtMs: number
}

export type AiTranslationCacheStats = { entryCount: number; sizeBytes: number }
export type AiProfileTestResult = { model: string; latencyMs: number }

/** Host-agnostic AI translation capability injected by the application shell. */
export interface AiPort {
  loadSettings: () => Promise<AiSettingsSnapshot>
  saveSettings: (request: SaveAiSettingsRequest) => Promise<AiSettingsSnapshot>
  listModels: (profileId: string) => Promise<AiModelInfo[]>
  testProfile: (profileId: string) => Promise<AiProfileTestResult>
  translateBatch: (request: AiTranslateBatchRequest) => Promise<AiTranslateBatchResult>
  cancelJob: (jobId: string) => Promise<void>
  listenToProgress: (listener: (payload: AiTranslationProgressPayload) => void) => Promise<() => void>
  readCache: (request: Pick<AiTranslationCacheEntry, 'scopeKey' | 'targetLocale' | 'sourceHash'>) => Promise<AiTranslationCacheEntry | null>
  writeCache: (entry: AiTranslationCacheEntry) => Promise<AiTranslationCacheEntry>
  getCacheStats: () => Promise<AiTranslationCacheStats>
  clearCache: () => Promise<AiTranslationCacheStats>
}
