import { HOST_COMMANDS } from '@platform/host-commands'
import { createPromiseCache, readCached, readPending } from '@shared/lib/cache'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'
import type {
  BuildCpMakerMapAssetRequest,
  CopyCpMakerDraftRequest,
  CpMakerDraftRecord,
  CpMakerDraftSummary,
  CpMakerExportRequest,
  CpMakerExportResult,
  VirtualPreviewAsset,
} from './types'
const cpMakerDraftsCache = createPromiseCache<CpMakerDraftSummary[]>()
const cpMakerDraftCache = createPromiseCache<CpMakerDraftRecord>()

const cpMakerDraftQueuePolicy = { kind: 'queuedMutation', queue: 'CpMakerDrafts' } satisfies HostCommandPolicy
const cpMakerDraftExclusivePolicy = { kind: 'exclusiveMutation', resource: 'CpMakerDrafts' } satisfies HostCommandPolicy
const cpMakerDraftIoPolicy = { kind: 'parallelPool', pool: 'cp-maker-drafts', limit: 2 } satisfies HostCommandPolicy
const cpMakerPreviewPoolPolicy = { kind: 'parallelPool', pool: 'cp-maker-preview', limit: 2 } satisfies HostCommandPolicy

/** Lists saved CP Maker drafts without loading their full editor payload. */
export function listCpMakerDrafts() {
  return readCached(cpMakerDraftsCache, 'default', () =>
    invokeDesktop<CpMakerDraftSummary[]>(HOST_COMMANDS.listCpMakerDrafts, undefined, cpMakerDraftIoPolicy),
  )
}

/** Loads one CP Maker draft by its persistent storage key. */
export function loadCpMakerDraft(storageKey: string) {
  return readPending(cpMakerDraftCache, storageKey, () =>
    invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.loadCpMakerDraft, { draftStorageKey: storageKey }, cpMakerDraftIoPolicy),
  )
}

/** Persists a CP Maker draft and invalidates draft list/detail caches. */
export function saveCpMakerDraft(draft: CpMakerDraftRecord) {
  const cacheKey = draft.draftStorageKey
  cpMakerDraftCache.delete(cacheKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.saveCpMakerDraft, { draft }, cpMakerDraftQueuePolicy)
}

/** Deletes a CP Maker draft and invalidates draft caches. */
export function deleteCpMakerDraft(storageKey: string) {
  cpMakerDraftCache.delete(storageKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<void>(HOST_COMMANDS.deleteCpMakerDraft, { draftStorageKey: storageKey }, cpMakerDraftQueuePolicy)
}

/** Duplicates an existing draft and returns the new draft record. */
export function copyCpMakerDraft(request: CopyCpMakerDraftRequest) {
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.copyCpMakerDraft, { request }, cpMakerDraftQueuePolicy)
}

/** Writes a CP Maker draft out as a Content Patcher content pack. */
export function exportCpMakerPack(request: CpMakerExportRequest) {
  return invokeDesktop<CpMakerExportResult>(HOST_COMMANDS.exportCpMakerPack, { request }, cpMakerDraftExclusivePolicy)
}

/** Builds a virtual map asset preview from the current map document. */
export function buildCpMakerMapAsset(request: BuildCpMakerMapAssetRequest) {
  return invokeDesktop<VirtualPreviewAsset>(HOST_COMMANDS.buildCpMakerMapAsset, { request }, cpMakerPreviewPoolPolicy)
}

/** Imports an existing Content Patcher pack directory into a CP Maker draft. */
export function importCpMakerPack(modDirectoryPath: string) {
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.importCpMakerPack, { modDirectoryPath }, cpMakerDraftExclusivePolicy)
}
