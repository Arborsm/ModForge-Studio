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
} from '@shared/contracts'
import { HOST_COMMANDS } from '@platform/host-commands'
import { getPlatformPorts, invokeDesktop } from './runtime'

const OFFICIAL_INDEX_PROGRESS_EVENT = 'localization://official-index-progress'

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

export const resolveLocalizationScope = (request: ResolveLocalizationScopeRequest) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.resolveLocalizationScope,
    { request },
    { kind: 'queuedMutation', queue: 'AiLocalizationKnowledge' },
  )
export const rebindLocalizationScope = (scopeId: string, bindingKind: string, bindingValue: string) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.rebindLocalizationScope,
    { request: { scopeId, bindingKind, bindingValue } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
export const listLocalizationScopes = (request: ListLocalizationScopesRequest) =>
  invokeDesktop<AiLocalizationScopePage>(
    HOST_COMMANDS.listLocalizationScopes,
    { request },
    { kind: 'keyedLatest', key: `localization-scopes:${request.query ?? ''}:${request.offset}` },
  )
export const loadLocalizationScope = (scopeId: string) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.loadLocalizationScope,
    { request: { scopeId } },
    { kind: 'keyedLatest', key: `localization-scope:${scopeId}` },
  )
export const saveLocalizationScopeSettings = (settings: LocalizationScopeSettings) =>
  invokeDesktop<AiLocalizationScopeSnapshot>(
    HOST_COMMANDS.saveLocalizationScopeSettings,
    { request: { settings } },
    { kind: 'queuedMutation', queue: `localization-scope:${settings.scopeId}` },
  )
export const listLocalizationGlossary = (request: SearchLocalizationKnowledgeRequest) =>
  invokeDesktop<AiGlossaryPage>(
    HOST_COMMANDS.listLocalizationGlossaryEntries,
    { request },
    { kind: 'keyedLatest', key: `localization-glossary:${JSON.stringify(request)}` },
  )
export const upsertLocalizationGlossary = (scopeId: string, entries: AiGlossaryEntry[]) =>
  invokeDesktop<AiGlossaryPage>(
    HOST_COMMANDS.upsertLocalizationGlossaryEntries,
    { request: { scopeId, entries } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
export const deleteLocalizationGlossary = (scopeId: string, ids: string[]) =>
  invokeDesktop<number>(
    HOST_COMMANDS.deleteLocalizationGlossaryEntries,
    { request: { scopeId, ids } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
export const loadLocalizationStyle = (scopeId: string, targetLocale: string) =>
  invokeDesktop<AiStyleGuide | null>(
    HOST_COMMANDS.loadLocalizationStyleGuide,
    { request: { scopeId, targetLocale } },
    { kind: 'keyedLatest', key: `localization-style:${scopeId}:${targetLocale}` },
  )
export const saveLocalizationStyle = (guide: AiStyleGuide) =>
  invokeDesktop<AiStyleGuide>(
    HOST_COMMANDS.saveLocalizationStyleGuide,
    { guide },
    { kind: 'queuedMutation', queue: `localization-scope:${guide.scopeId}` },
  )
export const searchTranslationMemory = (request: SearchLocalizationKnowledgeRequest) =>
  invokeDesktop<AiTranslationMemoryPage>(
    HOST_COMMANDS.searchTranslationMemory,
    { request },
    { kind: 'keyedLatest', key: `translation-memory:${JSON.stringify(request)}` },
  )
export const recordConfirmedTranslations = (request: RecordConfirmedTranslationsRequest) =>
  invokeDesktop<number>(
    HOST_COMMANDS.recordConfirmedTranslations,
    { request },
    { kind: 'queuedMutation', queue: `localization-scope:${request.scopeId}` },
  )
export const deleteTranslationMemory = (scopeId: string, ids: string[]) =>
  invokeDesktop<number>(
    HOST_COMMANDS.deleteTranslationMemoryEntries,
    { request: { scopeId, ids } },
    { kind: 'queuedMutation', queue: `localization-scope:${scopeId}` },
  )
export const copyTranslationMemory = (sourceScopeId: string, targetScopeId: string, ids: string[]) =>
  invokeDesktop<number>(
    HOST_COMMANDS.copyTranslationMemoryEntries,
    { request: { sourceScopeId, targetScopeId, ids } },
    { kind: 'queuedMutation', queue: `localization-scope:${targetScopeId}` },
  )
export const importLocalizationKnowledge = (request: ImportLocalizationKnowledgeRequest) =>
  invokeDesktop<LocalizationKnowledgeTransferResult>(
    HOST_COMMANDS.importLocalizationKnowledge,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiLocalizationKnowledge' },
  )
export const exportLocalizationKnowledge = (request: ExportLocalizationKnowledgeRequest) =>
  invokeDesktop<LocalizationKnowledgeTransferResult>(
    HOST_COMMANDS.exportLocalizationKnowledge,
    { request },
    { kind: 'exclusiveMutation', resource: 'AiLocalizationKnowledge' },
  )
export const loadMachineTranslationSettings = () =>
  invokeDesktop<MachineTranslationSettingsSnapshot>(
    HOST_COMMANDS.loadMachineTranslationSettings,
    {},
    { kind: 'latest', key: 'machine-translation-settings' },
  )
export const saveMachineTranslationSettings = (request: SaveMachineTranslationSettingsRequest) =>
  invokeDesktop<MachineTranslationSettingsSnapshot>(
    HOST_COMMANDS.saveMachineTranslationSettings,
    { request },
    { kind: 'queuedMutation', queue: 'MachineTranslationSettings' },
  )
export const listMachineTranslationLanguages = (profileId: string) =>
  invokeDesktop<MachineTranslationLanguage[]>(
    HOST_COMMANDS.listMachineTranslationLanguages,
    { request: { profileId } },
    { kind: 'keyedLatest', key: `machine-translation-languages:${profileId}` },
  )
export const testMachineTranslationProfile = (profileId: string) =>
  invokeDesktop<MachineTranslationProfileTestResult>(
    HOST_COMMANDS.testMachineTranslationProfile,
    { request: { profileId } },
    { kind: 'serviceGate', key: `machine-translation-test:${profileId}` },
  )
export const translateMachineTranslationBatch = (request: MachineTranslateBatchRequest) =>
  invokeDesktop<MachineTranslateBatchResult>(
    HOST_COMMANDS.translateMachineTranslationBatch,
    { request },
    { kind: 'parallelPool', pool: 'localization-translation', limit: 2 },
  )
export const reviewLocalizationBatch = (request: AiReviewRequest) =>
  invokeDesktop<AiReviewResult>(
    HOST_COMMANDS.reviewLocalizationBatch,
    { request },
    { kind: 'parallelPool', pool: 'localization-review', limit: 2 },
  )
export const listLocalizationReviewRuns = (request: ListReviewRunsRequest) =>
  invokeDesktop<AiReviewRunPage>(
    HOST_COMMANDS.listLocalizationReviewRuns,
    { request },
    { kind: 'keyedLatest', key: `localization-review-runs:${request.scopeId}:${request.offset}` },
  )
export const loadLocalizationReviewRun = (runId: string) =>
  invokeDesktop<AiReviewResult>(
    HOST_COMMANDS.loadLocalizationReviewRun,
    { request: { runId } },
    { kind: 'keyedLatest', key: `localization-review-run:${runId}` },
  )
export const updateLocalizationReviewIssues = (request: UpdateReviewIssuesRequest) =>
  invokeDesktop<AiReviewResult>(
    HOST_COMMANDS.updateLocalizationReviewIssues,
    { request },
    { kind: 'queuedMutation', queue: `localization-review:${request.runId}` },
  )
