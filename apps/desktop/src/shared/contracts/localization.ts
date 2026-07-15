import type { AiTranslationItem, KnowledgePolicy } from './ai'

export type AiUsageQuery = {
  fromMs: number
  toMs: number
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
}

export type AiUsageDailySummary = {
  date: string
  engineKind: string
  profileId: string | null
  operation: string
  scopeId: string | null
  totals: AiUsageTotals
}

export type AiUsageSummary = { totals: AiUsageTotals; daily: AiUsageDailySummary[] }
export type AiUsageRecordPage = { records: AiUsageRecord[]; total: number }
export type AiUsageClearResult = { removedEvents: number; removedDailyRows: number }

/** Host-agnostic localization capability shared by settings and workbench workflows. */
export interface LocalizationPort {
  loadDefaultEngine(): Promise<LocalizationEngineRef | null>
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
  resolveScope(request: ResolveLocalizationScopeRequest): Promise<AiLocalizationScopeSnapshot>
  rebindScope(scopeId: string, bindingKind: string, bindingValue: string): Promise<AiLocalizationScopeSnapshot>
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
  promptEligible: boolean
  fingerprint: string
  similarity: number
}
export type AiOfficialSearchPage = { records: AiOfficialUnit[]; total: number }

export type AiLocalizationScope = {
  id: string
  kind: 'global' | 'project'
  name: string
  revision: number
  createdAtMs: number
  updatedAtMs: number
  lastUsedAtMs: number
  bindingKind: string | null
  bindingValue: string | null
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
}
export type AiTranslationMemoryPage = { records: AiTranslationMemoryEntry[]; total: number }
export type ConfirmedTranslation = {
  sourceLocale: string
  targetLocale: string
  sourceText: string
  targetText: string
  fileNamespace: string
  unitKey: string
}
export type RecordConfirmedTranslationsRequest = { scopeId: string; fileNamespace: string; entries: ConfirmedTranslation[] }
export type LocalizationKnowledgeFormat = 'knowledge-pack-json' | 'glossary-csv' | 'translation-memory-tmx'
export type ImportLocalizationKnowledgeRequest = { scopeId: string; sourcePath: string; format: LocalizationKnowledgeFormat }
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
