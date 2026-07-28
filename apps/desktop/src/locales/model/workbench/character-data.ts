/** Copy for the Data/Characters authoring editor. Owned by the character-data workspace slice. */
export type CharacterDataEditorCopy = {
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
    removeConfirmMessage: (npcId: string) => string
    removeConfirmAction: string
    cancelAction: string
    closeLabel: string
  }
  addDialog: {
    title: string
    subtitle: string
    nameLabel: string
    namePlaceholder: string
    nameHint: string
    prefixAction: string
    prefixHint: (uniqueId: string) => string
    homeSectionTitle: string
    homeSectionHint: string
    locationLabel: string
    locationPlaceholder: string
    tileXLabel: string
    tileYLabel: string
    directionLabel: string
    emptyError: string
    duplicateError: string
    locationMissingError: string
    tileNotNumericError: string
    confirmAction: string
    cancelAction: string
    closeLabel: string
  }
  /** Left pane: where the NPC being edited comes from. */
  sources: {
    title: string
    searchPlaceholder: string
    modeAll: string
    modeProject: string
    modeVanilla: string
    projectGroup: string
    vanillaGroup: string
    overrideBadge: string
    newBadge: string
    groupCount: (count: number) => string
    searchEmpty: string
    projectEmpty: string
    vanillaLoading: string
    vanillaUnavailable: string
    overrideAction: string
    overrideHint: string
  }
  /** Right pane: live preview of the entry being edited. */
  preview: {
    title: string
    breathingTitle: string
    walkingTitle: string
    portraitTitle: string
    variantLabel: string
    variantDefault: string
    frameSizeLabel: string
    empty: string
  }
  /** Data/NPCGiftTastes rows edited next to the character entry. */
  giftTastes: {
    title: string
    subtitle: string
    kindLove: string
    kindLike: string
    kindDislike: string
    kindHate: string
    kindNeutral: string
    reactionLabel: string
    reactionPlaceholder: string
    itemsLabel: string
    itemsPlaceholder: string
    itemsHint: string
    itemCount: (count: number) => string
    createAction: string
    createHint: string
    removeAction: string
    removeConfirmTitle: string
    removeConfirmMessage: (npcId: string) => string
    importVanillaAction: string
    importVanillaHint: string
    vanillaUnavailable: string
    notEditingHint: string
  }
  assets: {
    portraitTitle: string
    spriteTitle: string
    patchFound: string
    patchMissing: string
    fromFileLabel: string
    noFromFile: string
    fileInDraft: string
    fileNotInDraft: string
    manageHint: string
    openEditorAction: string
  }
  summary: {
    title: string
    identity: string
    birthday: string
    region: string
    romance: string
    romanceYes: string
    romanceNo: string
    loveInterest: string
    notSet: string
  }
}
