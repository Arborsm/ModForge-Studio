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
export type AiStructuredOutputCapability = 'json-schema' | 'json-object' | 'tool-use' | 'none'
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
  allowInsecureHttp: boolean
  contextWindowTokens: number | null
  maxOutputTokens: number | null
  temperature: number | null
  topP: number | null
  frequencyPenalty: number | null
  presencePenalty: number | null
  /** Per-batch input byte cap override for translation batching; blank derives the budget from the context window. Bounded by the 256 KB backend cap. */
  maxBatchBytes: number | null
  /** Requests provider chain-of-thought when the protocol supports it (not Anthropic in the first version). */
  enableReasoning: boolean
  /** Reasoning effort dial; null uses the provider default. Wire values map 1:1 for OpenAI (xhigh/max are model-dependent); hidden for DeepSeek (boolean thinking toggle) and Anthropic (unsupported). */
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
  /** Streams translation deltas over the host event channel while batches generate; final results are still validated in full. */
  streamTranslation: boolean
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
export type AiModelInfo = { id: string; displayName: string | null; contextWindowTokens: number | null }

/** One model inside the models.dev catalog with its limit metadata. */
export type ModelsDevModelEntry = {
  id: string
  name: string | null
  contextWindowTokens: number | null
  maxOutputTokens: number | null
}

/** One provider inside the models.dev catalog (e.g. `openai`, `anthropic`). */
export type ModelsDevProviderEntry = { id: string; name: string; models: ModelsDevModelEntry[] }

/** Parsed models.dev catalog plus the backend fetch timestamp for cache display. */
export type ModelsDevCatalog = { fetchedAtMs: number; providers: ModelsDevProviderEntry[] }
export type AiTranslationFormat = 'plainText' | 'nexusBbcodeText' | 'stardewI18n'
export type AiTranslationItem = { id: string; text: string; format: AiTranslationFormat; context?: string }

export type AiTranslateBatchRequest = {
  jobId: string
  profileId?: string
  sourceLocale?: string
  targetLocale: string
  items: AiTranslationItem[]
  usageContext?: { pageSource: 'launcher' | 'workbench-translation' | 'localization-review'; operation: string; scopeId?: string }
  knowledgePolicy?: KnowledgePolicy
  /** Skips the placeholder multiset comparison; id uniqueness/count checks always stay on. */
  skipFormatValidation?: boolean
  /** Per-batch input byte cap override (bounded by the 256 KB backend cap). */
  maxBatchBytes?: number | null
}
export type KnowledgePolicy = { enabled: boolean; useOfficialCorpus: boolean; useGlobalKnowledge: boolean; useProfileKnowledge: boolean }
export type KnowledgeTrace = {
  officialMatches: number
  globalGlossaryMatches: number
  projectGlossaryMatches: number
  translationMemoryMatches: number
}

export type AiTranslationResultItem = {
  id: string
  translatedText: string
  detectedLanguage: string | null
  skippedSameLanguage: boolean
}

export type AiTranslateBatchResult = {
  jobId: string
  profileId: string
  model: string
  items: AiTranslationResultItem[]
  usageRecordState: 'recorded' | 'failed' | 'unavailable'
  knowledgeTrace: KnowledgeTrace
  knowledgeRevision: string
  /** Provider chain-of-thought text for this batch when reasoning was enabled and returned; null/absent otherwise. */
  reasoning?: string | null
}
export type AiTranslationProgressPayload = {
  jobId: string
  completed: number
  total: number
  state: 'running' | 'completed' | 'cancelled' | 'error'
}

/** One incremental translation delta emitted over the stream channel while a streaming batch generates. */
export type AiTranslationStreamPayload = {
  jobId: string
  kind: 'content' | 'reasoning'
  delta: string
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
export type AiProfileTestResult = {
  provider: string
  protocol: AiProtocol
  baseUrl: string
  model: string
  latencyMs: number
  credentialSource: 'keychain' | 'environment' | null
  /** Provider chain-of-thought text from the probe when reasoning is enabled; null/absent otherwise. */
  reasoning?: string | null
}
export type AiProfileImportConflictPolicy = 'overwrite' | 'copy' | 'skip'
export type ExportAiProfilesRequest = { destinationPath: string; profileIds: string[] }
export type AiProfileImportPreviewEntry = {
  id: string
  name: string
  provider: string
  model: string
  conflicts: boolean
}
export type AiProfileImportPreview = { formatVersion: number; credentialsExcluded: true; entries: AiProfileImportPreviewEntry[] }
export type AiProfileImportResult = {
  settings: AiSettingsSnapshot
  imported: number
  overwritten: number
  copied: number
  skipped: number
}

/** Host-agnostic AI translation capability injected by the application shell. */
export interface AiPort {
  loadSettings: () => Promise<AiSettingsSnapshot>
  saveSettings: (request: SaveAiSettingsRequest) => Promise<AiSettingsSnapshot>
  listModels: (profileId: string) => Promise<AiModelInfo[]>
  fetchModelsDevCatalog: () => Promise<ModelsDevCatalog>
  testProfile: (profileId: string) => Promise<AiProfileTestResult>
  exportProfiles: (request: ExportAiProfilesRequest) => Promise<number>
  previewProfilesImport: (sourcePath: string) => Promise<AiProfileImportPreview>
  applyProfilesImport: (sourcePath: string, conflictPolicy: AiProfileImportConflictPolicy) => Promise<AiProfileImportResult>
  translateBatch: (request: AiTranslateBatchRequest) => Promise<AiTranslateBatchResult>
  cancelJob: (jobId: string) => Promise<void>
  listenToProgress: (listener: (payload: AiTranslationProgressPayload) => void) => Promise<() => void>
  listenToStream: (listener: (payload: AiTranslationStreamPayload) => void) => Promise<() => void>
  readCache: (request: Pick<AiTranslationCacheEntry, 'scopeKey' | 'targetLocale' | 'sourceHash'>) => Promise<AiTranslationCacheEntry | null>
  writeCache: (entry: AiTranslationCacheEntry) => Promise<AiTranslationCacheEntry>
  getCacheStats: () => Promise<AiTranslationCacheStats>
  clearCache: () => Promise<AiTranslationCacheStats>
}
