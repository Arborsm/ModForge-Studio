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

export function listCpMakerDrafts() {
  return readCached(cpMakerDraftsCache, 'default', () =>
    invokeDesktop<CpMakerDraftSummary[]>('list_cp_maker_drafts'),
  )
}

export function loadCpMakerDraft(storageKey: string) {
  return readPending(cpMakerDraftCache, storageKey, () =>
    invokeDesktop<CpMakerDraftRecord>('load_cp_maker_draft', { draftStorageKey: storageKey }),
  )
}

export function saveCpMakerDraft(draft: CpMakerDraftRecord) {
  const cacheKey = draft.draftStorageKey
  cpMakerDraftCache.delete(cacheKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>('save_cp_maker_draft', { draft })
}

export function deleteCpMakerDraft(storageKey: string) {
  cpMakerDraftCache.delete(storageKey)
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<void>('delete_cp_maker_draft', { draftStorageKey: storageKey })
}

export function copyCpMakerDraft(request: CopyCpMakerDraftRequest) {
  cpMakerDraftsCache.delete('default')
  return invokeDesktop<CpMakerDraftRecord>('copy_cp_maker_draft', { request })
}

export function exportCpMakerPack(request: CpMakerExportRequest) {
  return invokeDesktop<CpMakerExportResult>('export_cp_maker_pack', { request })
}

export function buildCpMakerMapAsset(request: BuildCpMakerMapAssetRequest) {
  return invokeDesktop<VirtualPreviewAsset>('build_cp_maker_map_asset', { request })
}

export function importCpMakerPack(modDirectoryPath: string) {
  return invokeDesktop<CpMakerDraftRecord>('import_cp_maker_pack', { modDirectoryPath })
}
