/**
 * @file Desktop host facade for the localization orchestrator — semantic engine, official corpus, knowledge profiles, machine translation and review.
 * @module platform/host/localization
 */

import type {
  AiGlossaryEntry,
  AiGlossaryPage,
  AiLocalizationScopePage,
  AiLocalizationScopeSnapshot,
  AiStyleGuide,
  AiTranslationMemoryPage,
  ExportLocalizationKnowledgeRequest,
  ImportLocalizationKnowledgeRequest,
  ListLocalizationScopesRequest,
  LocalizationKnowledgeTransferResult,
  LocalizationScopeSettings,
  RecordConfirmedTranslationsRequest,
  ResolveLocalizationScopeRequest,
  SearchLocalizationKnowledgeRequest,
  AiOfficialCorpusStatus,
  AiOfficialSearchPage,
  RebuildOfficialLocalizationIndexRequest,
  SearchOfficialLocalizationRequest,
  MachineTranslationSettingsSnapshot,
  SaveMachineTranslationSettingsRequest,
  MachineTranslationLanguage,
  MachineTranslationProfileTestResult,
  MachineTranslateBatchRequest,
  MachineTranslateBatchResult,
  AiReviewRequest,
  AiReviewResult,
  ListReviewRunsRequest,
  AiReviewRunPage,
  UpdateReviewIssuesRequest,
  LocalizationTranslateBatchRequest,
  LocalizationTranslateBatchResult,
  AiOfficialIndexProgress,
  AiSemanticSettingsSnapshot,
  SaveAiSemanticSettingsRequest,
  AiSemanticModelStatus,
  DownloadAiSemanticModelRequest,
  AiSemanticIndexStatus,
  RebuildAiSemanticIndexRequest,
  AiSemanticProgress,
  AiSemanticConnectionTestResult,
  LocalizationEngineRef,
  VerifyAiSemanticModelRequest,
  AiSemanticModelVerification,
  ProbeAiSemanticSearchRequest,
  AiSemanticProbeResult,
  InitializeLocalizationPlanRequest,
  InitializeLocalizationPlanResult,
  InspectLocalizationContextRequest,
  LocalizationContextInspection,
  LocalizationCorpusWarmupStatus,
} from '@shared/contracts'
import { HOST_COMMANDS } from '@platform/host-commands'
import { getPlatformPorts, invokeDesktop } from './runtime'

const OFFICIAL_INDEX_PROGRESS_EVENT = 'localization://official-index-progress'
const SEMANTIC_PROGRESS_EVENT = 'localization://semantic-progress'

/** Loads the explicitly selected application-wide translation engine. */
export const loadLocalizationDefaultEngine = () =>
  invokeDesktop<LocalizationEngineRef | null>(
    HOST_COMMANDS.loadLocalizationDefaultEngine,
    {},
    { kind: 'parallelPool', pool: 'settings-read', limit: 4 },
  )

/** Warms the localization corpus (knowledge DB, semantic runtime, official index check). */
export const prewarmLocalizationCorpus = () =>
  invokeDesktop<LocalizationCorpusWarmupStatus>(
    HOST_COMMANDS.prewarmLocalizationCorpus,
    {},
    { kind: 'serviceGate', key: 'localization-corpus-prewarm' },
  )

/** Persists an application-wide engine only after Rust validates its profile. */
export const saveLocalizationDefaultEngine = (engine: LocalizationEngineRef) =>
  invokeDesktop<LocalizationEngineRef>(
    HOST_COMMANDS.saveLocalizationDefaultEngine,
    { engine },
    { kind: 'exclusiveMutation', resource: 'LocalizationSettings' },
  )

/** Loads the current semantic engine settings (mode, execution provider, remote profiles). */
export const loadLocalizationSemanticSettings = () =>
  invokeDesktop<AiSemanticSettingsSnapshot>(
    HOST_COMMANDS.loadLocalizationSemanticSettings,
    {},
    { kind: 'parallelPool', pool: 'semantic-status', limit: 4 },
  )
/** Persists semantic engine settings after Rust validates the execution provider and remote profile. */
export const saveLocalizationSemanticSettings = (request: SaveAiSemanticSettingsRequest) =>
  invokeDesktop<AiSemanticSettingsSnapshot>(
    HOST_COMMANDS.saveLocalizationSemanticSettings,
    { request },
    { kind: 'queuedMutation', queue: 'AiSemanticSettings' },
  )
/** Returns the local ONNX model status (download state, dimensions, cache size). */
export const inspectLocalizationSemanticModel = () =>
  invokeDesktop<AiSemanticModelStatus>(
    HOST_COMMANDS.inspectLocalizationSemanticModel,
    {},
    { kind: 'parallelPool', pool: 'semantic-status', limit: 4 },
  )
/** Verifies the local ONNX model files against their expected SHA-256 fingerprints. */
export const verifyLocalizationSemanticModel = (request: VerifyAiSemanticModelRequest) =>
  invokeDesktop<AiSemanticModelVerification>(
    HOST_COMMANDS.verifyLocalizationSemanticModel,
    { request },
    { kind: 'serviceGate', key: 'semantic-model-verification' },
  )
/** Runs a one-shot semantic search probe against the active index for connection diagnostics. */
export const probeLocalizationSemanticSearch = (request: ProbeAiSemanticSearchRequest) =>
  invokeDesktop<AiSemanticProbeResult>(
    HOST_COMMANDS.probeLocalizationSemanticSearch,
    { request },
    { kind: 'serviceGate', key: 'semantic-search' },
  )
/** Downloads the selected ONNX model into the local model directory. */
export const downloadLocalizationSemanticModel = (request: DownloadAiSemanticModelRequest) =>
  invokeDesktop<AiSemanticModelStatus>(
    HOST_COMMANDS.downloadLocalizationSemanticModel,
    { request },
    { kind: 'serviceGate', key: 'semantic-model-download' },
  )
/** Deletes the local ONNX model files and frees the occupied disk cache. */
export const deleteLocalizationSemanticModel = (modelId: string) =>
  invokeDesktop<AiSemanticModelStatus>(
    HOST_COMMANDS.deleteLocalizationSemanticModel,
    { request: { modelId } },
    { kind: 'exclusiveMutation', resource: 'AiSemanticModel' },
  )
/** Opens the local model directory in the OS file explorer. */
export const openLocalizationSemanticModelDirectory = (modelId: string) =>
  invokeDesktop<void>(
    HOST_COMMANDS.openLocalizationSemanticModelDirectory,
    { request: { modelId } },
    { kind: 'serviceGate', key: 'semantic-model-directory' },
  )
/** Returns the semantic index status (coverage, pending records, staleness) for the given scopes. */
export const inspectLocalizationSemanticIndex = (scopeIds: string[]) =>
  invokeDesktop<AiSemanticIndexStatus>(
    HOST_COMMANDS.inspectLocalizationSemanticIndex,
    { scopeIds },
    { kind: 'parallelPool', pool: 'semantic-status', limit: 4 },
  )
/** Rebuilds the semantic index from scratch, discarding the existing vector store. */
export const rebuildLocalizationSemanticIndex = (request: RebuildAiSemanticIndexRequest) =>
  invokeDesktop<AiSemanticIndexStatus>(
    HOST_COMMANDS.rebuildLocalizationSemanticIndex,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiSemanticIndex' },
  )
/** Synchronizes the semantic index incrementally, embedding only new or changed records. */
export const syncLocalizationSemanticIndex = (request: RebuildAiSemanticIndexRequest) =>
  invokeDesktop<AiSemanticIndexStatus>(
    HOST_COMMANDS.syncLocalizationSemanticIndex,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiSemanticIndex' },
  )
/** Subscribes to progress events for staged semantic index rebuilds and syncs. */
export const listenToLocalizationSemanticProgress = (listener: (progress: AiSemanticProgress) => void) =>
  getPlatformPorts().hostEvents.listen<AiSemanticProgress>(SEMANTIC_PROGRESS_EVENT, listener)
/** Tests connectivity to a remote semantic embedding profile. */
export const testLocalizationSemanticRemoteProfile = (profileId: string) =>
  invokeDesktop<AiSemanticConnectionTestResult>(
    HOST_COMMANDS.testLocalizationSemanticRemoteProfile,
    { request: { profileId } },
    { kind: 'serviceGate', key: `semantic-profile-test:${profileId}` },
  )

/** Routes a workbench translation through the unified localization orchestrator. */
export function translateLocalizationBatch(request: LocalizationTranslateBatchRequest) {
  return invokeDesktop<LocalizationTranslateBatchResult>(
    HOST_COMMANDS.translateLocalizationBatch,
    { request },
    { kind: 'parallelPool', pool: 'ai-localization', limit: 2 },
  )
}

/** Subscribes to progress for staged official XNB index rebuilds. */
export function listenToOfficialLocalizationIndexProgress(listener: (progress: AiOfficialIndexProgress) => void) {
  return getPlatformPorts().hostEvents.listen<AiOfficialIndexProgress>(OFFICIAL_INDEX_PROGRESS_EVENT, listener)
}

/** Checks XNB source metadata against the active official corpus generation. */
export function inspectOfficialLocalizationIndex(gameDirectory: string) {
  return invokeDesktop<AiOfficialCorpusStatus>(
    HOST_COMMANDS.inspectOfficialLocalizationIndex,
    { request: { gameDirectory } },
    { kind: 'latest', key: 'official-localization-status' },
  )
}
/** Builds a staged XNB corpus generation without occupying normal mutation workers. */
export function rebuildOfficialLocalizationIndex(request: RebuildOfficialLocalizationIndexRequest) {
  return invokeDesktop<AiOfficialCorpusStatus>(
    HOST_COMMANDS.rebuildOfficialLocalizationIndex,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiOfficialLocalizationIndex' },
  )
}
/** Searches the active generation for an aligned locale pair. */
export function searchOfficialLocalization(request: SearchOfficialLocalizationRequest) {
  return invokeDesktop<AiOfficialSearchPage>(
    HOST_COMMANDS.searchOfficialLocalization,
    { request },
    { kind: 'keyedLatest', key: 'official-localization-search' },
  )
}
/** Cooperatively cancels a localization index, translation, or review job. */
export function cancelLocalizationJob(jobId: string) {
  return invokeDesktop<void>(HOST_COMMANDS.cancelLocalizationJob, { jobId }, { kind: 'serviceGate', key: `localization-cancel:${jobId}` })
}

/** Atomically creates or reuses a plan, persists its defaults, and optionally learns one locale file. */
export const initializeLocalizationPlan = (request: InitializeLocalizationPlanRequest) =>
  invokeDesktop<InitializeLocalizationPlanResult>(
    HOST_COMMANDS.initializeLocalizationPlan,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiLocalizationKnowledge' },
  )

/** Acquires one active translation-workflow lease and warms the local semantic runtime. */
export const acquireLocalizationSemanticRuntime = (leaseId: string) =>
  invokeDesktop<void>(
    HOST_COMMANDS.acquireLocalizationSemanticRuntime,
    { leaseId },
    { kind: 'queuedMutation', queue: 'AiSemanticRuntimeLease' },
  )

/** Releases a workflow lease; the backend unloads after the shared idle timeout. */
export const releaseLocalizationSemanticRuntime = (leaseId: string) =>
  invokeDesktop<void>(
    HOST_COMMANDS.releaseLocalizationSemanticRuntime,
    { leaseId },
    { kind: 'queuedMutation', queue: 'AiSemanticRuntimeLease' },
  )

/** Immediately unloads the local ONNX session and in-memory vector generation. */
export const unloadLocalizationSemanticRuntime = () =>
  invokeDesktop<void>(HOST_COMMANDS.unloadLocalizationSemanticRuntime, {}, { kind: 'exclusiveMutation', resource: 'AiSemanticRuntime' })

/** Returns the effective knowledge shown beside one translation unit. */
export const inspectLocalizationContext = (request: InspectLocalizationContextRequest) =>
  invokeDesktop<LocalizationContextInspection>(
    HOST_COMMANDS.inspectLocalizationContext,
    { request },
    {
      kind: 'keyedLatest',
      key: `localization-context:${request.scopeId}:${request.sourceLocale}:${request.targetLocale}:${request.unitKey ?? ''}`,
    },
  )

/** Resolves or creates a knowledge profile for a given binding, returning the scope snapshot. */
export const resolveLocalizationScope = (request: ResolveLocalizationScopeRequest) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.resolveLocalizationScope,
    { request },
    { kind: 'queuedMutation', queue: 'AiLocalizationKnowledge' },
  )
/** Creates a standalone knowledge profile without any project binding. */
export const createLocalizationProfile = (name: string) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.createLocalizationProfile,
    { name },
    { kind: 'queuedMutation', queue: 'AiLocalizationKnowledge' },
  )
/** Renames a knowledge profile; the global scope is rejected by the backend. */
export const renameLocalizationProfile = (scopeId: string, name: string) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.renameLocalizationProfile,
    { scopeId, name },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
/** Deletes a knowledge profile together with its terms, memory, and style settings. */
export const deleteLocalizationProfile = (scopeId: string) =>
  invokeDesktop<void>(
    HOST_COMMANDS.deleteLocalizationProfile,
    { scopeId },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
/** Moves one project binding to the given profile, detaching it from any previous owner. */
export const setLocalizationProfileBinding = (scopeId: string, bindingKind: string, bindingValue: string) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.setLocalizationProfileBinding,
    { scopeId, bindingKind, bindingValue },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
/** Detaches one project binding from whichever profile currently owns it. */
export const removeLocalizationProfileBinding = (bindingKind: string, bindingValue: string) =>
  invokeDesktop<void>(
    HOST_COMMANDS.removeLocalizationProfileBinding,
    { bindingKind, bindingValue },
    { kind: 'queuedMutation', queue: 'AiLocalizationKnowledge' },
  )
/** Lists knowledge profiles paginated by query and offset. */
export const listLocalizationScopes = (request: ListLocalizationScopesRequest) =>
  invokeDesktop<AiLocalizationScopePage>(
    HOST_COMMANDS.listLocalizationScopes,
    { request },
    { kind: 'keyedLatest', key: `localization-scopes:${request.query ?? ''}:${request.offset}` },
  )
/** Loads the full scope snapshot (metadata + settings) for one knowledge profile. */
export const loadLocalizationScope = (scopeId: string) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.loadLocalizationScope,
    { request: { scopeId } },
    { kind: 'keyedLatest', key: `localization-scope:${scopeId}` },
  )
/** Persists scope-level knowledge policy and QA configuration. */
export const saveLocalizationScopeSettings = (settings: LocalizationScopeSettings) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.saveLocalizationScopeSettings,
    { request: { settings } },
    { kind: 'queuedMutation', queue: `localization-scope:${settings.scopeId}` },
  )
/** Lists glossary entries for a scope, filtered by locale pair and optional query. */
export const listLocalizationGlossary = (request: SearchLocalizationKnowledgeRequest) =>
  invokeDesktop<AiGlossaryPage>(
    HOST_COMMANDS.listLocalizationGlossaryEntries,
    { request },
    { kind: 'keyedLatest', key: `localization-glossary:${JSON.stringify(request)}` },
  )
/** Inserts or updates glossary entries within a scope, returning the first page. */
export const upsertLocalizationGlossary = (scopeId: string, entries: AiGlossaryEntry[]) =>
  invokeDesktop<AiGlossaryPage>(
    HOST_COMMANDS.upsertLocalizationGlossaryEntries,
    { request: { scopeId, entries } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
/** Deletes glossary entries by ID within a scope, returning the removed count. */
export const deleteLocalizationGlossary = (scopeId: string, ids: string[]) =>
  invokeDesktop<number>(
    HOST_COMMANDS.deleteLocalizationGlossaryEntries,
    { request: { scopeId, ids } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
/** Loads the style guide for a scope and target locale, or null when unset. */
export const loadLocalizationStyle = (scopeId: string, targetLocale: string) =>
  invokeDesktop<AiStyleGuide | null>(
    HOST_COMMANDS.loadLocalizationStyleGuide,
    { request: { scopeId, targetLocale } },
    { kind: 'keyedLatest', key: `localization-style:${scopeId}:${targetLocale}` },
  )
/** Persists the style guide for a scope and target locale. */
export const saveLocalizationStyle = (guide: AiStyleGuide) =>
  invokeDesktop<AiStyleGuide>(
    HOST_COMMANDS.saveLocalizationStyleGuide,
    { guide },
    { kind: 'queuedMutation', queue: `localization-scope:${guide.scopeId}` },
  )
/** Searches translation memory entries for a scope, filtered by locale pair and optional query. */
export const searchTranslationMemory = (request: SearchLocalizationKnowledgeRequest) =>
  invokeDesktop<AiTranslationMemoryPage>(
    HOST_COMMANDS.searchTranslationMemory,
    { request },
    { kind: 'keyedLatest', key: `translation-memory:${JSON.stringify(request)}` },
  )
/** Records confirmed translations into the scope's translation memory. */
export const recordConfirmedTranslations = (request: RecordConfirmedTranslationsRequest) =>
  invokeDesktop<number>(
    HOST_COMMANDS.recordConfirmedTranslations,
    { request },
    { kind: 'queuedMutation', queue: `localization-scope:${request.scopeId}` },
  )
/** Deletes translation memory entries by ID within a scope, returning the removed count. */
export const deleteTranslationMemory = (scopeId: string, ids: string[]) =>
  invokeDesktop<number>(
    HOST_COMMANDS.deleteTranslationMemoryEntries,
    { request: { scopeId, ids } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
/** Copies translation memory entries from one scope to another, returning the copied count. */
export const copyTranslationMemory = (sourceScopeId: string, targetScopeId: string, ids: string[]) =>
  invokeDesktop<number>(
    HOST_COMMANDS.copyTranslationMemoryEntries,
    { request: { sourceScopeId, targetScopeId, ids } },
    { kind: 'queuedMutation', queue: `localization-scope:${targetScopeId}` },
  )
/** Imports glossary, memory and style data from a knowledge transfer document. */
export const importLocalizationKnowledge = (request: ImportLocalizationKnowledgeRequest) =>
  invokeDesktop<LocalizationKnowledgeTransferResult>(
    HOST_COMMANDS.importLocalizationKnowledge,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiLocalizationKnowledge' },
  )
/** Exports glossary, memory and style data into a knowledge transfer document. */
export const exportLocalizationKnowledge = (request: ExportLocalizationKnowledgeRequest) =>
  invokeDesktop<LocalizationKnowledgeTransferResult>(
    HOST_COMMANDS.exportLocalizationKnowledge,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiLocalizationKnowledge' },
  )
/** Loads the current machine translation provider profiles and presets. */
export const loadMachineTranslationSettings = () =>
  invokeDesktop<MachineTranslationSettingsSnapshot>(
    HOST_COMMANDS.loadMachineTranslationSettings,
    {},
    { kind: 'parallelPool', pool: 'settings-read', limit: 4 },
  )
/** Persists machine translation provider profiles after Rust validates credentials. */
export const saveMachineTranslationSettings = (request: SaveMachineTranslationSettingsRequest) =>
  invokeDesktop<MachineTranslationSettingsSnapshot>(
    HOST_COMMANDS.saveMachineTranslationSettings,
    { request },
    { kind: 'queuedMutation', queue: 'MachineTranslationSettings' },
  )
/** Lists the language pairs supported by a machine translation profile. */
export const listMachineTranslationLanguages = (profileId: string) =>
  invokeDesktop<MachineTranslationLanguage[]>(
    HOST_COMMANDS.listMachineTranslationLanguages,
    { request: { profileId } },
    { kind: 'keyedLatest', key: `machine-translation-languages:${profileId}` },
  )
/** Tests connectivity to a machine translation profile with a small probe request. */
export const testMachineTranslationProfile = (profileId: string) =>
  invokeDesktop<MachineTranslationProfileTestResult>(
    HOST_COMMANDS.testMachineTranslationProfile,
    { request: { profileId } },
    { kind: 'serviceGate', key: `machine-translation-test:${profileId}` },
  )
/** Runs a machine translation batch through the configured provider profile. */
export const translateMachineTranslationBatch = (request: MachineTranslateBatchRequest) =>
  invokeDesktop<MachineTranslateBatchResult>(
    HOST_COMMANDS.translateMachineTranslationBatch,
    { request },
    { kind: 'parallelPool', pool: 'localization-translation', limit: 2 },
  )
/** Runs an AI review batch over translated units, returning issues and usage metadata. */
export const reviewLocalizationBatch = (request: AiReviewRequest) =>
  invokeDesktop<AiReviewResult>(
    HOST_COMMANDS.reviewLocalizationBatch,
    { request },
    { kind: 'parallelPool', pool: 'localization-review', limit: 2 },
  )
/** Lists review runs for a scope, paginated by offset. */
export const listLocalizationReviewRuns = (request: ListReviewRunsRequest) =>
  invokeDesktop<AiReviewRunPage>(
    HOST_COMMANDS.listLocalizationReviewRuns,
    { request },
    { kind: 'keyedLatest', key: `localization-review-runs:${request.scopeId}:${request.offset}` },
  )
/** Loads one review run with its issues and usage record state. */
export const loadLocalizationReviewRun = (runId: string) =>
  invokeDesktop<AiReviewResult>(
    HOST_COMMANDS.loadLocalizationReviewRun,
    { request: { runId } },
    { kind: 'keyedLatest', key: `localization-review-run:${runId}` },
  )
/** Updates issue statuses (open, ignored, accepted) for one review run. */
export const updateLocalizationReviewIssues = (request: UpdateReviewIssuesRequest) =>
  invokeDesktop<AiReviewResult>(
    HOST_COMMANDS.updateLocalizationReviewIssues,
    { request },
    { kind: 'queuedMutation', queue: `localization-review:${request.runId}` },
  )
