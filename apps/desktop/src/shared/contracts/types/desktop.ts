export type GameDirectoryInfo = {
  rootPath: string
  executablePath: string
  mapsPath: string | null
  mapCount: number
}

export type MapAssetSummary = {
  id: string
  name: string
  fileName: string
  format: 'tmx' | 'tbin' | 'xnb'
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type EventAssetSummary = {
  id: string
  name: string
  fileName: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

export type PluginKind = 'content-patcher' | 'unknown'
export type PluginDiagnosticSeverity = 'info' | 'warning' | 'error'

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
}

export type ModProjectDiagnostic = {
  severity: PluginDiagnosticSeverity
  message: string
  field: string | null
}

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

export type ContentPatcherI18nFile = {
  locale: string
  path: string
  relativePath: string
  rawJson: string
  entryCount: number
}

export type ModProjectDetail = {
  pluginKind: PluginKind
  capabilities: string[]
  summary: ModProjectSummary
  diagnostics: ModProjectDiagnostic[]
  contentPatcher: ContentPatcherProjectData | null
}

export type ContentPatcherProjectSummary = {
  name: string | null
  uniqueId: string | null
  contentPackFor: string | null
  absolutePath: string | null
  manifestPath: string | null
  contentPath: string | null
}

export type ContentPatcherSourceFile = {
  path: string
  absolutePath: string
  rawJson: string
}

export type ContentPatcherIncludeEdge = {
  sourcePath: string
  includedPath: string
}

export type ContentPatcherProjectSnapshot = {
  summary: ContentPatcherProjectSummary
  sources: ContentPatcherSourceFile[]
  includeTree: ContentPatcherIncludeEdge[]
  diagnostics: ModProjectDiagnostic[]
}

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

export type ContentPatcherPatchPlan = {
  patches: ContentPatcherPlannedPatch[]
}

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

export type SimulateContentPatcherRequest = {
  path?: string | null
  gameRootPath?: string | null
  snapshot?: ContentPatcherProjectSnapshot | null
  manifestJson?: string | null
  contentJson?: string | null
  context?: ContentPatcherSimulationContext | null
}

export type ContentPatcherPatchStatus = {
  patchId: string | null
  status: 'applied' | 'skipped' | 'indeterminate'
  reasons: string[]
}

type ContentPatcherAssetKind = 'json' | 'image' | 'map' | (string & {})
type ContentPatcherResultState = 'determinate' | 'indeterminate' | 'error' | (string & {})
type ContentPatcherTraceStatus = 'applied' | 'skipped' | 'indeterminate' | 'error' | (string & {})

export type ContentPatcherTargetSummary = {
  path: string
  assetKind: ContentPatcherAssetKind
  touchedPatchCount: number
  resultState: ContentPatcherResultState
  patchIds: string[]
}

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

export type ContentPatcherResultAssetPayload = {
  kind: ContentPatcherAssetKind
  json: unknown
  imageDataUrl: string | null
  originalImageDataUrl: string | null
  originalImageSource: string | null
  mapDebug: Record<string, unknown> | null
}

export type LoadContentPatcherResultAssetResult = {
  target: ContentPatcherTargetSummary
  trace: ContentPatcherTraceEntry[]
  result: ContentPatcherResultAssetPayload
  diagnostics: ModProjectDiagnostic[]
  exportable: boolean
}

export type ContentPatcherSimulationResult = {
  plan: ContentPatcherPatchPlan
  targets: ContentPatcherTargetSummary[]
  patchStatuses: ContentPatcherPatchStatus[]
  diagnostics: ModProjectDiagnostic[]
  dynamicTokens: Record<string, unknown>
}

export type SaveModProjectResult = {
  pluginKind: PluginKind
  targetPath: string
  manifestPath: string
  contentPath: string
  diagnostics: ModProjectDiagnostic[]
}

export type LauncherNexusRouteStatus = 'loading' | 'warning' | 'success'

export type LauncherNexusRouteSnapshot = {
  routeId: string
  label: string
  endpoint: string
  status: LauncherNexusRouteStatus
  attempts: number
  maxAttempts: number
  available: boolean
  message: string
}

export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
