/** Detected game directory info — root path, executable, maps path, and map count. */
export type GameDirectoryInfo = {
  rootPath: string
  executablePath: string
  mapsPath: string | null
  mapCount: number
}

/** Summary of one map asset discovered in the game directory. */
export type MapAssetSummary = {
  id: string
  name: string
  fileName: string
  format: 'tmx' | 'tbin' | 'xnb'
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

/** Summary of one event asset discovered in the game directory. */
export type EventAssetSummary = {
  id: string
  name: string
  fileName: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

/** Kind of plugin detected for a mod project — Content Patcher or unknown. */
export type PluginKind = 'content-patcher' | 'unknown'
/** Severity level for a mod project diagnostic. */
export type PluginDiagnosticSeverity = 'info' | 'warning' | 'error'

/** Summary of one installed mod project — id, name, author, version, paths, plugin kind, and status. */
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

/** One diagnostic for a mod project (severity, message, and optional field path). */
export type ModProjectDiagnostic = {
  severity: PluginDiagnosticSeverity
  message: string
  field: string | null
}

/** Summary of one Content Patcher patch (action, target, from-file, log name, when keys, update keys). */
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

/** Parsed Content Patcher project data — manifest, content JSON, format, patch/include/token counts, i18n files. */
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

/** One i18n file in a Content Patcher project — locale, path, raw JSON, and entry count. */
export type ContentPatcherI18nFile = {
  locale: string
  path: string
  relativePath: string
  rawJson: string
  entryCount: number
}

/** Full detail of one mod project — summary, diagnostics, Content Patcher data, and i18n files. */
export type ModProjectDetail = {
  pluginKind: PluginKind
  summary: ModProjectSummary
  diagnostics: ModProjectDiagnostic[]
  contentPatcher: ContentPatcherProjectData | null
  i18nFiles: ContentPatcherI18nFile[]
}

/** Lightweight summary of a Content Patcher project — name, unique id, paths. */
export type ContentPatcherProjectSummary = {
  name: string | null
  uniqueId: string | null
  contentPackFor: string | null
  absolutePath: string | null
  manifestPath: string | null
  contentPath: string | null
}

/** One source file in a Content Patcher project (path, absolute path, raw JSON). */
export type ContentPatcherSourceFile = {
  path: string
  absolutePath: string
  rawJson: string
}

/** One edge in the Content Patcher include tree (source path → included path). */
export type ContentPatcherIncludeEdge = {
  sourcePath: string
  includedPath: string
}

/** Full snapshot of a Content Patcher project — summary, source files, include tree, and diagnostics. */
export type ContentPatcherProjectSnapshot = {
  summary: ContentPatcherProjectSummary
  sources: ContentPatcherSourceFile[]
  includeTree: ContentPatcherIncludeEdge[]
  diagnostics: ModProjectDiagnostic[]
}

type ContentPatcherAssetKind = 'json' | 'image' | 'map' | (string & {})
type ContentPatcherResultState = 'determinate' | 'indeterminate' | 'error' | (string & {})
type ContentPatcherTraceStatus = 'applied' | 'skipped' | 'indeterminate' | 'error' | (string & {})

/** Summary of one Content Patcher target asset — path, kind, touched patch count, and result state. */
export type ContentPatcherTargetSummary = {
  path: string
  assetKind: ContentPatcherAssetKind
  touchedPatchCount: number
  resultState: ContentPatcherResultState
  patchIds: string[]
}

/** One trace entry showing how a patch was applied to a target asset. */
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

/** Resolved payload for a Content Patcher result asset — JSON, image data URLs, or map debug data. */
export type ContentPatcherResultAssetPayload = {
  kind: ContentPatcherAssetKind
  json: unknown
  imageDataUrl: string | null
  originalImageDataUrl: string | null
  originalImageSource: string | null
  mapDebug: Record<string, unknown> | null
}

/** Result of loading a Content Patcher result asset — target, trace, payload, diagnostics, and exportability. */
export type LoadContentPatcherResultAssetResult = {
  target: ContentPatcherTargetSummary
  trace: ContentPatcherTraceEntry[]
  result: ContentPatcherResultAssetPayload
  diagnostics: ModProjectDiagnostic[]
  exportable: boolean
}

/** Status of one Nexus Mods API route in the launcher diagnostics view. */
export type LauncherNexusRouteStatus = 'loading' | 'warning' | 'success'

/** Snapshot of one Nexus Mods API route — endpoint, status, attempts, latency, and message. */
export type LauncherNexusRouteSnapshot = {
  routeId: string
  label: string
  endpoint: string
  status: LauncherNexusRouteStatus
  attempts: number
  maxAttempts: number
  available: boolean
  latencyMs?: number | null
  message: string
}

/** Result of running Nexus Mods API route diagnostics in the launcher. */
export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
