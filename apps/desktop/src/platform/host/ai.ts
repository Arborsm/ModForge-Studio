import type {
  AiModelInfo,
  AiProfileTestResult,
  AiSettingsSnapshot,
  AiTranslateBatchRequest,
  AiTranslateBatchResult,
  AiTranslationCacheEntry,
  AiTranslationCacheStats,
  AiTranslationProgressPayload,
  AiTranslationStreamPayload,
  SaveAiSettingsRequest,
  ExportAiProfilesRequest,
  AiProfileImportConflictPolicy,
  AiProfileImportPreview,
  AiProfileImportResult,
  ModelsDevCatalog,
} from '@shared/contracts'
import { HOST_COMMANDS } from '@platform/host-commands'
import { getPlatformPorts, invokeDesktop } from './runtime'

const AI_PROGRESS_EVENT = 'ai://translation-progress'
const AI_STREAM_EVENT = 'ai://translation-stream'

/** Loads sanitized AI profiles and provider presets without exposing credentials. */
export function loadAiSettings() {
  return invokeDesktop<AiSettingsSnapshot>(HOST_COMMANDS.loadAiSettings, undefined, {
    kind: 'parallelPool',
    pool: 'settings-read',
    limit: 4,
  })
}

/** Persists AI profiles and credential patches serially. */
export function saveAiSettings(request: SaveAiSettingsRequest) {
  return invokeDesktop<AiSettingsSnapshot>(HOST_COMMANDS.saveAiSettings, { request }, { kind: 'queuedMutation', queue: 'AiSettings' })
}

/** Exports sanitized provider profiles; credentials never enter the document. */
export function exportAiProfiles(request: ExportAiProfilesRequest) {
  return invokeDesktop<number>(HOST_COMMANDS.exportAiProfiles, { request }, { kind: 'exclusiveMutation', resource: 'AiProfileExport' })
}

/** Parses and validates a profile document without mutating settings. */
export function previewAiProfilesImport(sourcePath: string) {
  return invokeDesktop<AiProfileImportPreview>(
    HOST_COMMANDS.previewAiProfilesImport,
    { request: { sourcePath } },
    { kind: 'latest', key: `ai-profile-import:${sourcePath}` },
  )
}

/** Applies an already previewed profile document through Rust settings validation. */
export function applyAiProfilesImport(sourcePath: string, conflictPolicy: AiProfileImportConflictPolicy) {
  return invokeDesktop<AiProfileImportResult>(
    HOST_COMMANDS.applyAiProfilesImport,
    { request: { sourcePath, conflictPolicy } },
    { kind: 'exclusiveMutation', resource: 'AiSettings' },
  )
}

/** Lists models exposed by a configured provider profile. */
export function listAiModels(profileId: string) {
  return invokeDesktop<AiModelInfo[]>(
    HOST_COMMANDS.listAiModels,
    { request: { profileId } },
    { kind: 'keyedLatest', key: `ai-models:${profileId}` },
  )
}

/**
 * Fetches the models.dev catalog through the backend Network lane with a
 * memory/disk TTL cache, so repeated dialog opens never re-download the full
 * catalog. Keyed latest keeps concurrent opens on a single in-flight request.
 */
export function fetchAiModelsDevCatalog() {
  return invokeDesktop<ModelsDevCatalog>(HOST_COMMANDS.fetchAiModelsDevCatalog, undefined, {
    kind: 'keyedLatest',
    key: 'ai-models-dev-catalog',
  })
}

/** Executes a small end-to-end inference probe for one saved profile. */
export function testAiProfile(profileId: string) {
  return invokeDesktop<AiProfileTestResult>(
    HOST_COMMANDS.testAiProfile,
    { request: { profileId } },
    { kind: 'serviceGate', key: `ai-test:${profileId}` },
  )
}

/** Runs a bounded translation batch through the dedicated backend AI pool. */
export function translateAiBatch(request: AiTranslateBatchRequest) {
  return invokeDesktop<AiTranslateBatchResult>(
    HOST_COMMANDS.translateAiBatch,
    { request },
    { kind: 'parallelPool', pool: 'ai-translation', limit: 2 },
  )
}

/** Requests cooperative cancellation without queueing behind the active translation. */
export function cancelAiJob(jobId: string) {
  return invokeDesktop<void>(HOST_COMMANDS.cancelAiJob, { request: { jobId } }, { kind: 'serviceGate', key: `ai-cancel:${jobId}` })
}

/** Subscribes to backend translation progress events. */
export function listenToAiProgress(listener: (payload: AiTranslationProgressPayload) => void) {
  return getPlatformPorts().hostEvents.listen<AiTranslationProgressPayload>(AI_PROGRESS_EVENT, listener)
}

/** Subscribes to backend streaming translation deltas (content + reasoning). */
export function listenToAiStream(listener: (payload: AiTranslationStreamPayload) => void) {
  return getPlatformPorts().hostEvents.listen<AiTranslationStreamPayload>(AI_STREAM_EVENT, listener)
}

export function readAiTranslationCache(request: Pick<AiTranslationCacheEntry, 'scopeKey' | 'targetLocale' | 'sourceHash'>) {
  return invokeDesktop<AiTranslationCacheEntry | null>(
    HOST_COMMANDS.readAiTranslationCache,
    { request },
    { kind: 'keyedLatest', key: `ai-cache:${request.scopeKey}:${request.targetLocale}` },
  )
}

export function writeAiTranslationCache(entry: AiTranslationCacheEntry) {
  return invokeDesktop<AiTranslationCacheEntry>(
    HOST_COMMANDS.writeAiTranslationCache,
    { entry },
    { kind: 'queuedMutation', queue: 'AiTranslationCache' },
  )
}

export function getAiTranslationCacheStats() {
  return invokeDesktop<AiTranslationCacheStats>(HOST_COMMANDS.getAiTranslationCacheStats, undefined, {
    kind: 'latest',
    key: 'ai-cache-stats',
  })
}

export function clearAiTranslationCache() {
  return invokeDesktop<AiTranslationCacheStats>(HOST_COMMANDS.clearAiTranslationCache, undefined, {
    kind: 'exclusiveMutation',
    resource: 'AiTranslationCache',
  })
}
