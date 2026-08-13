import type { GameDirectoryInfo } from '@entities/game/api/types'

export type { GameDirectoryInfo }

/** One entry of the manifest `Dependencies` list, as SMAPI reads it. */
export type CpMakerDependency = {
  uniqueId: string
  minimumVersion?: string
  /** SMAPI treats a dependency without `IsRequired` as required. */
  isRequired: boolean
}

/** Lightweight CP Maker draft metadata for draft lists. */
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

/** Complete persisted CP Maker draft payload. */
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
  eventSourceSnapshotsByTarget: Record<string, { rawScriptsByKey: Record<string, string> }>
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

export type ProjectAssetSource = 'imported' | 'generated' | 'edited'

export type ProjectAssetRef = {
  relativePath: string
  mediaType: string
  sizeBytes: number
  sha256: string
  storageKey: string
  sourceType: ProjectAssetSource
  dependencies: Array<{ relativePath: string; kind: string }>
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

export type ReadProjectAssetRequest = {
  draftStorageKey: string
  relativePath: string
}

export type WriteProjectAssetRequest = ReadProjectAssetRequest & {
  mediaType: string
  bytesBase64: string
  sourceType: ProjectAssetSource
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

/** Request to duplicate an existing draft by storage key. */
export type CopyCpMakerDraftRequest = {
  source_draft_storage_key: string
}

/** Request to export a generated Content Patcher pack to disk. */
export type CpMakerExportRequest = {
  draft_storage_key: string
  output_path: string
  manifest_json: string
  content_json: string
  virtual_assets: VirtualPreviewAsset[]
  i18n_files: Array<{ locale: string; rawJson: string }>
}

/** Paths written by a CP Maker export operation. */
export type CpMakerExportResult = {
  output_path: string
  manifest_path: string
  content_path: string
  virtual_asset_paths: string[]
}

/** Request to build a previewable map asset from an in-memory map document. */
export type BuildCpMakerMapAssetRequest = {
  relativePath: string
  mapDocument: unknown // MapDocument from backend
}

export type BuildCpMakerMapAssetResult = {
  asset: VirtualPreviewAsset
  companionAssets: VirtualPreviewAsset[]
}

/** Virtual asset bundled into preview/export flows before it exists on disk. */
export type VirtualPreviewAsset = {
  relativePath: string
  mediaType: string
  bytesBase64: string
}
