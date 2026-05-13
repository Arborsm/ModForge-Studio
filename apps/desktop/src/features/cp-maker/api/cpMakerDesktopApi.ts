import { createPromiseCache, readCached, readPending } from '@shared/lib/desktop/cache'
import { invokeDesktop } from '@shared/lib/desktop/runtime'
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

/** Lists saved CP Maker drafts without loading their full editor payload. */
export function listCpMakerDrafts() {
  return readCached(cpMakerDraftsCache, 'default', () =>
    invokeDesktop<CpMakerDraftSummary[]>('list_cp_maker_drafts'),
  )
}

/** Loads one CP Maker draft by its persistent storage key. */
export function loadCpMakerDraft(storageKey: string) {
  return readPending(cpMakerDraftCache, storageKey, () =>
    invokeDesktop<CpMakerDraftRecord>('load_cp_maker_draft', { draftStorageKey: storageKey }),
  )
}

/** Persists a CP Maker draft and invalidates draft list/detail caches. */
export function saveCpMakerDraft(draft: CpMakerDraftRecord) {
  const cacheKey = draft.draftStorageKey
  cpMakerDraftCache.delete(cacheKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>('save_cp_maker_draft', { draft })
}

/** Deletes a CP Maker draft and invalidates draft caches. */
export function deleteCpMakerDraft(storageKey: string) {
  cpMakerDraftCache.delete(storageKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<void>('delete_cp_maker_draft', { draftStorageKey: storageKey })
}

/** Duplicates an existing draft and returns the new draft record. */
export function copyCpMakerDraft(request: CopyCpMakerDraftRequest) {
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>('copy_cp_maker_draft', { request })
}

/** Writes a CP Maker draft out as a Content Patcher content pack. */
export function exportCpMakerPack(request: CpMakerExportRequest) {
  return invokeDesktop<CpMakerExportResult>('export_cp_maker_pack', { request })
}

/** Builds a virtual map asset preview from the current map document. */
export function buildCpMakerMapAsset(request: BuildCpMakerMapAssetRequest) {
  return invokeDesktop<VirtualPreviewAsset>('build_cp_maker_map_asset', { request })
}

/** Imports an existing Content Patcher pack directory into a CP Maker draft. */
export function importCpMakerPack(modDirectoryPath: string) {
  return invokeDesktop<CpMakerDraftRecord>('import_cp_maker_pack', { modDirectoryPath })
}
