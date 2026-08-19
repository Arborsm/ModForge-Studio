/** Wire protocol used to talk to an AI provider (OpenAI Responses, chat completions, or Anthropic Messages). */
export type AiProtocol = 'openai-responses' | 'openai-chat-completions' | 'anthropic-messages'
/** Stable error category for AI operations, used for diagnostics and usage tracking. */
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
/** Structured-output mode supported by a provider (JSON schema, JSON object, tool use, or none). */
export type AiStructuredOutputCapability = 'json-schema' | 'json-object' | 'tool-use' | 'none'
/** Authentication scheme required by a provider preset. */
export type AiAuthentication = 'bearer' | 'anthropic-api-key' | 'none'

/** Built-in provider preset (e.g. OpenAI, Anthropic) with protocol and capability metadata. */
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

/** User-configured AI provider profile with model, credentials, and generation parameters. */
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

/** Persisted snapshot of all AI settings — default profile, profiles, and presets. */
export type AiSettingsSnapshot = {
  version: number
  defaultProfileId: string | null
  profiles: AiProviderProfile[]
  presets: AiProviderPreset[]
}

/** Payload for saving a provider profile, optionally setting or clearing the API key. */
export type SaveAiProviderProfile = Omit<AiProviderProfile, 'keyConfigured' | 'resolvedCredentialSource'> & {
  apiKey?: string
  clearApiKey?: boolean
}

/** Request to persist the full AI settings (default profile + profiles). */
export type SaveAiSettingsRequest = { defaultProfileId: string | null; profiles: SaveAiProviderProfile[] }
/** One model returned by a provider's model-listing endpoint. */
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
/** Translation format for AI batch items — plain text, Nexus BBCode, or Stardew i18n. */
export type AiTranslationFormat = 'plainText' | 'nexusBbcodeText' | 'stardewI18n'
/** One translatable item in an AI translation batch request. */
export type AiTranslationItem = { id: string; text: string; format: AiTranslationFormat; context?: string }

/** Request to translate a batch of items via an AI provider. */
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
/** Knowledge-source policy controlling which corpora the AI may consult during translation. */
export type KnowledgePolicy = { enabled: boolean; useOfficialCorpus: boolean; useGlobalKnowledge: boolean; useProfileKnowledge: boolean }
/** Counts of knowledge-base matches found during a translation batch, for traceability. */
export type KnowledgeTrace = {
  officialMatches: number
  globalGlossaryMatches: number
  projectGlossaryMatches: number
  translationMemoryMatches: number
}

/** One translated item returned in an AI batch result. */
export type AiTranslationResultItem = {
  id: string
  translatedText: string
  detectedLanguage: string | null
  skippedSameLanguage: boolean
}

/** Full result of an AI translation batch including model, usage state, and knowledge trace. */
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
/** Progress payload emitted over the host event channel while a translation batch runs. */
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

/** One persisted AI translation cache entry keyed by scope, locale, and source hash. */
export type AiTranslationCacheEntry = {
  scopeKey: string
  targetLocale: string
  sourceHash: string
  translatedText: string
  providerProfileId: string
  model: string
  updatedAtMs: number
}

/** Aggregate stats for the AI translation cache (entry count and size). */
export type AiTranslationCacheStats = { entryCount: number; sizeBytes: number }
/** Result of probing a provider profile with a test request. */
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
/** Conflict-resolution policy when importing profiles that clash with existing ids. */
export type AiProfileImportConflictPolicy = 'overwrite' | 'copy' | 'skip'
/** Request to export selected profiles to a file. */
export type ExportAiProfilesRequest = { destinationPath: string; profileIds: string[] }
/** One entry in the profile-import preview, with conflict detection. */
export type AiProfileImportPreviewEntry = {
  id: string
  name: string
  provider: string
  model: string
  conflicts: boolean
}
/** Preview of a profile-import file — format version, credential exclusion flag, and entries. */
export type AiProfileImportPreview = { formatVersion: number; credentialsExcluded: true; entries: AiProfileImportPreviewEntry[] }
/** Result of applying a profile import — counts of imported, overwritten, copied, and skipped entries. */
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
