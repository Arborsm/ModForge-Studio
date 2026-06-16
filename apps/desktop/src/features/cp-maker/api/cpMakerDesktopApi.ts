import { createPromiseCache, readCached, readPending } from '@shared/lib/desktop/cache'
import { invokeDesktop } from '@shared/lib/desktop/runtime'
import type { HostCommandPolicy } from '@shared/lib/host-command-client'
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
    invokeDesktop<CpMakerDraftSummary[]>('list_cp_maker_drafts', undefined, cpMakerDraftIoPolicy),
  )
}

/** Loads one CP Maker draft by its persistent storage key. */
export function loadCpMakerDraft(storageKey: string) {
  return readPending(cpMakerDraftCache, storageKey, () =>
    invokeDesktop<CpMakerDraftRecord>('load_cp_maker_draft', { draftStorageKey: storageKey }, cpMakerDraftIoPolicy),
  )
}

/** Persists a CP Maker draft and invalidates draft list/detail caches. */
export function saveCpMakerDraft(draft: CpMakerDraftRecord) {
  const cacheKey = draft.draftStorageKey
  cpMakerDraftCache.delete(cacheKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>('save_cp_maker_draft', { draft }, cpMakerDraftQueuePolicy)
}

/** Deletes a CP Maker draft and invalidates draft caches. */
export function deleteCpMakerDraft(storageKey: string) {
  cpMakerDraftCache.delete(storageKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<void>('delete_cp_maker_draft', { draftStorageKey: storageKey }, cpMakerDraftQueuePolicy)
}

/** Duplicates an existing draft and returns the new draft record. */
export function copyCpMakerDraft(request: CopyCpMakerDraftRequest) {
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>('copy_cp_maker_draft', { request }, cpMakerDraftQueuePolicy)
}

/** Writes a CP Maker draft out as a Content Patcher content pack. */
export function exportCpMakerPack(request: CpMakerExportRequest) {
  return invokeDesktop<CpMakerExportResult>('export_cp_maker_pack', { request }, cpMakerDraftExclusivePolicy)
}

/** Builds a virtual map asset preview from the current map document. */
export function buildCpMakerMapAsset(request: BuildCpMakerMapAssetRequest) {
  return invokeDesktop<VirtualPreviewAsset>('build_cp_maker_map_asset', { request }, cpMakerPreviewPoolPolicy)
}

/** Imports an existing Content Patcher pack directory into a CP Maker draft. */
export function importCpMakerPack(modDirectoryPath: string) {
  return invokeDesktop<CpMakerDraftRecord>('import_cp_maker_pack', { modDirectoryPath }, cpMakerDraftExclusivePolicy)
}
