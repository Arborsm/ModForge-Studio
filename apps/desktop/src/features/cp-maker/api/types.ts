import type { GameDirectoryInfo } from '@entities/game/api/types'

export type { GameDirectoryInfo }

/** Content pack target dependency selected from scanned mods or manual entry. */
export type CpMakerOverlayTarget = {
  uniqueId: string
  displayName: string | null
  required: boolean
  source: 'scanned-mod' | 'manual'
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
    minimumApiVersion?: string
    updateKeys?: string[]
  }
  overlayTargets: CpMakerOverlayTarget[]
  configSchemaDraft: Record<string, unknown>
  serializedChangeRegistry: Record<string, unknown>
  dynamicTokens?: Array<{ name: string; value: string; when?: Record<string, unknown> }>
  customLocations?: Array<{ name: string; fromMapFile?: string; migrateLegacyNames?: string[] }>
  aliasTokenNames?: Record<string, string>
  eventSourceSnapshotsByTarget: Record<string, { rawScriptsByKey: Record<string, string> }>
  i18nFiles: Array<{ locale: string; rawJson: string }>
  lastDraftSavedAt: number | null
  lastExportedAt: number | null
  lastExportPath: string | null
  lastExportFingerprint: {
    draftFingerprint: string
    environmentFingerprint: string
    capabilityFingerprint: string
  } | null
}

/** Request to duplicate an existing draft by storage key. */
export type CopyCpMakerDraftRequest = {
  source_draft_storage_key: string
}

/** Request to export a generated Content Patcher pack to disk. */
export type CpMakerExportRequest = {
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
  relative_path: string
  map_document: unknown // MapDocument from backend
}

/** Virtual asset bundled into preview/export flows before it exists on disk. */
export type VirtualPreviewAsset = {
  relativePath: string
  mediaType: string
  bytesBase64: string
}
