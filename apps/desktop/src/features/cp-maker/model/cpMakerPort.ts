import type { GameDirectoryInfo, VirtualPreviewAsset } from '@shared/contracts'

export type { GameDirectoryInfo }

export type CpMakerDraftSummary = {
  draftStorageKey: string
  projectName: string
  projectUniqueId: string
  lastDraftSavedAt: number | null
  lastExportedAt: number | null
}

export type CpMakerDraftRecord = {
  draftStorageKey: string
  projectMetadata: {
    projectName: string
    projectDescription: string
    projectAuthor: string
    projectVersion: string
    projectUniqueId: string
    gameRootPath: string | null
    contentPackForUniqueId: string
    minimumApiVersion?: string
    updateKeys?: string[]
  }
  overlayTargets: Array<{ uniqueId: string; displayName: string | null; required: boolean; source: 'scanned-mod' | 'manual' }>
  configSchemaDraft: Record<string, unknown>
  serializedChangeRegistry: Record<string, unknown>
  dynamicTokens?: Array<{ name: string; value: string; when?: Record<string, unknown> }>
  customLocations?: Array<{ name: string; fromMapFile?: string; migrateLegacyNames?: string[] }>
  aliasTokenNames?: Record<string, string>
  eventSourceSnapshotsByTarget: Record<string, { rawScriptsByKey: Record<string, string> }> | undefined
  lastDraftSavedAt: number | null
  lastExportedAt: number | null
  lastExportPath: string | null
  lastExportFingerprint: {
    draftFingerprint: string
    environmentFingerprint: string
    capabilityFingerprint: string
  } | null
}

export type CpMakerExportRequest = {
  output_path: string
  manifest_json: string
  content_json: string
  virtual_assets: VirtualPreviewAsset[]
}

export type CpMakerExportResult = {
  output_path: string
  manifest_path: string
  content_path: string
  virtual_asset_paths: string[]
}

export interface CpMakerPort {
  // Draft CRUD
  listDrafts(): Promise<CpMakerDraftSummary[]>
  loadDraft(storageKey: string): Promise<CpMakerDraftRecord>
  saveDraft(draft: CpMakerDraftRecord): Promise<CpMakerDraftRecord>
  deleteDraft(storageKey: string): Promise<void>
  copyDraft(sourceDraftStorageKey: string): Promise<CpMakerDraftRecord>

  // Import / Export
  importPack(modDirectoryPath: string): Promise<CpMakerDraftRecord>
  exportPack(request: CpMakerExportRequest): Promise<CpMakerExportResult>

  // Directory selection
  chooseDirectory(title?: string): Promise<string | null>

  // Preview scan / load (simplified return types)
  scanMaps(path: string, locale?: string): Promise<CpMakerMapAssetSummary[]>
  scanEvents(path: string): Promise<CpMakerEventAssetSummary[]>
  scanModProjects(rootPath: string): Promise<CpMakerModProjectSummary[]>
  loadMapAsset(
    rootPath: string,
    mapPath: string,
    locale?: string,
  ): Promise<{ name: string; format: string; absolutePath: string; relativePath: string; content: string }>
  loadTextAsset(
    rootPath: string,
    assetPath: string,
    locale?: string,
  ): Promise<{ absolutePath: string; relativePath: string; content: string }>
  loadImageDataUrl(path: string, locale?: string): Promise<string>
}

export type CpMakerMapAssetSummary = {
  id: string
  name: string
  fileName: string
  format: 'tmx' | 'tbin' | 'xnb'
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type CpMakerEventAssetSummary = {
  id: string
  name: string
  fileName: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type CpMakerModProjectSummary = {
  id: string
  name: string
  author: string | null
  version: string | null
  description: string | null
  uniqueId: string | null
  contentPackFor: string | null
  folderName: string
  absolutePath: string
  manifestPath: string
  contentPath: string | null
  pluginKind: string
  status: string
  missingRequiredDependencies: string[]
}
