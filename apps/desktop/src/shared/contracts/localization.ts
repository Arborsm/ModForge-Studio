import type { AiTranslationItem, KnowledgePolicy } from './ai'

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

export type AiUsageDailySummary = {
  date: string
  engineKind: string
  profileId: string | null
  operation: string
  scopeId: string | null
  totals: AiUsageTotals
}

export type AiUsageProviderModelSummary = {
  provider: string
  model: string | null
  attempts: number
  failures: number
  averageLatencyMs: number
}
export type AiUsageFailureCategorySummary = { category: string; attempts: number }
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
export type AiUsageSummary = { totals: AiUsageTotals; daily: AiUsageDailySummary[]; diagnostics: AiUsageDiagnostics }
export type AiUsageRecordPage = { records: AiUsageRecord[]; total: number }
export type AiUsageClearResult = { removedEvents: number; removedDailyRows: number }

/** Host-agnostic localization capability shared by settings and workbench workflows. */
export interface LocalizationPort {
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
export type RebuildOfficialLocalizationIndexRequest = { jobId: string; gameDirectory: string }
export type AiOfficialIndexProgress = { jobId: string; phase: 'parsing' | 'committing'; completed: number; total: number }
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
export type AiOfficialSearchPage = { records: AiOfficialUnit[]; total: number }

export type AiLocalizationScopeBinding = { kind: string; value: string }
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
export type AiQaConfig = {
  checkEmpty: boolean
  checkLanguageMix: boolean
  checkWhitespace: boolean
  checkLineBreaks: boolean
  checkLength: boolean
}
export type LocalizationScopeSettings = {
  scopeId: string
  defaultEngineKind: string | null
  defaultEngineProfileId: string | null
  reviewProfileId: string | null
  knowledgePolicy: KnowledgePolicy
  autoReview: boolean
  qaConfig: AiQaConfig
}
export type AiLocalizationScopeSnapshot = { scope: AiLocalizationScope; settings: LocalizationScopeSettings }
export type ResolveLocalizationScopeRequest = { bindingKind: string; bindingValue: string; name: string }
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
export type InitializeLocalizationPlanResult = {
  snapshot: AiLocalizationScopeSnapshot
  importedCount: number
  knowledgeRevision: string
  semanticIndexState: 'synced' | 'skipped' | 'failed'
  semanticIndexError: string | null
}
export type InspectLocalizationContextRequest = {
  scopeId: string
  sourceLocale: string
  targetLocale: string
  sourceText: string
  unitKey: string | null
  gameDirectory: string | null
  knowledgePolicy: KnowledgePolicy
}
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
export type ListLocalizationScopesRequest = { query: string | null; offset: number; limit: number }
export type AiLocalizationScopePage = { records: AiLocalizationScope[]; total: number }
export type SearchLocalizationKnowledgeRequest = {
  scopeId: string
  sourceLocale: string | null
  targetLocale: string | null
  query: string | null
  offset: number
  limit: number
}
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
export type AiGlossaryPage = { records: AiGlossaryEntry[]; total: number }
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

export type AiSemanticSearchMode = 'lexical' | 'builtin' | 'local-onnx' | 'remote-openai'
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
export type AiSemanticSettingsSnapshot = {
  mode: AiSemanticSearchMode
  executionPreference: 'auto' | 'cpu'
  activeExecutionProvider: string | null
  executionFallbackReason: string | null
  localModelDirectory: string | null
  activeRemoteProfileId: string | null
  remoteProfiles: AiSemanticRemoteProfile[]
}
export type SaveAiSemanticSettingsRequest = {
  mode: AiSemanticSearchMode
  executionPreference: 'auto' | 'cpu'
  localModelDirectory: string | null
  activeRemoteProfileId: string | null
  remoteProfiles: SaveAiSemanticRemoteProfile[]
}
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
export type VerifyAiSemanticModelRequest = {
  mode: Extract<AiSemanticSearchMode, 'builtin' | 'local-onnx'>
  modelId: string | null
  localModelDirectory: string | null
}
export type AiSemanticVerifiedFile = { relativePath: string; sizeBytes: number; sha256: string }
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
export type ProbeAiSemanticSearchRequest = { query: string; sourceLocale: string; targetLocale: string; limit: number }
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
export type AiSemanticProbeResult = {
  query: string
  retrievalMode: 'lexical' | 'semantic' | 'partial'
  elapsedMs: number
  totalCandidates: number
  records: AiSemanticProbeMatch[]
  warnings: string[]
}
export type DownloadAiSemanticModelRequest = { jobId: string; modelId: string }
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
export type RebuildAiSemanticIndexRequest = {
  jobId: string
  scopeIds: string[]
  confirmRemoteUpload: boolean
}
export type AiSemanticConnectionTestResult = { model: string; dimensions: number; latencyMs: number }
export type AiTranslationMemoryPage = { records: AiTranslationMemoryEntry[]; total: number }
export type ConfirmedTranslation = {
  sourceLocale: string
  targetLocale: string
  sourceText: string
  targetText: string
  fileNamespace: string
  unitKey: string
}
export type RecordConfirmedTranslationsRequest = { jobId: string; scopeId: string; fileNamespace: string; entries: ConfirmedTranslation[] }
export type LocalizationKnowledgeFormat = 'knowledge-pack-json' | 'glossary-csv' | 'translation-memory-tmx'
export type ImportLocalizationKnowledgeRequest = { jobId: string; scopeId: string; sourcePath: string; format: LocalizationKnowledgeFormat }
export type ExportLocalizationKnowledgeRequest = {
  scopeId: string
  destinationPath: string
  format: LocalizationKnowledgeFormat
  sourceLocale: string | null
  targetLocale: string | null
  query: string | null
}
export type LocalizationKnowledgeTransferResult = { glossaryCount: number; memoryCount: number; styleCount: number }

export type MachineTranslationProtocol = 'deepl' | 'google-basic-v2' | 'microsoft-v3' | 'baidu-general' | 'tencent-tmt' | 'libre-translate'
export type LocalizationEngineRef = { kind: 'generative-ai' | 'machine-translation'; profileId: string }
export type MachineTranslationCapability = {
  languagesDynamic: boolean
  maxItemCharacters: number
  maxBatchCharacters: number
  supportsHtml: boolean
  supportsGlossary: boolean
  usageCapability: string
  authentication: string
}
export type MachineTranslationPreset = {
  id: string
  name: string
  protocol: MachineTranslationProtocol
  baseUrl: string
  credentialFields: string[]
  capability: MachineTranslationCapability
}
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
export type MachineTranslationSettingsSnapshot = {
  version: number
  defaultProfileId: string | null
  profiles: MachineTranslationProfile[]
  presets: MachineTranslationPreset[]
}
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
export type SaveMachineTranslationSettingsRequest = { defaultProfileId: string | null; profiles: SaveMachineTranslationProfile[] }
export type MachineTranslationLanguage = { code: string; name: string; supportsSource: boolean; supportsTarget: boolean }
export type MachineTranslationProfileTestResult = { latencyMs: number; detectedLanguage: string | null }
export type MachineTranslationItem = { id: string; text: string; format: 'plainText' | 'nexusBbcodeText' | 'stardewI18n' }
export type MachineTranslateBatchRequest = {
  jobId: string
  profileId: string | null
  sourceLocale: string | null
  targetLocale: string
  items: MachineTranslationItem[]
  usageContext: { pageSource: string; operation: string; scopeId?: string } | null
  knowledgePolicy: KnowledgePolicy
}
export type MachineTranslationResultItem = { id: string; translatedText: string; detectedLanguage: string | null }
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
export type LocalizationTranslateBatchRequest = {
  jobId: string
  engine: LocalizationEngineRef
  sourceLocale: string | null
  targetLocale: string
  items: AiTranslationItem[]
  usageContext: { pageSource: string; operation: string; scopeId?: string } | null
  knowledgePolicy: KnowledgePolicy
}
export type LocalizationTranslationResultItem = {
  id: string
  translatedText: string
  detectedLanguage: string | null
  skippedSameLanguage: boolean
}
export type LocalizationValidationIssue = {
  itemId: string
  category: 'marker-mismatch' | 'user-terminology' | 'official-terminology'
  sourceTerm: string | null
  expectedTerm: string | null
}
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
export type AiReviewItem = { unitKey: string; sourceText: string; targetText: string }
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
export type AiReviewResult = { run: AiReviewRun; issues: AiReviewIssue[]; usageRecordState: 'recorded' | 'failed' | 'unavailable' }
export type ListReviewRunsRequest = { scopeId: string; offset: number; limit: number }
export type AiReviewRunPage = { records: AiReviewRun[]; total: number }
export type UpdateReviewIssueStatus = {
  id: string
  status: 'open' | 'ignored' | 'accepted'
  currentSourceText: string
  currentTargetText: string
}
export type UpdateReviewIssuesRequest = { runId: string; issues: UpdateReviewIssueStatus[] }
