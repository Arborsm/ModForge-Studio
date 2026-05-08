import type { CpMakerPort } from '@features/cp-maker'
import type { PlatformPorts } from '@shared/contracts'

export function createCpMakerPortAdapter({ dialog, fileSystem }: PlatformPorts): CpMakerPort {
  return {
    // Draft CRUD
    listDrafts: () => fileSystem.invokeCommand('list_cp_maker_drafts'),
    loadDraft: (draftStorageKey) => fileSystem.invokeCommand('load_cp_maker_draft', { draftStorageKey }),
    saveDraft: (draft) => fileSystem.invokeCommand('save_cp_maker_draft', { draft }),
    deleteDraft: (draftStorageKey) => fileSystem.invokeCommand('delete_cp_maker_draft', { draftStorageKey }),
    copyDraft: (sourceDraftStorageKey) =>
      fileSystem.invokeCommand('copy_cp_maker_draft', {
        request: { source_draft_storage_key: sourceDraftStorageKey },
      }),

    // Import / Export
    importPack: (modDirectoryPath) => fileSystem.invokeCommand('import_cp_maker_pack', { modDirectoryPath }),
    exportPack: (request) => fileSystem.invokeCommand('export_cp_maker_pack', { request }),

    // Directory selection
    chooseDirectory: (title) => dialog.chooseDirectory(title),

    // Preview scan / load
    scanMaps: (path, locale) => fileSystem.invokeCommand('scan_maps', { path, locale }),
    scanEvents: (path) => fileSystem.invokeCommand('scan_events', { path }),
    scanModProjects: (rootPath) => fileSystem.invokeCommand('scan_mod_projects', { rootPath }),
    loadMapAsset: (rootPath, mapPath, locale) =>
      fileSystem.invokeCommand('load_map_asset', { rootPath, mapPath, locale }),
    loadTextAsset: (rootPath, assetPath, locale) =>
      fileSystem.invokeCommand('load_text_asset', { rootPath, assetPath, locale }),
    loadImageDataUrl: (path, locale) => fileSystem.invokeCommand('load_image_data_url', { path, locale }),
  }
}
