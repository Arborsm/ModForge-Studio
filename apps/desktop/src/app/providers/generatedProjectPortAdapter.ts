import type { PlatformPorts } from '@shared/contracts'
import type { GeneratedProjectPort } from '@features/generated-project'
import {
  listGeneratedProjectDrafts,
  loadGeneratedProjectDraft,
  saveGeneratedProjectDraft,
  deleteGeneratedProjectDraft,
  copyGeneratedProjectDraft,
  importGeneratedProjectPack,
  exportGeneratedProjectPack,
  chooseDirectory,
  scanMaps,
  scanEvents,
  scanModProjects,
  loadMapAsset,
  loadTextAsset,
  loadImageDataUrl,
} from '@platform/desktop'

export function createGeneratedProjectPortAdapter(_platformPorts: PlatformPorts): GeneratedProjectPort {
  return {
    // Draft CRUD
    listDrafts: () => listGeneratedProjectDrafts(),
    loadDraft: (storageKey) => loadGeneratedProjectDraft(storageKey),
    saveDraft: (draft: Parameters<typeof saveGeneratedProjectDraft>[0]) => saveGeneratedProjectDraft(draft),
    deleteDraft: (storageKey) => deleteGeneratedProjectDraft(storageKey),
    copyDraft: (sourceDraftStorageKey) =>
      copyGeneratedProjectDraft({ source_draft_storage_key: sourceDraftStorageKey }),

    // Import / Export
    importPack: (modDirectoryPath) => importGeneratedProjectPack(modDirectoryPath),
    exportPack: (request) => exportGeneratedProjectPack(request),

    // Directory selection
    chooseDirectory: (title) => chooseDirectory(title ?? 'Select directory'),

    // Preview scan / load
    scanMaps: (path, locale) => scanMaps(path, locale),
    scanEvents: (path) => scanEvents(path),
    scanModProjects: (rootPath) => scanModProjects(rootPath),
    loadMapAsset: (rootPath, mapPath, locale) => loadMapAsset(rootPath, mapPath, locale),
    loadTextAsset: (rootPath, assetPath, locale) => loadTextAsset(rootPath, assetPath, locale),
    loadImageDataUrl: (path, locale) => loadImageDataUrl(path, locale),
  }
}
