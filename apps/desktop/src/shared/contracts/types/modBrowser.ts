export type BrowserSourceMode = 'original' | 'mod'

export type ModAssetReference = {
  key: string
  label: string
  targets: string[]
  patchIds: string[]
}

export type ModAssetIndexGroup = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  maps: ModAssetReference[]
  events: ModAssetReference[]
  characters: ModAssetReference[]
  buildings: ModAssetReference[]
  items: ModAssetReference[]
}

export type ModAssetIndex = {
  mods: ModAssetIndexGroup[]
}

export type ModBrowserEntry<T> = {
  selectionId: string
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  key: string
  label: string
  value: T
  targets: string[]
  patchIds: string[]
}

export type ModBrowserGroup<T> = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  items: ModBrowserEntry<T>[]
}

export type ModSourceEntry = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  key: string
  label: string
  targets: string[]
  patchIds: string[]
}
