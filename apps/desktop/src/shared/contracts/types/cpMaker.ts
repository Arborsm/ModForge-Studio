/** Workspace id identifying a CP-maker authoring surface (mods, map, events, characters, etc.). */
export type WorkspaceId = 'mods' | 'map' | 'events' | 'characters' | 'buildings' | 'items' | 'dialogue' | 'schedules' | 'mail'

/** One entry in a Content Patcher `config.json` schema — key, default, allowed values, and UI hints. */
export interface ConfigSchemaEntry {
  key: string
  defaultValue: unknown
  allowValues?: string
  description?: string
  allowBlank?: boolean
  allowMultiple?: boolean
  section?: string
}

/** One Content Patcher patch (EditData/EditImage/EditMap/Load/Include) in a draft. */
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

/** Full CP-maker draft — project metadata, config schema, patches, virtual assets, tokens, and i18n files. */
export interface CpMakerDraft {
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
  configSchema: ConfigSchemaEntry[]
  patches: DraftPatch[]
  virtualAssets: VirtualPreviewAsset[]
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

/** One in-memory preview asset (image bytes encoded as base64) used by draft editors without disk writes. */
export interface VirtualPreviewAsset {
  relativePath: string
  mediaType: string
  bytesBase64: string
}
