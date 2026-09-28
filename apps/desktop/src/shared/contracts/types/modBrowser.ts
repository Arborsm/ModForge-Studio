/** Whether the mod browser shows original game assets or mod-overridden assets. */
export type BrowserSourceMode = 'original' | 'mod'

/** One asset reference within a mod — key, label, target paths, and patch ids. */
export type ModAssetReference = {
  key: string
  label: string
  targets: string[]
  patchIds: string[]
}

/** Asset index for one mod — maps, events, characters, buildings, and items grouped by kind. */
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

/** Top-level mod asset index containing all mod groups. */
export type ModAssetIndex = {
  mods: ModAssetIndexGroup[]
}

/** One selectable entry in the mod browser — mod info, asset key/label, value, targets, and patch ids. */
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

/** One group of mod browser entries sharing the same mod. */
export type ModBrowserGroup<T> = {
  modId: string
  modName: string
  modPath: string
  pluginKind: string
  items: ModBrowserEntry<T>[]
}

/** One mod source entry — mod info, asset key/label, targets, and patch ids (no value payload). */
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
