import type { GameDirectoryInfo } from '@entities/game/api'
import type { CpMakerDependency, VirtualPreviewAsset } from '@features/cp-maker'
import type { DialogFilter } from '@shared/contracts/platform'
import type { ProjectAssetRef } from './types'

export type { GameDirectoryInfo }

export type CpMakerDraftSummary = {
  draftStorageKey: string
  projectName: string
  projectUniqueId: string
  lastDraftSavedAt: number | null
  lastExportedAt: number | null
}

export type CpMakerSession = {
  activeDraftKey: string | null
  activeGeneratedDraftKey: string | null
}

export type ReadProjectAssetRequest = {
  draftStorageKey: string
  relativePath: string
}

export type WriteProjectAssetRequest = ReadProjectAssetRequest & {
  mediaType: string
  bytesBase64: string
  sourceType: ProjectAssetRef['sourceType']
}

export type WriteProjectAssetsRequest = {
  draftStorageKey: string
  assets: Array<Omit<WriteProjectAssetRequest, 'draftStorageKey'>>
}

export type RenameProjectAssetRequest = ReadProjectAssetRequest & {
  newRelativePath: string
}

export type DeleteProjectAssetRequest = ReadProjectAssetRequest

export type ImportProjectAssetsRequest = {
  draftStorageKey: string
  sourcePaths: string[]
  destinationDirectory: string
}

export type ProjectAssetPayload = {
  asset: ProjectAssetRef
  bytesBase64: string
}

export type ProjectMapAssetContent = {
  name: string
  format: string
  absolutePath: string
  relativePath: string
  content: string
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
    contentPackForMinimumVersion?: string
    minimumApiVersion?: string
    updateKeys?: string[]
    dependencies?: CpMakerDependency[]
  }
  configSchemaDraft: Record<string, unknown>
  serializedChangeRegistry: Record<string, unknown>
  dynamicTokens?: Array<{ name: string; value: string; when?: Record<string, unknown> }>
  customLocations?: Array<{ name: string; fromMapFile?: string; migrateLegacyNames?: string[] }>
  aliasTokenNames?: Record<string, string>
  eventSourceSnapshotsByTarget: Record<string, { rawScriptsByKey: Record<string, string> }> | undefined
  i18nFiles: Array<{ locale: string; rawJson: string }>
  projectAssets: ProjectAssetRef[]
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
  draft_storage_key: string
  output_path: string
  manifest_json: string
  content_json: string
  virtual_assets: VirtualPreviewAsset[]
  i18n_files: Array<{ locale: string; rawJson: string }>
}

export type CpMakerExportResult = {
  output_path: string
  manifest_path: string
  content_path: string
  virtual_asset_paths: string[]
}

export type CpMakerPort = {
  // Draft CRUD
  listDrafts: () => Promise<CpMakerDraftSummary[]>
  loadDraft: (storageKey: string) => Promise<CpMakerDraftRecord>
  saveDraft: (draft: CpMakerDraftRecord) => Promise<CpMakerDraftRecord>
  deleteDraft: (storageKey: string) => Promise<void>
  copyDraft: (sourceDraftStorageKey: string) => Promise<CpMakerDraftRecord>
  loadSession: () => Promise<CpMakerSession>
  saveSession: (session: CpMakerSession) => Promise<CpMakerSession>
  readProjectAsset: (request: ReadProjectAssetRequest) => Promise<ProjectAssetPayload>
  loadProjectMapAsset: (request: ReadProjectAssetRequest) => Promise<ProjectMapAssetContent>
  writeProjectAsset: (request: WriteProjectAssetRequest) => Promise<ProjectAssetRef>
  writeProjectAssets: (request: WriteProjectAssetsRequest) => Promise<ProjectAssetRef[]>
  importProjectAssets: (request: ImportProjectAssetsRequest) => Promise<CpMakerDraftRecord>
  renameProjectAsset: (request: RenameProjectAssetRequest) => Promise<CpMakerDraftRecord>
  deleteProjectAsset: (request: DeleteProjectAssetRequest) => Promise<CpMakerDraftRecord>

  // Import / Export
  importPack: (modDirectoryPath: string) => Promise<CpMakerDraftRecord>
  exportPack: (request: CpMakerExportRequest) => Promise<CpMakerExportResult>

  // Directory selection
  chooseDirectory: (title?: string) => Promise<string | null>
  chooseFiles: (title?: string, filters?: readonly DialogFilter[]) => Promise<string[]>

  // Preview scan / load (simplified return types)
  scanMaps: (path: string, locale?: string) => Promise<CpMakerMapAssetSummary[]>
  scanEvents: (path: string) => Promise<CpMakerEventAssetSummary[]>
  scanModProjects: (rootPath: string) => Promise<CpMakerModProjectSummary[]>
  loadMapAsset: (
    rootPath: string,
    mapPath: string,
    locale?: string,
  ) => Promise<{ name: string; format: string; absolutePath: string; relativePath: string; content: string }>
  loadTextAsset: (
    rootPath: string,
    assetPath: string,
    locale?: string,
  ) => Promise<{ absolutePath: string; relativePath: string; content: string }>
  loadImageDataUrl: (path: string, locale?: string) => Promise<string>
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
