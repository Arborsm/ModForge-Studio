/** Copy for the Data/Objects authoring editor. Owned by the item-data workspace slice. */
export type ItemDataEditorCopy = {
  title: string
  subtitle: string
  addEntryAction: string
  removeEntryAction: string
  emptyTitle: string
  emptyHint: string
  entries: {
    label: string
    count: (count: number) => string
    removeConfirmTitle: string
    removeConfirmMessage: (objectId: string) => string
    removeConfirmAction: string
    cancelAction: string
    closeLabel: string
  }
  addDialog: {
    title: string
    subtitle: string
    idLabel: string
    idPlaceholder: string
    idHint: string
    prefixAction: string
    prefixHint: (uniqueId: string) => string
    basicsSectionTitle: string
    basicsSectionHint: string
    displayNameLabel: string
    displayNamePlaceholder: string
    typeLabel: string
    categoryLabel: string
    priceLabel: string
    spriteSectionTitle: string
    spriteSectionHint: string
    spritePickHint: string
    textureLabel: string
    texturePlaceholder: string
    spriteIndexLabel: string
    edibilityLabel: string
    edibilityHint: (sentinel: number) => string
    emptyError: string
    duplicateError: string
    spriteIndexError: string
    confirmAction: string
    cancelAction: string
    closeLabel: string
  }
  /** Left pane: which asset family and which object is being edited. */
  families: {
    title: string
    supportedBadge: string
    rawBadge: string
    rawHint: string
    /** Family names, keyed by `ItemKind`. */
    labels: {
      object: string
      'big-craftable': string
      weapon: string
      tool: string
      shirt: string
      pants: string
      trinket: string
      hat: string
      boots: string
      furniture: string
    }
  }
  sources: {
    title: string
    searchPlaceholder: string
    modeAll: string
    modeProject: string
    modeVanilla: string
    projectGroup: string
    vanillaGroup: string
    placeholderGroup: string
    overrideBadge: string
    newBadge: string
    groupCount: (count: number) => string
    searchEmpty: string
    projectEmpty: string
    vanillaLoading: string
    vanillaUnavailable: string
    overrideHint: string
    ungroupedLabel: string
    /** Shown when a group renders only part of its rows, to keep the list responsive. */
    truncatedHint: (shown: number, total: number) => string
  }
  /** Right pane: live preview of the entry being edited. */
  preview: {
    title: string
    empty: string
    spriteMissing: string
    spriteHint: (texture: string, index: number) => string
  }
  summary: {
    title: string
    type: string
    category: string
    price: string
    edibility: string
    buffs: string
    contextTags: string
    notSet: string
    inedible: string
    goldValue: (amount: number) => string
    energyValue: (amount: number) => string
    countValue: (count: number) => string
  }
  /** The sprite sheet the entry points at, alongside the patch that provides it. */
  texture: {
    title: string
    assetLabel: string
    vanillaSheet: string
    patchFound: string
    patchMissing: string
    manageHint: string
    openEditorAction: string
  }
}
