import { scanEvents, scanMaps } from '@entities/game/api'
import { scanModProjects } from '@entities/mod/api'
import {
  copyCpMakerDraft,
  deleteCpMakerDraft,
  exportCpMakerPack,
  importCpMakerPack,
  listCpMakerDrafts,
  loadCpMakerDraft,
  loadCpMakerSession,
  saveCpMakerDraft,
  saveCpMakerSession,
} from '@features/cp-maker/api'
import type { CpMakerDraftRecord as CpMakerPortDraftRecord, CpMakerPort } from '@features/cp-maker/provider'
import type { CpMakerDraftRecord as CpMakerApiDraftRecord } from '@features/cp-maker/api'
import type { PlatformPorts } from '@shared/contracts'
import { loadImageDataUrl, loadMapAsset, loadTextAsset } from '@entities/game/api'

function normalizeCpMakerDraftForPersistence(draft: CpMakerPortDraftRecord): CpMakerApiDraftRecord {
  return {
    ...draft,
    eventSourceSnapshotsByTarget: draft.eventSourceSnapshotsByTarget ?? {},
  }
}

export function createCpMakerPortAdapter({ dialog }: PlatformPorts): CpMakerPort {
  return {
    // Draft CRUD
    listDrafts: () => listCpMakerDrafts(),
    loadDraft: (draftStorageKey) => loadCpMakerDraft(draftStorageKey),
    saveDraft: (draft) => saveCpMakerDraft(normalizeCpMakerDraftForPersistence(draft)),
    deleteDraft: (draftStorageKey) => deleteCpMakerDraft(draftStorageKey),
    copyDraft: (sourceDraftStorageKey) => copyCpMakerDraft({ source_draft_storage_key: sourceDraftStorageKey }),
    loadSession: () => loadCpMakerSession(),
    saveSession: (session) => saveCpMakerSession(session),

    // Import / Export
    importPack: (modDirectoryPath) => importCpMakerPack(modDirectoryPath),
    exportPack: (request) => exportCpMakerPack(request),

    // Directory selection
    chooseDirectory: (title) => dialog.chooseDirectory(title),

    // Preview scan / load
    scanMaps: (path, locale) => scanMaps(path, locale),
    scanEvents: (path) => scanEvents(path),
    scanModProjects: (rootPath) => scanModProjects(rootPath),
    loadMapAsset: (rootPath, mapPath, locale) => loadMapAsset(rootPath, mapPath, locale),
    loadTextAsset: (rootPath, assetPath, locale) => loadTextAsset(rootPath, assetPath, locale),
    loadImageDataUrl: (path, locale) => loadImageDataUrl(path, locale),
  }
}
