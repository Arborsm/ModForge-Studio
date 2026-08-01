export {
  enumLabelKey,
  fieldsInGroup,
  indexAssetFields,
  matchEnumValue,
  type AssetFieldSchema,
  type AssetGroupSchema,
  type AssetIssue,
  type AssetIssueSeverity,
  type AssetSchema,
  type AssetValidationContext,
  type FieldControl,
} from './model/fieldSchema'
export {
  isPlainObject,
  parseAssetEditorState,
  parseAssetEntry,
  serializeAssetEditorState,
  serializeAssetEntry,
  setAssetField,
  setNestedValue,
  type AssetEditorState,
  type AssetEntryDraft,
} from './model/entryDraft'
export { getAssetSchema, getEnumCatalog, listAssetSchemaIds, registerAssetSchema, registerEnumCatalog } from './model/registry'
export { findTexturePatchState, type AssetTexturePatchInput, type AssetTexturePatchState } from './model/texturePatch'
export { countAssetIssues, formatIssuePath, validateAssetEntries, validateAssetEntry } from './model/validation'
export { VANILLA_DATA_TARGETS, VANILLA_IMAGE_TARGETS, VANILLA_MAP_TARGETS } from './model/vanillaAssets'
export {
  EMPTY_ASSET_RESOURCES,
  resourceOptionLabel,
  resourceOptionHasValue,
  resourceOptionMatches,
  resourceOptionsFor,
  resourceSpriteStyle,
  type AssetResources,
  type ResourceOption,
  type ResourceRefKind,
  type ResourceSprite,
} from './model/resources'
export {
  COLOR_NAMES,
  COLOR_SWATCH_PRESETS,
  colorFromNameOrHex,
  colorNameFor,
  colorToCss,
  colorToCssHex,
  formatColorValue,
  parseColorValue,
  prefersLightForeground,
  type ColorRgb,
  type ColorValueFormat,
  type ParsedColorValue,
} from './model/colorValue'
export { AssetEntryCanvas, type AssetEntryCanvasProps } from './ui/AssetEntryCanvas'
export { AssetFieldRenderer, type AssetFieldRendererProps } from './ui/AssetFieldRenderer'
export { AssetValidationRail, type AssetValidationRailProps } from './ui/AssetValidationRail'
export { GameTextLibraryDialog, type GameTextLibraryDialogProps } from './ui/GameTextLibraryDialog'
export {
  ColorField,
  LocalizedTextField,
  ResourcePickerField,
  SeasonField,
  type RenderResourcePickerControl,
  type ResourcePickerControlProps,
  type SeasonOption,
} from './ui/visualControls'
export type { GsqBuilderRequest, OpenGsqBuilder } from './ui/controls'
