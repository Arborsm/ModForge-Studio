import { HOST_COMMANDS } from '@platform/host-commands'
import { createPromiseCache, readCached, readPending } from '@shared/lib/cache'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'
import type {
  BuildCpMakerMapAssetRequest,
  BuildCpMakerMapAssetResult,
  CopyCpMakerDraftRequest,
  CpMakerDraftRecord,
  CpMakerDraftSummary,
  CpMakerExportRequest,
  CpMakerExportResult,
  CpMakerSession,
  DeleteProjectAssetRequest,
  ImportProjectAssetsRequest,
  ProjectAssetPayload,
  ProjectAssetRef,
  ProjectMapAssetContent,
  ReadProjectAssetRequest,
  RenameProjectAssetRequest,
  WriteProjectAssetRequest,
  WriteProjectAssetsRequest,
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

/** Loads the lightweight active-project session stored beside draft records. */
export function loadCpMakerSession() {
  return invokeDesktop<CpMakerSession>(HOST_COMMANDS.loadCpMakerSession, undefined, cpMakerDraftIoPolicy)
}

/** Persists active CP Maker draft keys using the draft resource lock. */
export function saveCpMakerSession(session: CpMakerSession) {
  return invokeDesktop<CpMakerSession>(HOST_COMMANDS.saveCpMakerSession, { session }, cpMakerDraftExclusivePolicy)
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
  return invokeDesktop<BuildCpMakerMapAssetResult>(HOST_COMMANDS.buildCpMakerMapAsset, { request }, cpMakerPreviewPoolPolicy)
}

/** Imports an existing Content Patcher pack directory into a CP Maker draft. */
export function importCpMakerPack(modDirectoryPath: string) {
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.importCpMakerPack, { modDirectoryPath }, cpMakerDraftExclusivePolicy)
}

/** Reads one persisted project asset only when a preview or editor requests its bytes. */
export function readCpMakerProjectAsset(request: ReadProjectAssetRequest) {
  return invokeDesktop<ProjectAssetPayload>(
    HOST_COMMANDS.readCpMakerProjectAsset,
    { request },
    { kind: 'keyedLatest', key: `cp-maker-project-asset:${request.draftStorageKey}:${request.relativePath.toLowerCase()}` },
  )
}

/** Parses one persisted TMX, TBin, or XNB map with dependencies resolved inside the project store. */
export function loadCpMakerProjectMapAsset(request: ReadProjectAssetRequest) {
  return invokeDesktop<ProjectMapAssetContent>(
    HOST_COMMANDS.loadCpMakerProjectMapAsset,
    { request },
    { kind: 'keyedLatest', key: `cp-maker-project-map:${request.draftStorageKey}:${request.relativePath.toLowerCase()}` },
  )
}

/** Atomically writes one project asset and updates its persisted lightweight ref. */
export function writeCpMakerProjectAsset(request: WriteProjectAssetRequest) {
  cpMakerDraftCache.delete(request.draftStorageKey)
  return invokeDesktop<ProjectAssetRef>(HOST_COMMANDS.writeCpMakerProjectAsset, { request }, cpMakerDraftQueuePolicy)
}

/** Atomically writes a related set of project assets and persists all refs together. */
export function writeCpMakerProjectAssets(request: WriteProjectAssetsRequest) {
  cpMakerDraftCache.delete(request.draftStorageKey)
  return invokeDesktop<ProjectAssetRef[]>(HOST_COMMANDS.writeCpMakerProjectAssets, { request }, cpMakerDraftQueuePolicy)
}

/** Streams selected host files or directories into persistent project storage. */
export function importCpMakerProjectAssets(request: ImportProjectAssetsRequest) {
  cpMakerDraftCache.delete(request.draftStorageKey)
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.importCpMakerProjectAssets, { request }, cpMakerDraftQueuePolicy)
}

/** Atomically renames a project asset and updates persisted project references. */
export function renameCpMakerProjectAsset(request: RenameProjectAssetRequest) {
  cpMakerDraftCache.delete(request.draftStorageKey)
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.renameCpMakerProjectAsset, { request }, cpMakerDraftQueuePolicy)
}

/** Deletes a project asset and clears persisted references after the user confirms the operation. */
export function deleteCpMakerProjectAsset(request: DeleteProjectAssetRequest) {
  cpMakerDraftCache.delete(request.draftStorageKey)
  return invokeDesktop<CpMakerDraftRecord>(HOST_COMMANDS.deleteCpMakerProjectAsset, { request }, cpMakerDraftQueuePolicy)
}
