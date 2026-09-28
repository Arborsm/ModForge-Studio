export { loadItemTextureAssetState, loadItemWorkspaceEntries, loadVanillaObjectRecords } from './api/itemAssets'
export * from './model/itemIndex'
export {
  addObjectEntry,
  createMinimalObjectEntry,
  DEFAULT_OBJECT_ENTRY_SEED,
  displayNameFromObjectId,
  ITEM_ID_TOKEN_PREFIX,
  OBJECT_BUFF_ID_SUGGESTIONS,
  OBJECT_DATA_ASSET_ID,
  OBJECT_FIELD_ORDER,
  OBJECT_INEDIBLE,
  OBJECT_TYPE_SUGGESTIONS,
  OBJECT_VANILLA_CATEGORIES,
  type AddObjectEntryResult,
  type ObjectEntrySeed,
} from './model/itemObjectFields'
export { useItemAuthoringHandoff } from './model/authoringHandoff'
export {
  findItemAssetFamily,
  findItemAssetFamilyByAssetId,
  isStructuredItemAsset,
  ITEM_ASSET_FAMILIES,
  resolveItemAuthoringTarget,
  resolveItemFamilyTarget,
  type ItemAssetFamily,
  type ItemAuthoringEditor,
  type ItemAuthoringTarget,
} from './model/itemAssetFamilies'
export { OBJECT_DATA_SCHEMA } from './model/itemObjectSchema'
export { validateObjectEntries, type ItemValidationContext } from './model/validation'
export { AtlasSprite } from './ui/AtlasSprite'
export type { AtlasSpriteRect, AtlasSpriteTexture } from './ui/AtlasSprite'
export { ItemSprite } from './ui/ItemSprite'
