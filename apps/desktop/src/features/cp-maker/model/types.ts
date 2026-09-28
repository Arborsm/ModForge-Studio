/** Identifier of a CP Maker authoring workspace. */
export type WorkspaceId = 'mods' | 'map' | 'events' | 'characters' | 'buildings' | 'items' | 'dialogue' | 'schedules' | 'mail'

/** One entry in the pack's `config.json` schema. */
export interface ConfigSchemaEntry {
  key: string
  defaultValue: unknown
  allowValues?: string
  description?: string
  allowBlank?: boolean
  allowMultiple?: boolean
  section?: string
}

/** One change entry in a draft's `Changes` list. */
export interface DraftPatch {
  id: string
  workspace: WorkspaceId
  target: string
  action: 'EditData' | 'EditImage' | 'EditMap' | 'Load' | 'Include'
  logName: string
  enabled: boolean | string
  updatedAt?: number
  when?: Record<string, unknown>
  fromFile?: string
  editorState: unknown
  targetLocale?: string
  update?: string
  priority?: string | number
  localTokens?: Record<string, unknown>
  targetField?: string[]
}

/** One entry of the manifest `Dependencies` list, as SMAPI reads it. */
export interface CpMakerDependency {
  uniqueId: string
  minimumVersion?: string
  /** SMAPI treats a dependency without `IsRequired` as required. */
  isRequired: boolean
}

/** Complete in-memory CP Maker draft with patches, assets, and metadata. */
export interface CpMakerDraft {
  draftStorageKey: string
  lastDraftSavedAt?: number | null
  lastExportedAt?: number | null
  lastExportPath?: string | null
  lastExportFingerprint?: {
    draftFingerprint: string
    environmentFingerprint: string
    capabilityFingerprint: string
  } | null
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
  configSchema: ConfigSchemaEntry[]
  patches: DraftPatch[]
  virtualAssets: VirtualPreviewAsset[]
  projectAssets: ProjectAssetRef[]
  dynamicTokens: Array<{ name: string; value: string; when?: Record<string, unknown> }>
  customLocations: Array<{
    name: string
    fromMapFile?: string
    migrateLegacyNames?: string[]
  }>
  aliasTokenNames: Record<string, string>
  eventSourceSnapshotsByTarget: Record<string, { rawScriptsByKey: Record<string, string> }>
  i18nFiles: Array<{ locale: string; rawJson: string }>
}

/** Lightweight reference to a persisted project asset. */
export interface ProjectAssetRef {
  relativePath: string
  mediaType: string
  sizeBytes: number
  sha256: string
  storageKey: string
  sourceType: 'imported' | 'generated' | 'edited'
  dependencies: Array<{ relativePath: string; kind: string }>
}

/** Virtual asset bundled into preview/export flows before it exists on disk. */
export interface VirtualPreviewAsset {
  relativePath: string
  mediaType: string
  bytesBase64: string
}
