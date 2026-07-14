import type {
  AiModelInfo,
  AiProfileTestResult,
  AiSettingsSnapshot,
  AiTranslateBatchRequest,
  AiTranslateBatchResult,
  AiTranslationCacheEntry,
  AiTranslationCacheStats,
  AiTranslationProgressPayload,
  SaveAiSettingsRequest,
} from '@shared/contracts'
import { HOST_COMMANDS } from '@platform/host-commands'
import { getPlatformPorts, invokeDesktop } from './runtime'

const AI_PROGRESS_EVENT = 'ai://translation-progress'

/** Loads sanitized AI profiles and provider presets without exposing credentials. */
export function loadAiSettings() {
  return invokeDesktop<AiSettingsSnapshot>(HOST_COMMANDS.loadAiSettings, undefined, { kind: 'latest', key: 'ai-settings' })
}

/** Persists AI profiles and credential patches serially. */
export function saveAiSettings(request: SaveAiSettingsRequest) {
  return invokeDesktop<AiSettingsSnapshot>(HOST_COMMANDS.saveAiSettings, { request }, { kind: 'queuedMutation', queue: 'AiSettings' })
}

/** Lists models exposed by a configured provider profile. */
export function listAiModels(profileId: string) {
  return invokeDesktop<AiModelInfo[]>(
    HOST_COMMANDS.listAiModels,
    { request: { profileId } },
    { kind: 'keyedLatest', key: `ai-models:${profileId}` },
  )
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
