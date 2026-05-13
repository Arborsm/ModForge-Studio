import type { GameDirectoryInfo } from '@entities/game/api/types'

export type { GameDirectoryInfo }

export type CpMakerOverlayTarget = {
  uniqueId: string
  displayName: string | null
  required: boolean
  source: 'scanned-mod' | 'manual'
}

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
  overlayTargets: CpMakerOverlayTarget[]
  configSchemaDraft: Record<string, unknown>
  serializedChangeRegistry: Record<string, unknown>
  dynamicTokens?: Array<{ name: string; value: string; when?: Record<string, unknown> }>
  customLocations?: Array<{ name: string; fromMapFile?: string; migrateLegacyNames?: string[] }>
  aliasTokenNames?: Record<string, string>
  eventSourceSnapshotsByTarget: Record<string, { rawScriptsByKey: Record<string, string> }>
  lastDraftSavedAt: number | null
  lastExportedAt: number | null
  lastExportPath: string | null
  lastExportFingerprint: {
    draftFingerprint: string
    environmentFingerprint: string
    capabilityFingerprint: string
  } | null
}

export type CopyCpMakerDraftRequest = {
  source_draft_storage_key: string
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

export type BuildCpMakerMapAssetRequest = {
  relative_path: string
  map_document: unknown // MapDocument from backend
}

export type VirtualPreviewAsset = {
  relativePath: string
  mediaType: string
  bytesBase64: string
}

