/**
 * Copy for the schema-driven asset editors (`AssetEntryCanvas`,
 * `AssetFieldRenderer`, `AssetValidationRail`).
 *
 * Every `AssetFieldSchema.labelKey` / `AssetSchema.groups[].labelKey` /
 * `AssetIssue.messageKey` resolves against this bundle, so a field label exists
 * exactly once no matter how many pages render the same schema (authoring page,
 * browser page read-only detail, validation rail).
 */

/** Label plus optional hint shown under one control. */
export type AssetFieldLabel = { label: string; hint?: string }

/**
 * Reference kinds the shared resource picker can browse. Mirrors the `*_ref`
 * members of `FieldControl`; declared here so the locale layer keeps its
 * one-way dependency (a locale bundle never imports an entity).
 */
export type AssetPickerKindKey = 'npc' | 'item' | 'location' | 'texture' | 'map' | 'building'

/**
 * Category buckets of the game's `Strings/*` tables, browsed by the game text
 * library. Declared here rather than in the game entity so the label record
 * below stays exhaustive; `StringCatalogCategory` aliases this type.
 */
export type AssetTextCategoryKey = 'items' | 'characters' | 'locations' | 'ui' | 'dialogue' | 'quests' | 'events' | 'misc'

/** Collapsible group titles referenced by `AssetSchema.groups[].labelKey`. */
export type AssetGroupLabelKey =
  | 'character.core'
  | 'character.personality'
  | 'character.spawn'
  | 'character.social'
  | 'character.festival'
  | 'character.render'
  | 'character.advanced'
  | 'building.basics'
  | 'building.construction'
  | 'building.placement'
  | 'building.skins'
  | 'building.upgrade'
  | 'building.indoor'
  | 'building.texture'
  | 'building.advanced'
  | 'object.basics'
  | 'object.economy'
  | 'object.consumable'
  | 'object.sprite'
  | 'object.geode'
  | 'object.advanced'

/** Field titles referenced by `AssetFieldSchema.labelKey`. */
export type AssetFieldLabelKey =
  | 'character.displayName'
  | 'character.birthSeason'
  | 'character.birthDay'
  | 'character.homeRegion'
  | 'character.language'
  | 'character.gender'
  | 'character.age'
  | 'character.manner'
  | 'character.socialAnxiety'
  | 'character.optimism'
  | 'character.isDarkSkinned'
  | 'character.canBeRomanced'
  | 'character.loveInterest'
  | 'character.calendar'
  | 'character.socialTab'
  | 'character.canSocialize'
  | 'character.canReceiveGifts'
  | 'character.canGreetNearbyCharacters'
  | 'character.canCommentOnPurchasedShopItems'
  | 'character.canVisitIsland'
  | 'character.introductionsQuest'
  | 'character.itemDeliveryQuests'
  | 'character.perfectionScore'
  | 'character.endSlideShow'
  | 'character.spouseAdopts'
  | 'character.spouseWantsChildren'
  | 'character.spouseGiftJealousy'
  | 'character.spouseGiftJealousyFriendshipChange'
  | 'character.spouseRoom'
  | 'character.spousePatio'
  | 'character.spouseFloors'
  | 'character.spouseWallpapers'
  | 'character.dumpsterDiveFriendshipEffect'
  | 'character.dumpsterDiveEmote'
  | 'character.friendsAndFamily'
  | 'character.flowerDanceCanDance'
  | 'character.winterStarGifts'
  | 'character.winterStarGiftId'
  | 'character.winterStarGiftItemId'
  | 'character.winterStarGiftMinStack'
  | 'character.winterStarGiftMaxStack'
  | 'character.winterStarParticipant'
  | 'character.unlockConditions'
  | 'character.spawnIfMissing'
  | 'character.home'
  | 'character.homeId'
  | 'character.homeCondition'
  | 'character.homeLocation'
  | 'character.homeTile'
  | 'character.homeDirection'
  | 'character.textureName'
  | 'character.appearance'
  | 'character.appearanceId'
  | 'character.appearanceCondition'
  | 'character.appearanceSeason'
  | 'character.appearanceIndoors'
  | 'character.appearanceOutdoors'
  | 'character.appearancePortrait'
  | 'character.appearanceSprite'
  | 'character.appearanceIsIslandAttire'
  | 'character.appearancePrecedence'
  | 'character.appearanceWeight'
  | 'character.mugShotSourceRect'
  | 'character.size'
  | 'character.breather'
  | 'character.breathChestRect'
  | 'character.breathChestPosition'
  | 'character.shadow'
  | 'character.shadowVisible'
  | 'character.shadowOffset'
  | 'character.shadowScale'
  | 'character.emoteOffset'
  | 'character.shakePortraits'
  | 'character.kissSpriteIndex'
  | 'character.kissSpriteFacingRight'
  | 'character.hiddenProfileEmoteSound'
  | 'character.hiddenProfileEmoteDuration'
  | 'character.hiddenProfileEmoteStartFrame'
  | 'character.hiddenProfileEmoteFrameCount'
  | 'character.hiddenProfileEmoteFrameDuration'
  | 'character.formerCharacterNames'
  | 'character.festivalVanillaActorIndex'
  | 'character.customFields'
  | 'building.name'
  | 'building.nameForGeneralType'
  | 'building.description'
  | 'building.buildingType'
  | 'building.magicalConstruction'
  | 'building.defaultAction'
  | 'building.builder'
  | 'building.buildCondition'
  | 'building.buildDays'
  | 'building.buildCost'
  | 'building.buildMaterials'
  | 'building.materialItemId'
  | 'building.materialAmount'
  | 'building.addMailOnBuild'
  | 'building.skins'
  | 'building.skinId'
  | 'building.skinName'
  | 'building.skinNameForGeneralType'
  | 'building.skinDescription'
  | 'building.skinTexture'
  | 'building.skinCondition'
  | 'building.skinBuildDays'
  | 'building.skinBuildCost'
  | 'building.skinBuildMaterials'
  | 'building.skinShowAsSeparateEntry'
  | 'building.skinMetadata'
  | 'building.size'
  | 'building.collisionMap'
  | 'building.additionalPlacementTiles'
  | 'building.placementTileArea'
  | 'building.placementTileOnlyPassable'
  | 'building.allowsFlooringUnderneath'
  | 'building.humanDoor'
  | 'building.animalDoor'
  | 'building.animalDoorOpenDuration'
  | 'building.animalDoorOpenSound'
  | 'building.animalDoorCloseDuration'
  | 'building.animalDoorCloseSound'
  | 'building.additionalTilePropertyRadius'
  | 'building.actionTiles'
  | 'building.tileProperties'
  | 'building.buildingToUpgrade'
  | 'building.upgradeSignTile'
  | 'building.upgradeSignHeight'
  | 'building.indoorMap'
  | 'building.indoorMapType'
  | 'building.nonInstancedIndoorLocation'
  | 'building.maxOccupants'
  | 'building.validOccupantTypes'
  | 'building.allowAnimalPregnancy'
  | 'building.hayCapacity'
  | 'building.indoorItems'
  | 'building.indoorItemMoves'
  | 'building.chests'
  | 'building.texture'
  | 'building.sourceRect'
  | 'building.seasonOffset'
  | 'building.drawOffset'
  | 'building.buildMenuDrawOffset'
  | 'building.sortTileOffset'
  | 'building.drawShadow'
  | 'building.fadeWhenBehind'
  | 'building.drawLayers'
  | 'building.itemConversions'
  | 'building.metadata'
  | 'building.modData'
  | 'building.customFields'
  | 'object.name'
  | 'object.displayName'
  | 'object.description'
  | 'object.type'
  | 'object.category'
  | 'object.contextTags'
  | 'object.price'
  | 'object.canBeGivenAsGift'
  | 'object.canBeTrashed'
  | 'object.excludeFromShippingCollection'
  | 'object.excludeFromFishingCollection'
  | 'object.excludeFromRandomSale'
  | 'object.edibility'
  | 'object.isDrink'
  | 'object.buffs'
  | 'object.buffRowId'
  | 'object.buffBuffId'
  | 'object.buffDuration'
  | 'object.buffIsDebuff'
  | 'object.buffIconTexture'
  | 'object.buffIconSpriteIndex'
  | 'object.buffGlowColor'
  | 'object.buffCustomAttributes'
  | 'object.buffCustomFields'
  | 'object.attrFarmingLevel'
  | 'object.attrFishingLevel'
  | 'object.attrMiningLevel'
  | 'object.attrForagingLevel'
  | 'object.attrCombatLevel'
  | 'object.attrLuckLevel'
  | 'object.attrMaxStamina'
  | 'object.attrMagneticRadius'
  | 'object.attrSpeed'
  | 'object.attrDefense'
  | 'object.attrAttack'
  | 'object.attrImmunity'
  | 'object.attrAttackMultiplier'
  | 'object.attrKnockbackMultiplier'
  | 'object.attrWeaponSpeedMultiplier'
  | 'object.attrWeaponPrecisionMultiplier'
  | 'object.attrCriticalChanceMultiplier'
  | 'object.attrCriticalPowerMultiplier'
  | 'object.texture'
  | 'object.spriteIndex'
  | 'object.colorOverlayFromNextIndex'
  | 'object.geodeDropsDefaultItems'
  | 'object.geodeDrops'
  | 'object.geodeRowId'
  | 'object.geodeItemId'
  | 'object.geodeRandomItemId'
  | 'object.geodeMaxItems'
  | 'object.geodeMinStack'
  | 'object.geodeMaxStack'
  | 'object.geodeQuality'
  | 'object.geodeChance'
  | 'object.geodePrecedence'
  | 'object.geodeCondition'
  | 'object.geodePerItemCondition'
  | 'object.geodeIsRecipe'
  | 'object.geodeToolUpgradeLevel'
  | 'object.geodeObjectInternalName'
  | 'object.geodeObjectDisplayName'
  | 'object.geodeObjectColor'
  | 'object.geodeSetFlagOnPickup'
  | 'object.geodeStackModifiers'
  | 'object.geodeStackModifierMode'
  | 'object.geodeQualityModifiers'
  | 'object.geodeQualityModifierMode'
  | 'object.geodeModData'
  | 'object.artifactSpotChances'
  | 'object.customFields'

/**
 * Enum option labels, keyed `<catalog id>.<canonical value>`. The catalog id
 * matches `AssetFieldSchema.enumCatalog`.
 */
export type AssetEnumLabelKey =
  | 'character.gender.Undefined'
  | 'character.gender.Male'
  | 'character.gender.Female'
  | 'character.age.Adult'
  | 'character.age.Teen'
  | 'character.age.Child'
  | 'character.season.Spring'
  | 'character.season.Summer'
  | 'character.season.Fall'
  | 'character.season.Winter'
  | 'character.manner.Neutral'
  | 'character.manner.Polite'
  | 'character.manner.Rude'
  | 'character.socialAnxiety.Neutral'
  | 'character.socialAnxiety.Outgoing'
  | 'character.socialAnxiety.Shy'
  | 'character.optimism.Neutral'
  | 'character.optimism.Positive'
  | 'character.optimism.Negative'
  | 'character.language.Default'
  | 'character.language.Dwarvish'
  | 'character.calendar.AlwaysShown'
  | 'character.calendar.HiddenUntilMet'
  | 'character.calendar.HiddenAlways'
  | 'character.socialTab.UnknownUntilMet'
  | 'character.socialTab.AlwaysShown'
  | 'character.socialTab.HiddenUntilMet'
  | 'character.socialTab.HiddenAlways'
  | 'character.endSlideShow.Hidden'
  | 'character.endSlideShow.MainGroup'
  | 'character.endSlideShow.TrailingGroup'
  | 'character.direction.up'
  | 'character.direction.down'
  | 'character.direction.left'
  | 'character.direction.right'

/** Validation messages referenced by `AssetIssue.messageKey`. */
export type AssetIssueMessageKey =
  | 'requiredMissing'
  | 'enumUnknown'
  | 'duplicateEntryKey'
  | 'event.scriptEmpty'
  | 'event.sceneSetupIncomplete'
  | 'event.missingEnd'
  | 'event.commandUnknown'
  | 'event.actorNotInScene'
  | 'event.preconditionUnknown'
  | 'event.preconditionDeprecated'
  | 'patch.sourceFileMissing'
  | 'manifest.nameMissing'
  | 'manifest.uniqueIdMissing'
  | 'manifest.uniqueIdShape'
  | 'manifest.versionInvalid'
  | 'manifest.authorMissing'
  | 'manifest.contentPackForMissing'
  | 'manifest.versionShape'
  | 'manifest.updateKeyShape'
  | 'manifest.dependencyUniqueIdMissing'
  | 'manifest.dependencyDuplicate'
  | 'topLevel.dynamicTokenNameMissing'
  | 'topLevel.dynamicTokenDuplicate'
  | 'topLevel.customLocationNameMissing'
  | 'topLevel.customLocationMapMissing'
  | 'topLevel.aliasEmpty'
  | 'topLevel.aliasSelfReference'
  | 'editData.fieldsOverlapEntries'
  | 'editData.textOpOverlapsEntries'
  | 'topLevel.dynamicTokenShadowsBuiltin'
  | 'topLevel.dynamicTokenShadowsConfig'
  | 'topLevel.aliasTokenUnknownTarget'
  | 'character.birthDayRange'
  | 'character.homeTileNotNumeric'
  | 'character.appearanceIdDuplicate'
  | 'character.appearanceNoTexture'
  | 'character.appearanceNeverVisible'
  | 'character.appearanceWeightNonPositive'
  | 'character.giftTasteOrphanEntry'
  | 'character.giftTasteReactionMissing'
  | 'character.giftTasteTokenDelimiter'
  | 'character.giftTasteDuplicateToken'
  | 'building.sizeInvalid'
  | 'building.materialAmountInvalid'
  | 'building.materialItemUnknown'
  | 'building.skinIdDuplicate'
  | 'building.upgradeTargetUnknown'
  | 'building.upgradeChainCycle'
  | 'building.tileOutOfBounds'
  | 'building.placementTileEmptyArea'
  | 'building.placementTileRedundant'
  | 'building.indoorMapMissing'
  | 'building.occupantsWithoutInterior'
  | 'object.priceNegative'
  | 'object.categoryUnusual'
  | 'object.edibilityBelowSentinel'
  | 'object.spriteIndexInvalid'
  | 'object.buffIdDuplicate'
  | 'object.buffsWithoutEdibility'
  | 'object.geodeDropIdDuplicate'
  | 'object.geodeStackRangeInvalid'
  | 'object.geodeChanceUnreachable'
  | 'object.artifactSpotChancesShape'
  | 'object.artifactSpotChanceInvalid'
  | 'object.internalNameDuplicate'
  | 'object.textureMissing'

/** Interpolation values carried by one issue; readers pick the keys they need. */
export type AssetIssueParams = Readonly<Record<string, string | number>>

export type AssetAuthoringCopy = {
  /** Control and canvas chrome shared by every schema-driven editor. */
  chrome: {
    defaultOption: string
    yes: string
    no: string
    addAction: string
    removeAction: string
    keyHeader: string
    valueHeader: string
    invalidJson: string
    invalidNumberList: string
    unknownValue: (value: string) => string
    openConditionBuilder: string
    listEntryTitle: (index: number) => string
    listEmpty: string
    unknownFieldsTitle: string
    unknownFieldsHint: string
    unknownFieldsCount: (count: number) => string
    readOnlyEmptyValue: string
    localizedReferenceHint: (reference: string) => string
    localizedRewriteAction: string
    localizedTableFailed: string
  }
  /** Reference picker shared by npc / item / location / texture / map fields. */
  picker: {
    kindLabels: Record<AssetPickerKindKey, string>
    browseAction: string
    dialogTitle: (kind: string) => string
    searchPlaceholder: string
    categoryFilterLabel: string
    allCategories: string
    resultCount: (visible: number, total: number) => string
    empty: string
    customValueTitle: string
    customValueHint: (value: string) => string
    clearAction: string
    confirm: string
    cancel: string
    currentSelection: (value: string) => string
    noSelection: string
    unresolvedHint: string
  }
  /** Visual RGB colour control. */
  color: {
    swatchLabel: string
    channelLabels: Record<'r' | 'g' | 'b', string>
    hexLabel: string
    invalid: string
    clearAction: string
    presetsLabel: string
    /** Shown when the stored value is a named colour the picker keeps verbatim. */
    namedValueHint: (name: string) => string
  }
  /** Season chip row rendered instead of a plain enum select. */
  season: {
    anyOption: string
    legend: string
  }
  /** Game text library browsing the vanilla `Strings/*` tables. */
  textLibrary: {
    openAction: string
    dialogTitle: string
    searchPlaceholder: string
    categoryLabels: Record<AssetTextCategoryKey, string>
    assetHeader: string
    keyHeader: string
    textHeader: string
    loading: string
    empty: string
    loadFailed: (asset: string) => string
    resultCount: (visible: number, total: number) => string
    tokenPreview: (token: string) => string
    insertToken: string
    insertPlainText: string
    cancel: string
    minQueryHint: string
  }
  /** Right-rail validation summary. */
  validation: {
    title: string
    empty: string
    severity: Record<'error' | 'warning' | 'info', string>
    countSummary: (errors: number, warnings: number) => string
    pathLabel: (path: string) => string
  }
  /** Explicit raw-JSON escape hatch offered next to every structured editor. */
  raw: {
    openAction: string
    closeAction: string
    title: string
    hint: string
    invalidJson: string
    /** Shown instead of the editor when expert mode is off. */
    expertOnlyTitle: string
    /** Points the user to the header toggle that unlocks raw editing. */
    expertOnlyHint: string
  }
  groups: Record<AssetGroupLabelKey, string>
  fields: Record<AssetFieldLabelKey, AssetFieldLabel>
  enums: Record<AssetEnumLabelKey, string>
  issues: Record<AssetIssueMessageKey, (params: AssetIssueParams) => string>
}
