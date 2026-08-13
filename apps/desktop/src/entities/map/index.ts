export * from './model'
export * from './model/lighting'
export { resolveTilesetImagePath } from './lib/assets'
export { getMapContentBounds, getMapPreviewBounds, hasVisibleMapContent } from './lib/mapContentBounds'
export type { MapContentBounds, MapContentBoundsOptions, MapPreviewBoundsOptions } from './lib/mapContentBounds'
export { normalizeMapName } from './lib/mapNames'
export { asMapPropertyString, unwrapMapPropertyValue } from './lib/properties'
export {
  AMBIENT_LIGHT_PROPERTY_KEY,
  AMBIENT_NIGHT_LIGHT_PROPERTY_KEY,
  DAY_TILES_PROPERTY_KEY,
  DOORS_PROPERTY_KEY,
  MAP_PROPERTY_CATEGORY_KEYS,
  MAP_PROPERTY_CATEGORY_ORDER,
  MUSIC_PROPERTY_KEY,
  NIGHT_TILES_PROPERTY_KEY,
  OUTDOORS_PROPERTY_KEY,
  WARP_PROPERTY_KEY,
  mapPropertyCategory,
  type MapPropertyCategory,
} from './lib/properties'
export { GAME_MUSIC_COMMON_CUES } from './lib/musicCues'
export {
  GAME_CLOCK_END_UNLIMITED,
  GAME_CLOCK_HOUR_MAX,
  GAME_CLOCK_HOUR_MIN,
  GAME_CLOCK_MAX_VALUE,
  GAME_CLOCK_MINUTE_STEPS,
  buildGameClockStepperValues,
  formatGameClockValue,
  isGameClockNextDay,
  isValidGameClockValue,
  parseMapMusicProperty,
  serializeMapMusicProperty,
  type MapMusicProperty,
} from './lib/musicProperty'
export {
  formatObjectPreviewMeta,
  getObjectDisplayName,
  getObjectInteractionTag,
  getObjectPropertyKeys,
  isLightMarkerObject,
  rankObjectForPreview,
} from './lib/mapObjectHelpers'
export { getActionTargetMap, getPortalTargetMapFromProperties, parsePortalTargetMapFromAction } from './lib/portalTargets'
export {
  CELL_OVERLAY_COLORS,
  CELL_OVERLAY_PROPERTY_KEYS,
  CELL_OVERLAY_RULES,
  applyCellOverlayRule,
  cellOverlayRule,
  deriveCellOverlayCells,
  paintCellOverlayCells,
  type CellOverlayRule,
} from './lib/cellProperties'
export { hasMixedFrameDurations, planCellAnimationHoist, setCellAnimation, type CellAnimationHoistPlan } from './lib/cellAnimations'
export { deriveCellOverlayView, type CellOverlayCell } from './lib/cellOverlayView'
export { paintCellOverlayObjects, writeCellPropertyObjects, type CellPropertyWriteStats } from './lib/cellOverlayObjects'
export {
  collectCellActions,
  formatActionWarp,
  formatTouchActionWarp,
  parseCellWarpAction,
  writeCellAction,
  type CellActionEntry,
} from './lib/cellActions'
export {
  FLIPPED_DIAGONALLY_FLAG,
  FLIPPED_HORIZONTALLY_FLAG,
  FLIPPED_VERTICALLY_FLAG,
  TILE_GID_FLAG_MASK,
  TILE_ID_MASK,
  extractTileFlags,
  stripTileGidFlags,
} from './lib/tileFlags'
export { findTilesetForGid } from './lib/tilesets'
export {
  cellFromGridPointer,
  cellFromSheetPointer,
  normalizeSelectionRect,
  pushRecentSelection,
  rememberTilesetSelection,
  selectionRectForSelection,
  tileIndexInSelection,
  tilesetSelectionFromRect,
  type NormalizedSelectionRect,
  type TilesetSelectionRect,
} from './lib/paletteSelection'
export { isExteriorWarp, parseWarpEntries, parseWarpProperty } from './lib/warps'
export {
  collectWarpEntries,
  parseDoorGroups,
  parseRawGroups,
  parseWarpGroups,
  serializeDoorGroups,
  serializeRawGroups,
  serializeWarpGroups,
  type DoorGroup,
  type WarpGroup,
  type WarpSourceEntry,
} from './lib/warps'
export {
  buildWorldAtlas,
  getExteriorWarpTargetNames,
  getWorldAtlasNameAliases,
  getWorldAtlasSeedNames,
  parseWorldMapLayout,
} from './lib/world'
export { buildAtlasWorldOverlaySprites, buildBuildingDataIndex, buildStageWorldOverlaySprites } from './model/worldStatePreview'
export type { StageBuildingDataEntry, StageWorldOverlaySprite } from './model/worldStatePreview'
export { createMapTileRect } from './model/tileSelection'
export type { MapInspectorHighlight, MapTileRect } from './model/tileSelection'
export { MapViewport } from './ui/MapViewport'
export { MapTilesetPalette } from './ui/MapTilesetPalette'
export type { MapTilesetPaletteSelection } from './ui/MapTilesetPalette'
export { MapLayerThumbnail } from './ui/MapLayerThumbnail'
export { loadMapThumbnail } from './ui/mapThumbnail'
export { default as MapWorldStatePreviewOverlay } from './ui/MapWorldStatePreviewOverlay'
export type { MapViewportHandle } from './ui/MapViewport'
export type { WarpEntry } from './lib/warps'
export type { WorldMapLayout, WorldMapLayoutArea } from './lib/world'
export type * from './lib/types'
