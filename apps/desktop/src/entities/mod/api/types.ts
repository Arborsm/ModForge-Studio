export type PluginKind = 'content-patcher' | 'unknown'
export type PluginDiagnosticSeverity = 'info' | 'warning' | 'error'

/** Lightweight mod project metadata shown in mod workspace browsers. */
export type ModProjectSummary = {
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
  pluginKind: PluginKind
  status: 'ready' | 'incompatible' | 'unsupported'
  missingRequiredDependencies: string[]
  hasI18n: boolean
  i18nEntryCount: number
}

/** User-facing diagnostic emitted while scanning, loading, simulating, or saving a mod project. */
export type ModProjectDiagnostic = {
  severity: PluginDiagnosticSeverity
  message: string
  field: string | null
}

/** One Content Patcher change entry summarized for navigation and editing. */
export type ContentPatcherPatchSummary = {
  id: string
  index: number
  action: string
  target: string
  fromFile: string | null
  logName: string
  whenKeys: string[]
  hasWhen: boolean
  updateKeys: string[]
}

/** Editable Content Patcher source data loaded from manifest/content files. */
export type ContentPatcherProjectData = {
  manifestPath: string
  contentPath: string
  manifestJson: string
  contentJson: string
  format: string | null
  changeCount: number
  includeCount: number
  dynamicTokenCount: number
  configKeys: string[]
  hasI18n: boolean
  i18nFiles: ContentPatcherI18nFile[]
  patches: ContentPatcherPatchSummary[]
}

/** One editable Content Patcher i18n JSON file under a mod project's i18n folder. */
export type ContentPatcherI18nFile = {
  locale: string
  path: string
  relativePath: string
  rawJson: string
  entryCount: number
}

/** Full mod project payload with plugin-specific editable data when supported. */
export type ModProjectDetail = {
  pluginKind: PluginKind
  capabilities: string[]
  summary: ModProjectSummary
  diagnostics: ModProjectDiagnostic[]
  contentPatcher: ContentPatcherProjectData | null
  i18nFiles: ContentPatcherI18nFile[]
}

/** Stable identity and path metadata for a Content Patcher project snapshot. */
export type ContentPatcherProjectSummary = {
  name: string | null
  uniqueId: string | null
  contentPackFor: string | null
  absolutePath: string | null
  manifestPath: string | null
  contentPath: string | null
}

/** Raw Content Patcher source file included in a snapshot. */
export type ContentPatcherSourceFile = {
  path: string
  absolutePath: string
  rawJson: string
}

/** Include relationship between Content Patcher source files. */
export type ContentPatcherIncludeEdge = {
  sourcePath: string
  includedPath: string
}

/** Complete Content Patcher source snapshot used for unsaved simulation. */
export type ContentPatcherProjectSnapshot = {
  summary: ContentPatcherProjectSummary
  sources: ContentPatcherSourceFile[]
  includeTree: ContentPatcherIncludeEdge[]
  diagnostics: ModProjectDiagnostic[]
}

/** Planned Content Patcher change after conditions and includes are evaluated. */
export type ContentPatcherPlannedPatch = {
  id: string
  action: string
  target: string
  logName: string
  fromFile: string | null
  when: Record<string, unknown>
  sourcePath: string
  priority: number
  update: string[]
}

/** Ordered Content Patcher simulation plan. */
export type ContentPatcherPatchPlan = {
  patches: ContentPatcherPlannedPatch[]
}

/** Simulated game state and mod context used to evaluate Content Patcher conditions. */
export type ContentPatcherSimulationContext = {
  season?: string
  weather?: string
  day?: number
  dayOfWeek?: string
  daysPlayed?: number
  year?: number
  time?: number
  playerName?: string
  playerGender?: string
  farmName?: string
  locationName?: string
  spouse?: string
  isMainPlayer?: boolean
  stardropCount?: number
  hasFlags?: string[]
  hasSeenEvents?: string[]
  hasConversationTopics?: string[]
  hasDialogueAnswers?: string[]
  hasWalletItems?: string[]
  hasProfessions?: string[]
  hasCraftingRecipes?: string[]
  hasCookingRecipes?: string[]
  skillLevels?: Record<string, number>
  hasActiveQuests?: string[]
  hasCompletedQuests?: string[]
  hasItems?: string[]
  hasPet?: boolean
  petType?: string
  hasChildren?: boolean
  childCount?: number
  dailyLuck?: number
  hasCaughtFish?: string[]
  hasReadLetters?: string[]
  hasVisitedLocations?: string[]
  isOutdoors?: boolean
  locationContext?: string
  locationUniqueName?: string
  locationOwnerId?: string
  preferredPet?: string
  farmCave?: string
  farmMapAsset?: string
  havingChild?: boolean
  pregnant?: boolean
  roommate?: string
  hearts?: Record<string, number>
  childNames?: string[]
  childGenders?: string[]
  dayEvent?: string
  farmType?: string
  farmhouseUpgrade?: number
  isCommunityCenterComplete?: boolean
  isJojaMartComplete?: boolean
  language?: string
  relationships?: Record<string, string>
  config?: Record<string, unknown>
  installedMods?: string[]
  customTokens?: Record<string, unknown>
  ignoreEntryWhenConditions?: boolean
}

/** Request to simulate Content Patcher output from disk or an unsaved editor snapshot. */
export type SimulateContentPatcherRequest = {
  path?: string | null
  gameRootPath?: string | null
  snapshot?: ContentPatcherProjectSnapshot | null
  manifestJson?: string | null
  contentJson?: string | null
  context?: ContentPatcherSimulationContext | null
}

/** Per-patch condition result from a Content Patcher simulation. */
type ContentPatcherAssetKind = 'json' | 'image' | 'map' | (string & {})
type ContentPatcherResultState = 'determinate' | 'indeterminate' | 'error' | (string & {})
type ContentPatcherTraceStatus = 'applied' | 'skipped' | 'indeterminate' | 'error' | (string & {})
type ContentPatcherExportFormat = 'json' | 'png' | (string & {})

export type ContentPatcherPatchStatus = {
  patchId: string | null
  status: 'applied' | 'skipped' | 'indeterminate'
  reasons: string[]
}

/** Asset target touched by a Content Patcher simulation. */
export type ContentPatcherTargetSummary = {
  path: string
  assetKind: ContentPatcherAssetKind
  touchedPatchCount: number
  resultState: ContentPatcherResultState
  patchIds: string[]
}

/** Trace entry explaining how one patch affected a simulated target. */
export type ContentPatcherTraceEntry = {
  patchId: string
  logName: string
  action: string
  sourcePath: string
  status: ContentPatcherTraceStatus
  reasonSummary: string
  changeSummary: string
  diagnostics: ModProjectDiagnostic[]
}

/** Preview payload for one simulated Content Patcher target. */
export type ContentPatcherResultAssetPayload = {
  kind: ContentPatcherAssetKind
  json: unknown
  imageDataUrl: string | null
  originalImageDataUrl: string | null
  originalImageSource: string | null
  mapDebug: Record<string, unknown> | null
}

/** Request to materialize one simulated target for preview. */
export type LoadContentPatcherResultAssetRequest = SimulateContentPatcherRequest & {
  target: string
}

/** Materialized preview result for one simulated Content Patcher target. */
export type LoadContentPatcherResultAssetResult = {
  target: ContentPatcherTargetSummary
  trace: ContentPatcherTraceEntry[]
  result: ContentPatcherResultAssetPayload
  diagnostics: ModProjectDiagnostic[]
  exportable: boolean
}

/** Request to export one simulated target to disk. */
export type ExportContentPatcherAssetRequest = SimulateContentPatcherRequest & {
  target: string
  outputDirectory: string
}

/** Result of exporting one simulated Content Patcher target. */
export type ExportContentPatcherAssetResult = {
  target: string
  outputPath: string
  format: ContentPatcherExportFormat
  diagnostics: ModProjectDiagnostic[]
}

/** Complete Content Patcher simulation result for navigation, diagnostics, and previews. */
export type ContentPatcherSimulationResult = {
  plan: ContentPatcherPatchPlan
  targets: ContentPatcherTargetSummary[]
  patchStatuses: ContentPatcherPatchStatus[]
  diagnostics: ModProjectDiagnostic[]
  dynamicTokens: Record<string, unknown>
}

/** Request to save editable mod project files, optionally to a new output path. */
export type SaveModProjectRequest = {
  sourcePath: string
  outputPath?: string | null
  overwriteExistingExport?: boolean
  manifestJson: string
  contentJson: string
  i18nFiles?: Array<{
    locale: string
    rawJson: string
  }>
}

/** Paths and diagnostics returned after saving a mod project. */
export type SaveModProjectResult = {
  pluginKind: PluginKind
  targetPath: string
  manifestPath: string
  contentPath: string
  diagnostics: ModProjectDiagnostic[]
}

/** Reference to an asset touched by one or more installed content packs. */
export type ModAssetReference = {
  key: string
  label: string
  targets: string[]
  patchIds: string[]
}

/** Asset references grouped by installed mod. */
export type ModAssetIndexGroup = {
  modId: string
  modName: string
  modPath: string
  pluginKind: PluginKind
  maps: ModAssetReference[]
  events: ModAssetReference[]
  characters: ModAssetReference[]
  buildings: ModAssetReference[]
  items: ModAssetReference[]
}

/** Cross-mod index used by workbench source browsers. */
export type ModAssetIndex = {
  mods: ModAssetIndexGroup[]
}
