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
  summary: ModProjectSummary
  diagnostics: ModProjectDiagnostic[]
  contentPatcher: ContentPatcherProjectData | null
  i18nFiles: ContentPatcherI18nFile[]
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

export type LauncherNexusRouteStatus = 'loading' | 'warning' | 'success'

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

export type LauncherNexusDiagnosticsResult = {
  routes: LauncherNexusRouteSnapshot[]
}
