export type WorkspaceId = 'mods' | 'map' | 'events' | 'characters' | 'buildings' | 'items' | 'dialogue' | 'schedules' | 'mail'

export interface ConfigSchemaEntry {
  key: string
  defaultValue: unknown
  allowValues?: string
  description?: string
  allowBlank?: boolean
  allowMultiple?: boolean
  section?: string
}

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

export interface VirtualPreviewAsset {
  relativePath: string
  mediaType: string
  bytesBase64: string
}
