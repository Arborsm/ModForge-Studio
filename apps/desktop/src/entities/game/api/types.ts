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

export type MapAssetContent = {
  name: string
  format: 'tmx' | 'tbin' | 'xnb'
  absolutePath: string
  relativePath: string
  content: string
}

export type TextAssetContent = {
  absolutePath: string
  relativePath: string
  content: string
}

export type LocalTextFileContent = {
  absolutePath: string
  content: string
}

export type DefaultSaveSlotSummary = {
  slotName: string
  folderPath: string
  filePath: string
  modifiedTimeMs: number
}

export type AudioAssetSummary = {
  cue: string
  kind: 'music' | 'sound'
  absolutePath: string
  relativePath: string
}
