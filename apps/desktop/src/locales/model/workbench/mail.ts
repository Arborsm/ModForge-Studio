/** Copy for the mail authoring module (mail-editor). Owned by the mail workspace slice. */
export type MailEditorCopy = {
  title: string
  subtitle: string
  saveAction: string
  revertAction: string
  savingStatus: string
  saveErrorStatus: string
  savedStatus: string
  dirtyBadge: string
  noProjectTitle: string
  noProjectHint: string
  list: {
    heading: string
    countTemplate: string
    searchPlaceholder: string
    newLetterAction: string
    emptyTitle: string
    emptyHint: string
    filteredEmpty: string
    untitled: string
    errorBadgeTemplate: string
    warningBadgeTemplate: string
    /** Explains why the letter list is grouped by delivery method. */
    deliveryHint: string
    /** Section headings of the delivery-grouped letter rail. */
    deliveryGroups: {
      dayStarted: string
      dayEnding: string
      locationChanged: string
      customTrigger: string
      noTrigger: string
    }
    vanillaHeading: string
    vanillaHint: string
    vanillaSearchPlaceholder: string
    vanillaCopyAction: string
    vanillaEmpty: string
    vanillaFilteredEmpty: string
    vanillaMissing: string
    vanillaLoading: string
  }
  editor: {
    bodyLabel: string
    bodyPlaceholder: string
    insertPlayerName: string
    insertLineBreak: string
    insertGenderSplit: string
    insertAttachment: string
    insertCookingRecipe: string
    insertCraftingRecipe: string
    insertQuest: string
    textColorLabel: string
    attachmentsLabel: string
    attachmentsEmpty: string
    removeAttachmentLabel: string
    actionsPreservedTemplate: string
    noSelectionTitle: string
    noSelectionHint: string
  }
  preview: {
    heading: string
    playerName: string
    genderBadge: string
    attachmentsHeading: string
    backgroundLoading: string
    backgroundMissing: string
    secretSantaPlaceholder: string
    collectionTitleBadge: string
  }
  info: {
    heading: string
    mailIdLabel: string
    mailIdPlaceholder: string
    applyModPrefixAction: string
    collectionTitleLabel: string
    collectionTitlePlaceholder: string
    backgroundLabel: string
    customBackgroundTemplate: string
    textColorLabel: string
    textColorDefault: string
    statusHeading: string
    statusOk: string
    deleteAction: string
  }
  backgrounds: {
    default: string
    sandy: string
    wizard: string
    krobus: string
    joja: string
  }
  colors: {
    black: string
    blue: string
    cyan: string
    gray: string
    green: string
    orange: string
    purple: string
    red: string
    white: string
  }
  attachments: {
    dialogTitle: string
    dialogSubtitle: string
    kindLabel: string
    kinds: {
      id: string
      object: string
      bigobject: string
      furniture: string
      tools: string
      money: string
      quest: string
      cookingRecipe: string
      craftingRecipe: string
      conversationTopic: string
      specialOrder: string
      itemRecovery: string
      unknown: string
    }
    deprecatedBadge: string
    itemsLabel: string
    itemIdLabel: string
    itemIdPlaceholder: string
    countLabel: string
    addItemRowAction: string
    removeItemRowLabel: string
    randomPickHint: string
    moneyMinLabel: string
    moneyMaxLabel: string
    moneyMaxHint: string
    questIdLabel: string
    questAutoLabel: string
    recipeKeyLabel: string
    cookingRecipeKeyHint: string
    topicIdLabel: string
    topicDaysLabel: string
    orderIdLabel: string
    orderImmediateLabel: string
    toolsLabel: string
    toolNames: {
      Axe: string
      Hoe: string
      Can: string
      Pickaxe: string
      Scythe: string
    }
    unknownBodyLabel: string
    insertAction: string
    cancelAction: string
    closeLabel: string
    chipIdTemplate: string
    chipMoneyTemplate: string
    chipMoneyRangeTemplate: string
    chipQuestTemplate: string
    chipQuestAutoTemplate: string
    chipCookingRecipe: string
    chipCookingRecipeTemplate: string
    chipCraftingRecipeTemplate: string
    chipTopicTemplate: string
    chipOrderTemplate: string
    chipItemRecovery: string
    chipToolsTemplate: string
    chipUnknownTemplate: string
  }
  gender: {
    dialogTitle: string
    dialogSubtitle: string
    maleLabel: string
    malePlaceholder: string
    femaleLabel: string
    femalePlaceholder: string
    insertAction: string
    cancelAction: string
    closeLabel: string
  }
  /**
   * Delivery of the active letter: when the player receives it. Backed by
   * `Data/TriggerActions`, but presented as a property of the letter itself.
   */
  delivery: {
    heading: string
    subtitle: string
    addAction: string
    empty: string
    /** Card heading of one delivery rule, numbered in list order. */
    ruleTitleTemplate: string
    whenLabel: string
    eventDayStarted: string
    eventDayEnding: string
    eventLocationChanged: string
    eventCustom: string
    customEventPlaceholder: string
    recipientLabel: string
    targetCurrent: string
    targetHost: string
    targetAll: string
    timingLabel: string
    deliveryTomorrow: string
    deliveryNow: string
    deliveryReceived: string
    deliveryAll: string
    conditionLabel: string
    conditionPlaceholder: string
    /** Shown in place of the condition when the rule has none. */
    conditionNone: string
    openBuilderAction: string
    clearConditionAction: string
    onceLabel: string
    onceHint: string
    hostOnlyLabel: string
    hostOnlyHint: string
    removeAction: string
    extraActionsTemplate: string
    /** Heading of the expert-only block holding the raw TriggerAction id. */
    expertHeading: string
    idLabel: string
    idPlaceholder: string
  }
  deleteDialog: {
    title: string
    bodyTemplate: string
    triggerCountTemplate: string
    confirmAction: string
    cancelAction: string
    closeLabel: string
  }
  validation: {
    emptyBody: string
    mailIdMissing: string
    invalidMailId: string
    duplicateMailId: string
    missingModIdPrefix: string
    reservedMailIdTemplate: string
    unknownLetterBgTemplate: string
    malformedAttachmentTemplate: string
    deprecatedAttachmentTemplate: string
    attachmentItemMissing: string
    moneyAmountMissing: string
    moneyRangeInvalid: string
    questIdMissing: string
    craftingRecipeKeyMissing: string
    cookingRecipeKeyConvention: string
    conversationTopicInvalid: string
    toolsInvalidTemplate: string
    noDeliveryTrigger: string
    triggerMissingId: string
    duplicateTriggerIdTemplate: string
    triggerMissingEventTemplate: string
    /** Every rule only flags the letter as received, so it never reaches a mailbox. */
    deliveryNeverShown: string
    /** `HostOnly` rule delivering to `Current`: farmhands never run it. */
    deliveryHostOnlyMismatchTemplate: string
  }
}
