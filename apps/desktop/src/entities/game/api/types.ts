/** Validated Stardew Valley game directory metadata used by workbench editors. */
export type GameDirectoryInfo = {
  rootPath: string
  executablePath: string
  mapsPath: string | null
  mapCount: number
}

/** Lightweight map asset entry shown in map pickers and search results. */
export type MapAssetSummary = {
  id: string
  name: string
  fileName: string
  format: 'tmx' | 'tbin' | 'xnb'
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

/** Lightweight event asset entry shown in event workspace pickers. */
export type EventAssetSummary = {
  id: string
  name: string
  fileName: string
  absolutePath: string
  relativePath: string
  sizeBytes: number
}

/** Full map asset payload returned for editor loading and preview. */
export type MapAssetContent = {
  name: string
  format: 'tmx' | 'tbin' | 'xnb'
  absolutePath: string
  relativePath: string
  content: string
}

/** Full text/data asset payload returned for editor loading and preview. */
export type TextAssetContent = {
  absolutePath: string
  relativePath: string
  content: string
}

/** Parsed event asset payload produced by the canonical Rust event parser. */
export type ParsedEventAssetContent = {
  absolutePath: string
  relativePath: string
  events: import('@shared/contracts/event-script').EventScript[]
}

/** Local text file payload loaded outside the Stardew asset tree. */
export type LocalTextFileContent = {
  absolutePath: string
  content: string
}

/** Save slot discovered from the default Stardew Valley save directory. */
export type DefaultSaveSlotSummary = {
  slotName: string
  folderPath: string
  filePath: string
  modifiedTimeMs: number
}

/** Audio cue or file summary used by event preview playback. */
export type AudioAssetSummary = {
  cue: string
  kind: 'music' | 'sound'
  absolutePath: string
  relativePath: string
}

/** Game image texture summary (XNB or loose image) used by import pickers. */
export type GameImageAssetSummary = {
  /** Content Patcher asset key (forward slashes, no extension), e.g. `Characters/Abigail`. */
  name: string
  relativePath: string
  absolutePath: string
  sizeBytes: number
}

/** Game data file summary (XNB/JSON under Content/Data) used by import pickers. */
export type GameDataAssetSummary = {
  /** Content Patcher asset key (forward slashes, no extension), e.g. `Data/ObjectInformation`. */
  name: string
  relativePath: string
  absolutePath: string
  sizeBytes: number
}

/** Single normalized resource entry from the global desktop resource registry. */
type ResourceRegistrySourceKind = 'game' | 'mod' | 'project' | 'fallback' | (string & {})

export type ResourceRegistryEntry = {
  id: string
  kind: 'actor' | 'item' | 'location' | 'music' | 'sound'
  value: string
  label: string
  source: string
  sourceKind: ResourceRegistrySourceKind
  category: string | null
  metadata: Record<string, string>
  relativePath: string | null
  absolutePath: string | null
}

/** Global resource registry used by editors and resource browsers. */
export type ResourceRegistry = {
  entries: ResourceRegistryEntry[]
  warnings: string[]
}
