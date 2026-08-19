import type { AiTranslationItem, KnowledgePolicy } from './ai'

/** Query parameters for fetching AI usage records from the usage log. */
export type AiUsageQuery = {
  fromMs: number
  toMs: number
  provider?: string | null
  failureCategory?: string | null
  usageFacet?: 'cache-hit' | 'token-unavailable' | 'mt-billed' | null
  profileId: string | null
  model: string | null
  operation: string | null
  engineKind: 'generative-ai' | 'machine-translation' | null
  scopeId: string | null
  succeeded: boolean | null
  offset: number
  limit: number
}

/** Aggregate token/character/request totals for a usage query result. */
export type AiUsageTotals = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  billedCharacters: number
  requestCharacters: number
  responseCharacters: number
  requests: number
  failures: number
  unavailableUsageRequests: number
}

/** One raw AI usage event record persisted in the usage log. */
export type AiUsageRecord = {
  occurredAtMs: number
  jobId: string
  attempt: number
  pageSource: string
  operation: string
  engineKind: string
  profileId: string | null
  provider: string
  model: string | null
  scopeId: string | null
  succeeded: boolean
  latencyMs: number
  failureCategory: string | null
  requestItems: number
  requestCharacters: number
  responseCharacters: number
  inputTokens: number | null
  outputTokens: number | null
  cachedTokens: number | null
  reasoningTokens: number | null
  billedCharacters: number | null
  usageSource: 'provider-reported' | 'unavailable' | 'local-measured'
  jobSucceeded: boolean | null
}

/** Daily aggregated usage summary grouped by engine, profile, operation, and scope. */
export type AiUsageDailySummary = {
  date: string
  engineKind: string
  profileId: string | null
  operation: string
  scopeId: string | null
  totals: AiUsageTotals
}

/** Per-provider/model latency and failure summary within a usage query. */
export type AiUsageProviderModelSummary = {
  provider: string
  model: string | null
  attempts: number
  failures: number
  averageLatencyMs: number
}
/** Per-category failure count within a usage query. */
export type AiUsageFailureCategorySummary = { category: string; attempts: number }
/** Diagnostic aggregates (latency percentiles, success rates, cache hit rate) for a usage query. */
export type AiUsageDiagnostics = {
  averageLatencyMs: number
  p95LatencyMs: number
  attemptSuccessRate: number
  jobs: number
  successfulJobs: number
  jobSuccessRate: number
  cacheEligibleRequests: number
  cacheHitRequests: number
  cacheHitRate: number
  tokenUnavailableRequests: number
  detailFromMs: number
  detailComplete: boolean
  providerModels: AiUsageProviderModelSummary[]
  failureCategories: AiUsageFailureCategorySummary[]
}
/** Full usage summary — totals, daily breakdown, and diagnostics. */
export type AiUsageSummary = { totals: AiUsageTotals; daily: AiUsageDailySummary[]; diagnostics: AiUsageDiagnostics }
/** Paginated list of raw usage records. */
export type AiUsageRecordPage = { records: AiUsageRecord[]; total: number }
/** Result of clearing usage data — counts of removed events and daily rows. */
export type AiUsageClearResult = { removedEvents: number; removedDailyRows: number }

/** Component-level readiness of the localization corpus that AI translation depends on. */
export type LocalizationCorpusWarmupStatus = {
  knowledge: 'ready' | 'skipped' | 'failed'
  semantic: 'ready' | 'skipped' | 'failed'
  official: 'ready' | 'skipped' | 'failed'
  ready: boolean
  error: string | null
}

/** Host-agnostic localization capability shared by settings and workbench workflows. */
export interface LocalizationPort {
  prewarmCorpus(): Promise<LocalizationCorpusWarmupStatus>
  loadSemanticSettings(): Promise<AiSemanticSettingsSnapshot>
  saveSemanticSettings(request: SaveAiSemanticSettingsRequest): Promise<AiSemanticSettingsSnapshot>
  inspectSemanticModel(): Promise<AiSemanticModelStatus>
  verifySemanticModel(request: VerifyAiSemanticModelRequest): Promise<AiSemanticModelVerification>
  probeSemanticSearch(request: ProbeAiSemanticSearchRequest): Promise<AiSemanticProbeResult>
  downloadSemanticModel(request: DownloadAiSemanticModelRequest): Promise<AiSemanticModelStatus>
  deleteSemanticModel(modelId: string): Promise<AiSemanticModelStatus>
  openSemanticModelDirectory(modelId: string): Promise<void>
  inspectSemanticIndex(scopeIds: string[]): Promise<AiSemanticIndexStatus>
  rebuildSemanticIndex(request: RebuildAiSemanticIndexRequest): Promise<AiSemanticIndexStatus>
  syncSemanticIndex(request: RebuildAiSemanticIndexRequest): Promise<AiSemanticIndexStatus>
  testSemanticRemoteProfile(profileId: string): Promise<AiSemanticConnectionTestResult>
  listenSemanticProgress(listener: (progress: AiSemanticProgress) => void): Promise<() => void>
  chooseSemanticModelDirectory(): Promise<string | null>
  loadDefaultEngine(): Promise<LocalizationEngineRef | null>
  saveDefaultEngine(engine: LocalizationEngineRef): Promise<LocalizationEngineRef>
  loadMachineTranslationSettings(): Promise<MachineTranslationSettingsSnapshot>
  saveMachineTranslationSettings(request: SaveMachineTranslationSettingsRequest): Promise<MachineTranslationSettingsSnapshot>
  listMachineTranslationLanguages(profileId: string): Promise<MachineTranslationLanguage[]>
  testMachineTranslationProfile(profileId: string): Promise<MachineTranslationProfileTestResult>
  translateBatch(request: LocalizationTranslateBatchRequest): Promise<LocalizationTranslateBatchResult>
  reviewBatch(request: AiReviewRequest): Promise<AiReviewResult>
  listReviewRuns(request: ListReviewRunsRequest): Promise<AiReviewRunPage>
  loadReviewRun(runId: string): Promise<AiReviewResult>
  updateReviewIssues(request: UpdateReviewIssuesRequest): Promise<AiReviewResult>
  queryUsageSummary(request: AiUsageQuery): Promise<AiUsageSummary>
  queryUsageRecords(request: AiUsageQuery): Promise<AiUsageRecordPage>
  exportUsage(request: AiUsageQuery, destinationPath: string): Promise<number>
  clearUsage(mode: 'detail-older-than90-days' | 'all'): Promise<AiUsageClearResult>
  inspectOfficialIndex(gameDirectory: string): Promise<AiOfficialCorpusStatus>
  chooseGameDirectory(): Promise<string | null>
  rebuildOfficialIndex(request: RebuildOfficialLocalizationIndexRequest): Promise<AiOfficialCorpusStatus>
  listenOfficialIndexProgress(listener: (progress: AiOfficialIndexProgress) => void): Promise<() => void>
  searchOfficial(request: SearchOfficialLocalizationRequest): Promise<AiOfficialSearchPage>
  cancelJob(jobId: string): Promise<void>
  initializePlan(request: InitializeLocalizationPlanRequest): Promise<InitializeLocalizationPlanResult>
  acquireSemanticRuntime(leaseId: string): Promise<void>
  releaseSemanticRuntime(leaseId: string): Promise<void>
  unloadSemanticRuntime(): Promise<void>
  inspectContext(request: InspectLocalizationContextRequest): Promise<LocalizationContextInspection>
  resolveScope(request: ResolveLocalizationScopeRequest): Promise<AiLocalizationScopeSnapshot>
  createProfile(name: string): Promise<AiLocalizationScopeSnapshot>
  renameProfile(scopeId: string, name: string): Promise<AiLocalizationScopeSnapshot>
  deleteProfile(scopeId: string): Promise<void>
  setProfileBinding(scopeId: string, bindingKind: string, bindingValue: string): Promise<AiLocalizationScopeSnapshot>
  removeProfileBinding(bindingKind: string, bindingValue: string): Promise<void>
  listScopes(request: ListLocalizationScopesRequest): Promise<AiLocalizationScopePage>
  loadScope(scopeId: string): Promise<AiLocalizationScopeSnapshot>
  saveScopeSettings(request: LocalizationScopeSettings): Promise<AiLocalizationScopeSnapshot>
  listGlossary(request: SearchLocalizationKnowledgeRequest): Promise<AiGlossaryPage>
  upsertGlossary(scopeId: string, entries: AiGlossaryEntry[]): Promise<AiGlossaryPage>
  deleteGlossary(scopeId: string, ids: string[]): Promise<number>
  loadStyle(scopeId: string, targetLocale: string): Promise<AiStyleGuide | null>
  saveStyle(guide: AiStyleGuide): Promise<AiStyleGuide>
  searchMemory(request: SearchLocalizationKnowledgeRequest): Promise<AiTranslationMemoryPage>
  recordConfirmed(request: RecordConfirmedTranslationsRequest): Promise<number>
  deleteMemory(scopeId: string, ids: string[]): Promise<number>
  copyMemory(sourceScopeId: string, targetScopeId: string, ids: string[]): Promise<number>
  importKnowledge(request: ImportLocalizationKnowledgeRequest): Promise<LocalizationKnowledgeTransferResult>
  exportKnowledge(request: ExportLocalizationKnowledgeRequest): Promise<LocalizationKnowledgeTransferResult>
  chooseKnowledgeImport(format: LocalizationKnowledgeFormat): Promise<string | null>
  chooseKnowledgeExport(format: LocalizationKnowledgeFormat): Promise<string | null>
}

/** Status of the official localization corpus index for a game directory. */
export type AiOfficialCorpusStatus = {
  indexed: boolean
  stale: boolean
  gameDirectory: string
  gameVersion: string | null
  fingerprint: string
  revision: string | null
  updatedAtMs: number | null
  languageCount: number
  unitCount: number
  semanticEligibleCount: number
  errorCount: number
}
/** Request to rebuild the official localization index from a game directory. */
export type RebuildOfficialLocalizationIndexRequest = { jobId: string; gameDirectory: string }
/** Progress payload emitted while the official localization index rebuilds. */
export type AiOfficialIndexProgress = { jobId: string; phase: 'parsing' | 'committing'; completed: number; total: number }
/** Search request against the official localization corpus. */
export type SearchOfficialLocalizationRequest = {
  sourceLocale: string
  targetLocale: string
  query: string
  assetCategory: string | null
  unitKind: string | null
  promptEligibleOnly: boolean
  allowLiteralScan?: boolean
  offset: number
  limit: number
}
/** One matched unit from the official localization corpus search. */
export type AiOfficialUnit = {
  id: number
  sourceLocale: string
  targetLocale: string
  sourceText: string
  targetText: string
  assetPath: string
  unitKey: string
  unitKind: string
  searchable: boolean
  semanticEligible: boolean
  promptEligible: boolean
  fingerprint: string
  similarity: number
  score: number
  semanticSimilarity: number | null
  lexicalSimilarity: number
  matchKind: 'exact' | 'whole-token' | 'substring' | 'semantic' | 'none'
  retrievalMode: 'lexical' | 'semantic' | 'partial'
}
/** Paginated result of an official localization corpus search. */
export type AiOfficialSearchPage = { records: AiOfficialUnit[]; total: number }

/** One binding linking a localization scope to an external entity (e.g. mod id, project). */
export type AiLocalizationScopeBinding = { kind: string; value: string }
/** A localization scope — global or profile-level — with bindings and revision metadata. */
export type AiLocalizationScope = {
  id: string
  kind: 'global' | 'profile'
  name: string
  revision: number
  createdAtMs: number
  updatedAtMs: number
  lastUsedAtMs: number
  bindings: AiLocalizationScopeBinding[]
}
/** QA check configuration for translation review (empty, language mix, whitespace, etc.). */
export type AiQaConfig = {
  checkEmpty: boolean
  checkLanguageMix: boolean
  checkWhitespace: boolean
  checkLineBreaks: boolean
  checkLength: boolean
}
/** Persisted per-scope localization settings — engine, review profile, knowledge policy, QA config. */
export type LocalizationScopeSettings = {
  scopeId: string
  defaultEngineKind: string | null
  defaultEngineProfileId: string | null
  reviewProfileId: string | null
  knowledgePolicy: KnowledgePolicy
  autoReview: boolean
  qaConfig: AiQaConfig
}
/** Snapshot of a localization scope plus its persisted settings. */
export type AiLocalizationScopeSnapshot = { scope: AiLocalizationScope; settings: LocalizationScopeSettings }
/** Request to resolve or create a localization scope by binding. */
export type ResolveLocalizationScopeRequest = { bindingKind: string; bindingValue: string; name: string }
/** Request to initialize a localization plan with source/target locales and confirmed entries. */
export type InitializeLocalizationPlanRequest = {
  jobId: string
  bindingKind: string
  bindingValue: string
  planName: string
  sourceLocale: string
  targetLocale: string
  fileNamespace: string
  importExisting: boolean
  entries: ConfirmedTranslation[]
}
/** Result of initializing a localization plan — scope snapshot, import count, and semantic index state. */
export type InitializeLocalizationPlanResult = {
  snapshot: AiLocalizationScopeSnapshot
  importedCount: number
  knowledgeRevision: string
  semanticIndexState: 'synced' | 'skipped' | 'failed'
  semanticIndexError: string | null
}
/** Request to inspect localization context (glossary, memory, official, style) for a source text. */
export type InspectLocalizationContextRequest = {
  scopeId: string
  sourceLocale: string
  targetLocale: string
  sourceText: string
  unitKey: string | null
  gameDirectory: string | null
  knowledgePolicy: KnowledgePolicy
}
/** Result of a localization context inspection — matched glossary, memory, official units, and style guide. */
export type LocalizationContextInspection = {
  glossary: AiGlossaryEntry[]
  memory: AiTranslationMemoryEntry[]
  official: AiOfficialUnit[]
  style: AiStyleGuide | null
  knowledgeRevision: string
  trace: {
    officialIndexed: boolean
    officialMatches: number
    globalGlossaryMatches: number
    profileGlossaryMatches: number
    translationMemoryMatches: number
  }
}
/** Paginated request for listing localization scopes. */
export type ListLocalizationScopesRequest = { query: string | null; offset: number; limit: number }
/** Paginated list of localization scopes. */
export type AiLocalizationScopePage = { records: AiLocalizationScope[]; total: number }
/** Search request for glossary or translation-memory entries within a scope. */
export type SearchLocalizationKnowledgeRequest = {
  scopeId: string
  sourceLocale: string | null
  targetLocale: string | null
  query: string | null
  offset: number
  limit: number
}
/** One glossary entry mapping a source term to a target term within a scope. */
export type AiGlossaryEntry = {
  id: string
  scopeId: string
  sourceLocale: string
  targetLocale: string
  sourceTerm: string
  targetTerm: string
  matchMode: 'exact' | 'case-insensitive'
  doNotTranslate: boolean
  notes: string
  updatedAtMs: number
}
/** Paginated list of glossary entries. */
export type AiGlossaryPage = { records: AiGlossaryEntry[]; total: number }
/** Per-scope, per-locale style guide (tone, audience, formality, forbidden/preferred phrases, rules). */
export type AiStyleGuide = {
  scopeId: string
  targetLocale: string
  tone: string
  audience: string
  formality: string
  forbiddenPhrases: string[]
  preferredPhrases: string[]
  rules: string[]
  updatedAtMs: number
}
/** One translation-memory entry — a confirmed source/target pair reusable across batches. */
export type AiTranslationMemoryEntry = {
  id: string
  scopeId: string
  sourceLocale: string
  targetLocale: string
  sourceText: string
  targetText: string
  sourceKind: 'automatic' | 'manual' | 'imported' | 'official-reference'
  fileNamespace: string | null
  unitKey: string | null
  confirmedAtMs: number
  useCount: number
  similarity: number
  score: number
  semanticSimilarity: number | null
  lexicalSimilarity: number
  matchKind: 'exact' | 'whole-token' | 'substring' | 'semantic' | 'none'
  retrievalMode: 'lexical' | 'semantic' | 'partial'
}

/** Semantic search mode — lexical fallback, builtin model, local ONNX, or remote OpenAI embeddings. */
export type AiSemanticSearchMode = 'lexical' | 'builtin' | 'local-onnx' | 'remote-openai'
/** User-configured remote embedding provider profile for semantic search. */
export type AiSemanticRemoteProfile = {
  id: string
  name: string
  baseUrl: string
  model: string
  dimensions: number | null
  credentialEnvironment: string | null
  keyConfigured: boolean
  resolvedCredentialSource: string | null
}
/** Save payload for a remote embedding profile, optionally setting or clearing the API key. */
export type SaveAiSemanticRemoteProfile = {
  id: string
  name: string
  baseUrl: string
  model: string
  dimensions: number | null
  credentialEnvironment: string | null
  apiKey?: string | null
  clearApiKey?: boolean
}
/** Persisted snapshot of semantic search settings — mode, execution, local model dir, remote profiles. */
export type AiSemanticSettingsSnapshot = {
  mode: AiSemanticSearchMode
  executionPreference: 'auto' | 'cpu'
  activeExecutionProvider: string | null
  executionFallbackReason: string | null
  localModelDirectory: string | null
  activeRemoteProfileId: string | null
  remoteProfiles: AiSemanticRemoteProfile[]
}
/** Request to save semantic search settings. */
export type SaveAiSemanticSettingsRequest = {
  mode: AiSemanticSearchMode
  executionPreference: 'auto' | 'cpu'
  localModelDirectory: string | null
  activeRemoteProfileId: string | null
  remoteProfiles: SaveAiSemanticRemoteProfile[]
}
/** Status of the semantic embedding model — availability, download state, dimensions, cache size. */
export type AiSemanticModelStatus = {
  mode: AiSemanticSearchMode
  available: boolean
  downloaded: boolean
  modelId: string | null
  revision: string | null
  dimensions: number | null
  modelPath: string | null
  cacheBytes: number
  unavailableReason: string | null
}
/** Request to verify a semantic model's integrity (builtin or local ONNX). */
export type VerifyAiSemanticModelRequest = {
  mode: Extract<AiSemanticSearchMode, 'builtin' | 'local-onnx'>
  modelId: string | null
  localModelDirectory: string | null
}
/** One verified file in a semantic model integrity check. */
export type AiSemanticVerifiedFile = { relativePath: string; sizeBytes: number; sha256: string }
/** Full verification result for a semantic model — dimensions, pooling, fingerprint, and file hashes. */
export type AiSemanticModelVerification = {
  mode: Extract<AiSemanticSearchMode, 'builtin' | 'local-onnx'>
  modelId: string
  dimensions: number
  pooling: 'mean'
  normalized: true
  fingerprint: string
  verifiedAtMs: number
  files: AiSemanticVerifiedFile[]
}
/** Request to probe semantic search with a query string. */
export type ProbeAiSemanticSearchRequest = { query: string; sourceLocale: string; targetLocale: string; limit: number }
/** One match from a semantic search probe. */
export type AiSemanticProbeMatch = {
  sourceKind: 'official' | 'translation-memory'
  sourceId: string
  sourceText: string
  targetText: string
  context: string
  score: number
  semanticSimilarity: number | null
  lexicalSimilarity: number
  matchKind: string
  retrievalMode: 'lexical' | 'semantic' | 'partial'
}
/** Result of a semantic search probe — retrieval mode, timing, matches, and warnings. */
export type AiSemanticProbeResult = {
  query: string
  retrievalMode: 'lexical' | 'semantic' | 'partial'
  elapsedMs: number
  totalCandidates: number
  records: AiSemanticProbeMatch[]
  warnings: string[]
}
/** Request to download a semantic model. */
export type DownloadAiSemanticModelRequest = { jobId: string; modelId: string }
/** Progress payload emitted while a semantic model downloads. */
export type AiSemanticProgress = {
  jobId: string
  modelId: string
  kind: string
  phase: string
  currentFile: string
  downloadedBytes: number
  totalBytes: number
  percentage: number
  bytesPerSecond: number | null
  fileIndex: number
  fileCount: number
}
/** Status of a semantic index — availability, retrieval mode, coverage, and staleness. */
export type AiSemanticIndexStatus = {
  available: boolean
  retrievalMode: 'lexical' | 'semantic' | 'partial'
  generationId: string | null
  modelId: string | null
  dimensions: number | null
  officialRevision: string | null
  knowledgeRevision: string | null
  indexedRecords: number
  sourceRecords: number
  pendingRecords: number
  coveragePercentage: number
  stale: boolean
}
/** Request to rebuild or sync the semantic index for given scopes. */
export type RebuildAiSemanticIndexRequest = {
  jobId: string
  scopeIds: string[]
  confirmRemoteUpload: boolean
}
/** Result of testing a remote semantic embedding profile connection. */
export type AiSemanticConnectionTestResult = { model: string; dimensions: number; latencyMs: number }
/** Paginated list of translation-memory entries. */
export type AiTranslationMemoryPage = { records: AiTranslationMemoryEntry[]; total: number }
/** One confirmed translation pair to record into translation memory. */
export type ConfirmedTranslation = {
  sourceLocale: string
  targetLocale: string
  sourceText: string
  targetText: string
  fileNamespace: string
  unitKey: string
}
/** Request to record confirmed translations into memory. */
export type RecordConfirmedTranslationsRequest = { jobId: string; scopeId: string; fileNamespace: string; entries: ConfirmedTranslation[] }
/** File format for importing/exporting localization knowledge (glossary CSV, memory TMX, or knowledge-pack JSON). */
export type LocalizationKnowledgeFormat = 'knowledge-pack-json' | 'glossary-csv' | 'translation-memory-tmx'
/** Request to import localization knowledge from a file. */
export type ImportLocalizationKnowledgeRequest = { jobId: string; scopeId: string; sourcePath: string; format: LocalizationKnowledgeFormat }
/** Request to export localization knowledge to a file. */
export type ExportLocalizationKnowledgeRequest = {
  scopeId: string
  destinationPath: string
  format: LocalizationKnowledgeFormat
  sourceLocale: string | null
  targetLocale: string | null
  query: string | null
}
/** Result of a knowledge import/export — counts of glossary, memory, and style entries transferred. */
export type LocalizationKnowledgeTransferResult = { glossaryCount: number; memoryCount: number; styleCount: number }

/** Wire protocol for a machine-translation provider (DeepL, Google, Microsoft, Baidu, Tencent, LibreTranslate). */
export type MachineTranslationProtocol = 'deepl' | 'google-basic-v2' | 'microsoft-v3' | 'baidu-general' | 'tencent-tmt' | 'libre-translate'
/** Reference to a localization engine — either generative-AI or machine-translation, by profile id. */
export type LocalizationEngineRef = { kind: 'generative-ai' | 'machine-translation'; profileId: string }
/** Capability flags for a machine-translation provider (language dynamics, limits, glossary, HTML support). */
export type MachineTranslationCapability = {
  languagesDynamic: boolean
  maxItemCharacters: number
  maxBatchCharacters: number
  supportsHtml: boolean
  supportsGlossary: boolean
  usageCapability: string
  authentication: string
}
/** Built-in machine-translation preset with protocol, base URL, and credential field requirements. */
export type MachineTranslationPreset = {
  id: string
  name: string
  protocol: MachineTranslationProtocol
  baseUrl: string
  credentialFields: string[]
  capability: MachineTranslationCapability
}
/** User-configured machine-translation profile with credentials and default locale settings. */
export type MachineTranslationProfile = {
  id: string
  name: string
  presetId: string
  protocol: MachineTranslationProtocol
  baseUrl: string
  region: string | null
  enabled: boolean
  defaultSourceLocale: string | null
  defaultTargetLocale: string | null
  credentialEnvironments: Record<string, string>
  credentialSources: Record<string, 'keychain' | 'environment'>
}
/** Persisted snapshot of all machine-translation settings — default profile, profiles, and presets. */
export type MachineTranslationSettingsSnapshot = {
  version: number
  defaultProfileId: string | null
  profiles: MachineTranslationProfile[]
  presets: MachineTranslationPreset[]
}
/** Save payload for a machine-translation profile, optionally setting or clearing credentials. */
export type SaveMachineTranslationProfile = {
  id: string
  name: string
  presetId: string
  protocol: MachineTranslationProtocol
  baseUrl: string
  region: string | null
  enabled: boolean
  defaultSourceLocale: string | null
  defaultTargetLocale: string | null
  credentialEnvironments: Record<string, string>
  credentials: Record<string, string>
  clearCredentials: string[]
}
/** Request to persist the full machine-translation settings. */
export type SaveMachineTranslationSettingsRequest = { defaultProfileId: string | null; profiles: SaveMachineTranslationProfile[] }
/** One supported language for a machine-translation profile. */
export type MachineTranslationLanguage = { code: string; name: string; supportsSource: boolean; supportsTarget: boolean }
/** Result of testing a machine-translation profile with a probe request. */
export type MachineTranslationProfileTestResult = { latencyMs: number; detectedLanguage: string | null }
/** One translatable item in a machine-translation batch request. */
export type MachineTranslationItem = { id: string; text: string; format: 'plainText' | 'nexusBbcodeText' | 'stardewI18n' }
/** Request to translate a batch of items via a machine-translation engine. */
export type MachineTranslateBatchRequest = {
  jobId: string
  profileId: string | null
  sourceLocale: string | null
  targetLocale: string
  items: MachineTranslationItem[]
  usageContext: { pageSource: string; operation: string; scopeId?: string } | null
  knowledgePolicy: KnowledgePolicy
}
/** One translated item returned in a machine-translation batch result. */
export type MachineTranslationResultItem = { id: string; translatedText: string; detectedLanguage: string | null }
/** Full result of a machine-translation batch including validation issues and knowledge trace. */
export type MachineTranslateBatchResult = {
  jobId: string
  profileId: string
  items: MachineTranslationResultItem[]
  validationIssues: LocalizationValidationIssue[]
  usageRecordState: string
  knowledgeTrace: {
    officialMatches: number
    globalGlossaryMatches: number
    projectGlossaryMatches: number
    translationMemoryMatches: number
  }
  knowledgeRevision: string
}
/** Request to translate a batch of items via the localization pipeline (AI or MT engine). */
export type LocalizationTranslateBatchRequest = {
  jobId: string
  engine: LocalizationEngineRef
  sourceLocale: string | null
  targetLocale: string
  items: AiTranslationItem[]
  usageContext: { pageSource: string; operation: string; scopeId?: string } | null
  knowledgePolicy: KnowledgePolicy
  /** Per-batch input byte cap override forwarded to the AI provider; null derives the budget from the context window. */
  maxBatchBytes: number | null
}
/** One translated item in a localization batch result. */
export type LocalizationTranslationResultItem = {
  id: string
  translatedText: string
  detectedLanguage: string | null
  skippedSameLanguage: boolean
}
/** One validation issue found in a localization batch (marker mismatch or terminology deviation). */
export type LocalizationValidationIssue = {
  itemId: string
  category: 'marker-mismatch' | 'user-terminology' | 'official-terminology'
  sourceTerm: string | null
  expectedTerm: string | null
}
/** Full result of a localization batch translation including validation issues and knowledge trace. */
export type LocalizationTranslateBatchResult = {
  jobId: string
  engine: LocalizationEngineRef
  model: string | null
  items: LocalizationTranslationResultItem[]
  validationIssues: LocalizationValidationIssue[]
  usageRecordState: string
  knowledgeTrace: {
    officialMatches: number
    globalGlossaryMatches: number
    projectGlossaryMatches: number
    translationMemoryMatches: number
  }
  knowledgeRevision: string
}
/** One item submitted for AI translation review. */
export type AiReviewItem = { unitKey: string; sourceText: string; targetText: string }
/** Request to run an AI translation review batch. */
export type AiReviewRequest = {
  jobId: string
  scopeId: string
  sourceLocale: string
  targetLocale: string
  mode: 'current' | 'translated' | 'all'
  profileId: string | null
  runAi: boolean
  engine: string
  items: AiReviewItem[]
}
/** One issue found during an AI translation review (severity, category, suggestion, snapshots). */
export type AiReviewIssue = {
  id: string
  runId: string
  unitKey: string
  sourceHash: string
  targetHash: string
  severity: 'minor' | 'major' | 'critical'
  status: 'open' | 'ignored' | 'accepted' | 'stale'
  category: string
  reason: string
  suggestion: string | null
  sourceSnapshot: string
  targetSnapshot: string
}
/** Aggregate counts for a review run — checked, passed, warnings, and per-severity/status breakdowns. */
export type AiReviewSummary = {
  checked: number
  passed: number
  warnings: number
  total: number
  minor: number
  major: number
  critical: number
  open: number
  ignored: number
  accepted: number
  stale: number
}
/** One review run record with scope, locales, engine, status, and summary. */
export type AiReviewRun = {
  id: string
  scopeId: string
  sourceLocale: string
  targetLocale: string
  engine: string
  status: 'completed' | 'partial' | 'cancelled'
  summary: AiReviewSummary
  createdAtMs: number
}
/** Full result of an AI review run — run metadata, issues, and usage record state. */
export type AiReviewResult = { run: AiReviewRun; issues: AiReviewIssue[]; usageRecordState: 'recorded' | 'failed' | 'unavailable' }
/** Paginated request for listing review runs within a scope. */
export type ListReviewRunsRequest = { scopeId: string; offset: number; limit: number }
/** Paginated list of review runs. */
export type AiReviewRunPage = { records: AiReviewRun[]; total: number }
/** One issue status update in a review-issue batch update request. */
export type UpdateReviewIssueStatus = {
  id: string
  status: 'open' | 'ignored' | 'accepted'
  currentSourceText: string
  currentTargetText: string
}
/** Request to batch-update review issue statuses within a run. */
export type UpdateReviewIssuesRequest = { runId: string; issues: UpdateReviewIssueStatus[] }
