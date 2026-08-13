import { asMapPropertyString } from '../lib/properties'
import { stripTileGidFlags } from '../lib/tileFlags'
import { findTilesetForGid } from '../lib/tilesets'
import type { MapDocument, MapObject, MapPropertyValue } from '../lib/types'

/**
 * Stardew Valley world-lighting model (Game1.DrawLighting / UpdateGameClock /
 * GameLocation light sources), reduced to pure data so previews can bake the
 * same lightmap the game composes on the GPU.
 *
 * The game renders a lightmap render target: cleared to black, filled with the
 * ambient base color, then each light source lerps the map toward its tint. The
 * lightmap is finally blended over the scene with `ReverseSubtract` — the
 * stored base color arrives premultiplied by its own alpha, so the effective
 * darkening is `scene - stored^2` per channel. Previews approximate that with a
 * multiply blend whose overlay channel is `255 - stored^2 / 255` (see
 * `computeLightingOverlayChannel`).
 */

export type GameSeason = 'spring' | 'summer' | 'fall' | 'winter'

/** One 0-255 RGB triple in the game's lightmap color space. */
export type LightingColor = {
  r: number
  g: number
  b: number
}

/**
 * One light source composited into the lightmap. Positions are world pixels;
 * the game's `LightSource` draws its light texture (LooseSprites/Lighting/*)
 * at native size times `scale` (the game's `radius`), tinted `color`, using a
 * non-premultiplied blend — the lightmap lerps toward texel×tint with the
 * texture's alpha as the weight.
 */
export type LightingGlow = {
  worldX: number
  worldY: number
  /** LightSource texture index (1 lantern, 2 windowLight, 4 sconce, 6 indoorWindowLight). */
  textureIndex: number
  /** Uniform texture scale — the game's LightSource radius. */
  scale: number
  color: LightingColor
}

/**
 * Static lightmap state for one preview frame. `baseColor: null` means the
 * game would not draw lighting at all (sunny daytime outdoors).
 */
export type WorldLightingState = {
  baseColor: LightingColor | null
  glows: LightingGlow[]
}

/** Game tile edge in world pixels. */
export const GAME_TILE_SIZE = 64

/** Default indoor ambient light (GameLocation.indoorLightingColor). */
export const INDOOR_LIGHTMAP_DAY: LightingColor = { r: 100, g: 120, b: 30 }
/** Indoor ambient light the default lerps to once fully dark. */
export const INDOOR_LIGHTMAP_NIGHT: LightingColor = { r: 150, g: 150, b: 30 }
/** Default MineShaft lighting color. */
export const MINE_LIGHTMAP_COLOR: LightingColor = { r: 80, g: 80, b: 40 }
/** Default tint of an event `addLantern` light (TemporaryAnimatedSprite: Color(0,65,128); reads as warm light). */
export const EVENT_LANTERN_LIGHT_COLOR: LightingColor = { r: 0, g: 65, b: 128 }
/** Map `Light`/`WindowLight` property lights use a black tint: pure bright spots. */
export const MAP_PROPERTY_LIGHT_COLOR: LightingColor = { r: 0, g: 0, b: 0 }
/** Cool-blue tint of lit torches, fireplaces and lamp furniture (Color(0,80,160)). */
export const OBJECT_FIRE_LIGHT_COLOR: LightingColor = { r: 0, g: 80, b: 160 }
/** Dimmer cool-blue tint of IsLamp big craftables like lamp posts (Color(0,40,80)). */
export const BIG_CRAFTABLE_LAMP_LIGHT_COLOR: LightingColor = { r: 0, g: 40, b: 80 }
/** (BC)74 Bonfire light tint (Color.DarkCyan). */
export const BONFIRE_LIGHT_COLOR: LightingColor = { r: 0, g: 139, b: 139 }
/** (BC)96 Strange Capsule light tint (Color.HotPink × 0.75). */
export const STRANGE_CAPSULE_LIGHT_COLOR: LightingColor = { r: 191, g: 78, b: 135 }

/**
 * Native pixel sizes of the game's LooseSprites/Lighting textures, keyed by
 * LightSource texture index. The game draws each texture at native size times
 * the source's radius. Index 5 (cauldron) reuses the sconce geometry; unknown
 * indexes use the fallback.
 */
export const LIGHT_GLOW_TEXTURE_SIZES: Record<number, { widthPx: number; heightPx: number }> = {
  1: { widthPx: 128, heightPx: 128 }, // lantern
  2: { widthPx: 192, heightPx: 192 }, // windowLight
  4: { widthPx: 512, heightPx: 512 }, // sconce
  5: { widthPx: 512, heightPx: 512 }, // cauldron (same texture family)
  6: { widthPx: 493, heightPx: 638 }, // indoorWindowLight
}
const LIGHT_GLOW_TEXTURE_FALLBACK_SIZE = { widthPx: 256, heightPx: 256 }

/** Native size of a light-glow texture; falls back for unknown texture indexes. */
export function getLightingGlowTextureSize(textureIndex: number) {
  return LIGHT_GLOW_TEXTURE_SIZES[textureIndex] ?? LIGHT_GLOW_TEXTURE_FALLBACK_SIZE
}

/** Time of day (HHMM) when the world starts getting dark for a season. */
export function getStartingToGetDarkTime(season: GameSeason) {
  if (season === 'winter') {
    return 1500
  }
  if (season === 'fall') {
    return 1700
  }
  return 1800
}

/** Time of day (HHMM) when the world is fully dark (start + 2 hours). */
export function getTrulyDarkTime(season: GameSeason) {
  return getStartingToGetDarkTime(season) + 200
}

/** Time of day (HHMM) when map window lights turn off (trulyDark - 1 hour). */
export function getWindowLightsOffTime(season: GameSeason) {
  return getTrulyDarkTime(season) - 100
}

/** Evening sky tint used for the outdoor lightmap base (Game1 evening colors). */
export function getEveningColor(season: GameSeason): LightingColor {
  return season === 'winter' ? { r: 245, g: 225, b: 170 } : { r: 255, g: 255, b: 0 }
}

/**
 * Converts an HHMM clock value to the game's clock units (one unit per 0.6
 * minutes): whole hours plus ten-minute steps scaled by 16.66.
 */
export function toGameClockUnits(timeOfDay: number) {
  const hours = timeOfDay - (timeOfDay % 100)
  const minutes = timeOfDay % 100
  return hours + Math.floor(minutes / 10) * 16.66
}

/** Converts an HHMM clock value to plain minutes. */
export function clockToMinutes(timeOfDay: number) {
  return Math.floor(timeOfDay / 100) * 60 + (timeOfDay % 100)
}

/**
 * Outdoor light factor (Game1.outdoorLight alpha) for a clock time; `null`
 * before the world starts getting dark, where the game skips lighting
 * entirely. Ramps 0.3 -> 0.93 until fully dark, then creeps 0.75 -> 0.93.
 */
export function deriveOutdoorLightFactor(timeOfDay: number, season: GameSeason): number | null {
  const start = getStartingToGetDarkTime(season)
  if (timeOfDay < start) {
    return null
  }
  const trulyDark = getTrulyDarkTime(season)
  const units = toGameClockUnits(timeOfDay)
  if (timeOfDay < trulyDark) {
    return Math.min(0.93, 0.3 + (units - toGameClockUnits(start)) * 0.00225)
  }
  return Math.min(0.93, 0.75 + (units - toGameClockUnits(trulyDark)) * 0.000625)
}

/**
 * Stored outdoor lightmap base color for a clock time: the evening color
 * multiplied by the squared light factor (the lightmap stores the color
 * premultiplied by its alpha, so the drawn value is eveningColor x f^2).
 * `null` in daylight, meaning no darkening at all.
 */
export function deriveOutdoorLightmapColor(timeOfDay: number, season: GameSeason): LightingColor | null {
  const factor = deriveOutdoorLightFactor(timeOfDay, season)
  if (factor == null) {
    return null
  }
  const evening = getEveningColor(season)
  const squared = factor * factor
  return {
    r: Math.round(evening.r * squared),
    g: Math.round(evening.g * squared),
    b: Math.round(evening.b * squared),
  }
}

/**
 * Indoor lightmap base color (GameLocation ambient light): the map's
 * `AmbientLight` (or the default indoor color) lerped toward the night color
 * across the two hours before fully dark.
 */
export function deriveIndoorLightmapColor(
  timeOfDay: number,
  season: GameSeason,
  options: { ambientLight?: LightingColor | null; ambientNightLight?: LightingColor | null } = {},
): LightingColor {
  const dayColor = options.ambientLight ?? INDOOR_LIGHTMAP_DAY
  const nightColor = options.ambientNightLight ?? INDOOR_LIGHTMAP_NIGHT
  const start = getStartingToGetDarkTime(season)
  if (timeOfDay < start) {
    return dayColor
  }
  const trulyDark = getTrulyDarkTime(season)
  const minutesUntilDark = Math.max(0, clockToMinutes(trulyDark) - clockToMinutes(timeOfDay))
  const progress = 1 - Math.min(1, minutesUntilDark / 120)
  return {
    r: Math.round(dayColor.r + (nightColor.r - dayColor.r) * progress),
    g: Math.round(dayColor.g + (nightColor.g - dayColor.g) * progress),
    b: Math.round(dayColor.b + (nightColor.b - dayColor.b) * progress),
  }
}

/** Parses a raw "r g b" triple into a clamped lightmap color; null when malformed. */
export function parseLightingColorTriplet(raw: string): LightingColor | null {
  const segments = raw.trim().split(/\s+/u)
  if (segments.length < 3) {
    return null
  }
  const channels = segments.slice(0, 3).map((segment) => Number.parseInt(segment, 10))
  if (channels.some((channel) => !Number.isFinite(channel))) {
    return null
  }
  const clamp = (value: number) => Math.max(0, Math.min(255, value))
  return { r: clamp(channels[0] ?? 0), g: clamp(channels[1] ?? 0), b: clamp(channels[2] ?? 0) }
}

/** Serializes a lightmap color as the space-separated decimal the game expects (e.g. "95 95 95"). */
export function serializeLightingColorTriplet(color: LightingColor): string {
  return `${color.r} ${color.g} ${color.b}`
}

/**
 * Reads a map's `AmbientLight` property the way GameLocation does: absent
 * keeps the caller's default, a white value means "fully bright" (the game
 * maps it to a black lightmap = no darkening), anything else is the lightmap
 * base color.
 */
export function parseMapAmbientLightProperty(properties: Record<string, MapPropertyValue> | null | undefined): {
  kind: 'default' | 'bright' | 'color'
  color: LightingColor | null
} {
  const raw = asMapPropertyString(properties?.AmbientLight)
  if (!raw) {
    return { kind: 'default', color: null }
  }
  if (/^white$/iu.test(raw.trim()) || /^255\s+255\s+255$/u.test(raw.trim())) {
    return { kind: 'bright', color: null }
  }
  const color = parseLightingColorTriplet(raw)
  return color ? { kind: 'color', color } : { kind: 'default', color: null }
}

/** Reads the optional `AmbientNightLight` map property (indoor night ambient). */
export function parseMapAmbientNightLightProperty(properties: Record<string, MapPropertyValue> | null | undefined) {
  return parseLightingColorTriplet(asMapPropertyString(properties?.AmbientNightLight))
}

/** Returns true when the map name belongs to the mine/shaft family. */
export function isMineLikeMapName(mapName: string | null | undefined) {
  const normalized = mapName?.trim() ?? ''
  return /^(?:mines?|undergroundmine|skullcave(?:rn)?)/iu.test(normalized)
}

/**
 * Builds glows from a map's `Light x y textureIndex ...` and
 * `WindowLight x y textureIndex ...` properties (space-separated triples in
 * tile coordinates). Map lights sit at the tile center with radius 1 and a
 * black tint (pure bright spots); window lights only glow before they turn
 * off for the night.
 */
/** Creates one map light glow at a tile center with radius 1 and a black tint. */
function createTileLightGlow(tileX: number, tileY: number, textureIndex: number): LightingGlow {
  return {
    worldX: tileX * GAME_TILE_SIZE + GAME_TILE_SIZE / 2,
    worldY: tileY * GAME_TILE_SIZE + GAME_TILE_SIZE / 2,
    textureIndex,
    scale: 1,
    color: MAP_PROPERTY_LIGHT_COLOR,
  }
}

export function buildMapPropertyLightGlows(
  properties: Record<string, MapPropertyValue> | null | undefined,
  options: { windowLightsVisible: boolean },
): LightingGlow[] {
  const glows: LightingGlow[] = []
  const append = (raw: string) => {
    const tokens = raw.trim().split(/\s+/u).filter(Boolean)
    for (let index = 0; index + 2 < tokens.length; index += 3) {
      const tileX = Number.parseInt(tokens[index] ?? '', 10)
      const tileY = Number.parseInt(tokens[index + 1] ?? '', 10)
      const textureIndex = Number.parseInt(tokens[index + 2] ?? '', 10)
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY) || !Number.isFinite(textureIndex)) {
        continue
      }
      glows.push(createTileLightGlow(tileX, tileY, textureIndex))
    }
  }

  append(asMapPropertyString(properties?.Light))
  if (options.windowLightsVisible) {
    append(asMapPropertyString(properties?.WindowLight))
  }
  return glows
}

/** Valid `Light` property texture indexes (1 lantern, 2 windowLight, 4 sconce, 5 green, 6 indoorWindow, 7-10 projector/fishTank/tree/pinpoint); 3 is invalid. */
const VALID_LIGHT_TEXTURE_INDEXES = new Set([1, 2, 4, 5, 6, 7, 8, 9, 10])

/**
 * Conservative default `Light` texture index for a marker's item reference:
 * lantern-named items use the lantern texture, window-named items the window
 * light, everything else the sconce (the most common wall-lamp/torch shape —
 * plain numeric ids like `(O)146` land here). The inspector can override this
 * per marker via `MFLightTexture`.
 */
export function lightTextureIndexForItem(itemReference: string | null): number {
  const normalized = itemReference?.trim().toLowerCase() ?? ''
  if (normalized.includes('lantern')) {
    return 1
  }
  if (normalized.includes('window')) {
    return 2
  }
  return 4
}

/** Reads a marker's explicit `MFLightTexture` override; invalid indexes fall back to the item mapping. */
function markerLightTextureIndex(object: MapObject): number {
  const explicit = Number.parseInt(asMapPropertyString(object.properties.MFLightTexture), 10)
  return VALID_LIGHT_TEXTURE_INDEXES.has(explicit) ? explicit : lightTextureIndexForItem(resolveMapObjectItemReference(object))
}

/**
 * Rebuilds a map's `Light` property from its explicit light markers
 * (`MFMarker: 'light'` objects that resolve as lit), returning the document
 * unchanged when the value already matches. Only explicit markers participate:
 * heuristic objects (empty properties or a bare `QualifiedItemId`) are never
 * promoted, so community-authored maps are not polluted. Hand-written triples
 * in the existing value that do not land on a marker tile are preserved
 * verbatim before the marker triples; a hand-written triple on a marker tile
 * is replaced by that marker (one marker per tile wins, matching the preview).
 * The value is space-joined `x y textureIndex` triples, markers sorted by
 * (y, x); trailing partial tokens are kept as-is. `WindowLight` is untouched.
 */
export function syncLightMapProperty(document: MapDocument): MapDocument {
  const tileWidth = document.tileWidth > 0 ? document.tileWidth : 16
  const tileHeight = document.tileHeight > 0 ? document.tileHeight : 16
  const markers: Array<{ tileX: number; tileY: number; textureIndex: number }> = []
  const markerTiles = new Set<string>()
  for (const group of document.objectGroups) {
    for (const object of group.objects) {
      if (asMapPropertyString(object.properties.MFMarker) !== 'light' || !resolveMapObjectLightIsOn(object)) {
        continue
      }
      const tileX = Math.round(object.x / tileWidth)
      const tileY = Math.round(object.y / tileHeight)
      const tileKey = `${tileX},${tileY}`
      if (markerTiles.has(tileKey)) {
        continue
      }
      markerTiles.add(tileKey)
      markers.push({ tileX, tileY, textureIndex: markerLightTextureIndex(object) })
    }
  }

  const raw = asMapPropertyString(document.properties.Light).trim()
  const tokens = raw ? raw.split(/\s+/u) : []
  const handWritten: string[] = []
  let offset = 0
  for (; offset + 2 < tokens.length; offset += 3) {
    const tileX = Number.parseInt(tokens[offset] ?? '', 10)
    const tileY = Number.parseInt(tokens[offset + 1] ?? '', 10)
    const onMarkerTile = Number.isFinite(tileX) && Number.isFinite(tileY) && markerTiles.has(`${tileX},${tileY}`)
    if (!onMarkerTile) {
      handWritten.push(tokens[offset]!, tokens[offset + 1]!, tokens[offset + 2]!)
    }
  }
  const residual = tokens.slice(offset)

  const rebuilt = [...handWritten]
  markers.sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX)
  for (const marker of markers) {
    rebuilt.push(String(marker.tileX), String(marker.tileY), String(marker.textureIndex))
  }
  rebuilt.push(...residual)
  const rebuiltValue = rebuilt.join(' ')
  if (rebuiltValue === raw) {
    return document
  }
  const properties = { ...document.properties }
  if (rebuilt.length === 0) {
    delete properties.Light
  } else {
    properties.Light = rebuiltValue
  }
  return { ...document, properties }
}

/** Paths-layer tile index (any tilesheet) that spawns a `Light x y 4` sconce. */
export const PATHS_LAMP_TILE_ID = 8
/** Interior Front/Buildings tiles (indoor tilesheet) that spawn a `Light x y 4` sconce. */
export const INDOOR_SCONCE_LIGHT_TILE_IDS = new Set([480, 826, 1344, 1346])
/** Interior Front/Buildings tiles (indoor tilesheet) that spawn two `WindowLight` glows. */
export const INDOOR_WINDOW_LIGHT_TILE_IDS = new Set([225, 256])

/**
 * Reproduces GameLocation.loadLights: lamp tiles baked into the map become
 * light sources. The Paths layer's tile 8 is a wall sconce on any tilesheet;
 * on interior maps (unless `IgnoreLightingTiles` is set) specific tiles of the
 * `indoor` tilesheet on Front/Buildings spawn sconce or window lights, with
 * the game's SeedShop/BathHouse/Club exclusions for the window lamp. Farmhouse
 * maps skip tile lights entirely (the game handles them specially).
 */
export function buildTileLampLightGlows(
  mapDocument: Pick<MapDocument, 'name' | 'properties' | 'layers' | 'tilesets'> | null | undefined,
  options: { windowLightsVisible: boolean },
): LightingGlow[] {
  if (!mapDocument || isFarmhouseMapName(mapDocument.name) || !isIndoorMapDocument(mapDocument)) {
    return []
  }
  const glows: LightingGlow[] = []
  const scanFrontBuildings = !hasIgnoreLightingTilesProperty(mapDocument.properties)
  const mapName = mapDocument.name ?? ''

  for (const layer of mapDocument.layers) {
    const isPaths = layer.name === 'Paths'
    const isFrontOrBuildings = scanFrontBuildings && (layer.name === 'Front' || layer.name === 'Buildings')
    if (!isPaths && !isFrontOrBuildings) {
      continue
    }
    for (let index = 0; index < layer.gids.length; index += 1) {
      const rawGid = layer.gids[index] ?? 0
      if (rawGid === 0) {
        continue
      }
      const gid = stripTileGidFlags(rawGid)
      const tileset = findTilesetForGid(mapDocument.tilesets, gid)
      if (!tileset) {
        continue
      }
      const tileId = gid - tileset.firstGid
      const tileX = index % layer.width
      const tileY = Math.floor(index / layer.width)
      if (isPaths && tileId === PATHS_LAMP_TILE_ID) {
        glows.push(createTileLightGlow(tileX, tileY, 4))
        continue
      }
      if (!isFrontOrBuildings || tileset.name.toLowerCase() !== 'indoor') {
        continue
      }
      if (INDOOR_SCONCE_LIGHT_TILE_IDS.has(tileId)) {
        glows.push(createTileLightGlow(tileX, tileY, 4))
      } else if (options.windowLightsVisible && INDOOR_WINDOW_LIGHT_TILE_IDS.has(tileId) && !isWindowLampExcluded(mapName, tileId, tileX)) {
        glows.push(createTileLightGlow(tileX, tileY, 4), createTileLightGlow(tileX, tileY + 1, 4))
      }
    }
  }
  return glows
}

/** The game excludes farmhouse maps from baked tile lights. */
function isFarmhouseMapName(mapName: string | null | undefined) {
  const normalized = mapName?.trim().toLowerCase() ?? ''
  return normalized === 'farmhouse' || normalized === 'islandfarmhouse'
}

/** Interior maps can opt out of lamp-tile scanning via `IgnoreLightingTiles`. */
function hasIgnoreLightingTilesProperty(properties: Record<string, MapPropertyValue> | null | undefined) {
  if (!properties) {
    return false
  }
  return Object.keys(properties).some((key) => key.toLowerCase() === 'ignorelightingtiles')
}

/** SeedShop/BathHouse/Club exclusions for the two-tall window lamp (tile 225). */
function isWindowLampExcluded(mapName: string, tileId: number, tileX: number) {
  if (tileId !== 225) {
    return false
  }
  if (/bathhouse|club/iu.test(mapName)) {
    return true
  }
  return mapName === 'SeedShop' && (tileX === 36 || tileX === 37)
}

/**
 * Builds the glow for an event `addLantern` light: the game hangs a sconce
 * light (512px texture) on a temporary sprite at the tile center, tinted
 * (0,65,128) by default, with the command radius scaling the whole texture.
 */
export function buildEventLanternGlow(lantern: { worldX: number; worldY: number; radius: number }): LightingGlow {
  return {
    worldX: lantern.worldX + GAME_TILE_SIZE / 2,
    worldY: lantern.worldY + GAME_TILE_SIZE / 2,
    textureIndex: 4,
    scale: lantern.radius,
    color: EVENT_LANTERN_LIGHT_COLOR,
  }
}

/**
 * Converts one stored lightmap channel (0-255) to the multiply-overlay channel
 * that approximates the game's `scene - stored^2` reverse-subtract blend:
 * `overlay = 255 - stored^2 / 255`. Black stays white (no darkening), the
 * outdoor evening base lands on the game's blue-purple night tone.
 */
export function computeLightingOverlayChannel(storedChannel: number) {
  const clamped = Math.max(0, Math.min(255, storedChannel))
  return Math.round(255 - (clamped * clamped) / 255)
}

// ---------------------------------------------------------------------------
// Placed-object lights (Object.initializeLightSource)
//
// The game never serializes placed objects into map files — they come from
// save files and location constructors. ModForge map documents therefore carry
// them as object-group entries: an object whose `QualifiedItemId`/`ItemId`
// property, `type` or `name` resolves to a light-emitting item (torch,
// fireplace/lamp furniture, IsLamp big craftable, Bonfire, Strange Capsule)
// previews that item's glow at night. The preview treats markers as lit; an
// explicit `IsOn` property set to false models an unlit fixture.
// ---------------------------------------------------------------------------

/** Furniture type that emits a fireplace light when on (getTypeNumberFromName: "fireplace"). */
export const FIREPLACE_FURNITURE_TYPE = 14
/** Furniture type that emits a lamp light when on (getTypeNumberFromName: "torch"). */
export const TORCH_FURNITURE_TYPE = 16

/** Light facts for one big-craftable item, parsed from Data/BigCraftables. */
export type ObjectLightBigCraftableFacts = {
  name: string
  /** The item places as a Torch subclass (torch_item context tag). */
  isTorch: boolean
  /** The torch light hangs at the campfire offset (campfire_item context tag). */
  isCampfire: boolean
  /** The item always emits a lamp light (IsLamp data field). */
  isLamp: boolean
}

/**
 * Item-data lookup for placed-object lights: big-craftable facts, furniture
 * type numbers and internal furniture names by unqualified item id, plus
 * case-insensitive name lookups for marker resolution. Built from raw
 * Data/BigCraftables and Data/Furniture asset JSON via
 * `buildObjectLightItemIndex`.
 */
export type ObjectLightItemIndex = {
  bigCraftables: Record<string, ObjectLightBigCraftableFacts>
  furnitureTypes: Record<string, number>
  bigCraftableIdsByName: Record<string, string>
  furnitureIdsByName: Record<string, string>
  /** Internal (English) furniture name by unqualified item id, for picker disambiguation. */
  furnitureNames: Record<string, string>
  /**
   * Qualified item id (`(BC)<id>` / `(F)<id>`) to display name for the marker
   * picker; `[LocalizedText ...]` tokens are resolved via the strings tables
   * when provided.
   */
  displayNames: Record<string, string>
}

/** One placed-object light marker resolved from a map object-group entry. */
export type PlacedObjectLightMarker = {
  qualifiedItemId: string
  tileX: number
  tileY: number
  isOn: boolean
}

/** Furniture type name -> type number, mirroring Furniture.getTypeNumberFromName. */
const FURNITURE_TYPE_NUMBERS: Record<string, number> = {
  chair: 0,
  bench: 1,
  couch: 2,
  armchair: 3,
  dresser: 4,
  'long table': 5,
  painting: 6,
  lamp: 7,
  decor: 8,
  bookcase: 10,
  table: 11,
  rug: 12,
  window: 13,
  fireplace: FIREPLACE_FURNITURE_TYPE,
  torch: TORCH_FURNITURE_TYPE,
  sconce: 17,
}

function normalizeItemLookupName(name: string) {
  return name.trim().toLowerCase()
}

/**
 * Reads an item entry's display name: modern object entries prefer a non-empty
 * `DisplayName` field, falling back to the parsed internal name; legacy slash
 * strings always use the parsed name.
 */
function readItemDisplayName(rawEntry: unknown, parsedName: string) {
  if (rawEntry && typeof rawEntry === 'object') {
    const displayName = (rawEntry as { DisplayName?: unknown }).DisplayName
    if (typeof displayName === 'string' && displayName.trim()) {
      return displayName.trim()
    }
  }
  return parsedName
}

/** Matches a `[LocalizedText Strings\Family:key]` display-name token. */
const LOCALIZED_TEXT_TOKEN_PATTERN = /^\[LocalizedText\s+[^:\]]+:(?<key>[^\]]+)\]$/u

/**
 * Resolves a display-name candidate for the marker picker. A
 * `[LocalizedText ...]` token is looked up by key in its family's strings
 * table: a hit wins, a miss falls back to the item's internal name (never the
 * raw token). Any non-token candidate is used as-is.
 */
function resolveItemDisplayName(candidate: string, internalName: string, stringsMap: Record<string, string>): string {
  const tokenMatch = LOCALIZED_TEXT_TOKEN_PATTERN.exec(candidate)
  if (!tokenMatch) {
    return candidate
  }
  const key = tokenMatch.groups?.key?.trim() ?? ''
  if (!key) {
    return internalName
  }
  return stringsMap[key] ?? internalName
}

/** Parses a Data/Furniture entry (legacy slash string or modern object) into a type number. */
function parseFurnitureTypeNumber(rawEntry: unknown): { name: string; type: number } | null {
  if (typeof rawEntry === 'string') {
    const tokens = rawEntry.split('/')
    const name = (tokens[0] ?? '').trim()
    const typeName = (tokens[1] ?? '').trim().toLowerCase()
    if (!name || !typeName) {
      return null
    }
    if (typeName.startsWith('bed')) {
      return { name, type: 15 }
    }
    return { name, type: FURNITURE_TYPE_NUMBERS[typeName] ?? 9 }
  }
  if (rawEntry && typeof rawEntry === 'object') {
    const entry = rawEntry as { Name?: unknown; Type?: unknown }
    const name = typeof entry.Name === 'string' ? entry.Name.trim() : ''
    if (!name) {
      return null
    }
    if (typeof entry.Type === 'number' && Number.isFinite(entry.Type)) {
      return { name, type: entry.Type }
    }
    if (typeof entry.Type === 'string') {
      const typeName = entry.Type.trim().toLowerCase()
      if (typeName.startsWith('bed')) {
        return { name, type: 15 }
      }
      return { name, type: FURNITURE_TYPE_NUMBERS[typeName] ?? 9 }
    }
  }
  return null
}

/**
 * Builds the placed-object light lookup from raw Data/BigCraftables and
 * Data/Furniture asset content (JSON strings as returned by loadTextAsset).
 * `strings` carries the matching Strings\BigCraftables / Strings\Furniture
 * tables (JSON text), used to resolve `[LocalizedText ...]` display-name
 * tokens into readable names. Missing or malformed assets yield an empty
 * index, which disables placed-object lights without failing the rest of the
 * lighting preview.
 *
 * Display-name resolution: a candidate (modern DisplayName, or a legacy
 * furniture string's 8th slash field) that is a `[LocalizedText ...]` token
 * is looked up by key in its family's strings table; a hit wins, a miss (or a
 * missing/malformed strings table) falls back to the item's internal name,
 * never the raw token. Non-token candidates are used as-is.
 */
export function buildObjectLightItemIndex(
  bigCraftablesContent: string | null | undefined,
  furnitureContent: string | null | undefined,
  strings?: { bigCraftables?: string | null; furniture?: string | null },
): ObjectLightItemIndex {
  const index: ObjectLightItemIndex = {
    bigCraftables: {},
    furnitureTypes: {},
    bigCraftableIdsByName: {},
    furnitureIdsByName: {},
    furnitureNames: {},
    displayNames: {},
  }

  const readStringsTable = (content: string | null | undefined): Record<string, string> => {
    if (!content) {
      return {}
    }
    try {
      const raw = JSON.parse(content) as Record<string, unknown>
      const table: Record<string, string> = {}
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
          table[key] = value
        }
      }
      return table
    } catch {
      // A malformed strings table simply disables token resolution.
      return {}
    }
  }
  const bigCraftablesStrings = readStringsTable(strings?.bigCraftables)
  const furnitureStrings = readStringsTable(strings?.furniture)

  if (bigCraftablesContent) {
    try {
      const raw = JSON.parse(bigCraftablesContent) as Record<string, unknown>
      for (const [id, rawEntry] of Object.entries(raw)) {
        if (!rawEntry || typeof rawEntry !== 'object') {
          continue
        }
        const entry = rawEntry as { Name?: unknown; DisplayName?: unknown; IsLamp?: unknown; ContextTags?: unknown }
        const name = typeof entry.Name === 'string' ? entry.Name.trim() : ''
        if (!name) {
          continue
        }
        const tags = Array.isArray(entry.ContextTags) ? entry.ContextTags.filter((tag): tag is string => typeof tag === 'string') : []
        index.bigCraftables[id] = {
          name,
          isTorch: tags.includes('torch_item'),
          isCampfire: tags.includes('campfire_item'),
          isLamp: entry.IsLamp === true,
        }
        index.displayNames[`(BC)${id}`] = resolveItemDisplayName(readItemDisplayName(rawEntry, name), name, bigCraftablesStrings) || id
        const lookupName = normalizeItemLookupName(name)
        if (!(lookupName in index.bigCraftableIdsByName)) {
          index.bigCraftableIdsByName[lookupName] = id
        }
      }
    } catch {
      // Malformed asset content simply yields an empty index.
    }
  }

  if (furnitureContent) {
    try {
      const raw = JSON.parse(furnitureContent) as Record<string, unknown>
      for (const [id, rawEntry] of Object.entries(raw)) {
        const parsed = parseFurnitureTypeNumber(rawEntry)
        if (!parsed) {
          continue
        }
        index.furnitureTypes[id] = parsed.type
        index.furnitureNames[id] = parsed.name
        // Legacy slash strings carry their display name (typically a
        // `[LocalizedText ...]` token) in the 8th slash field; modern entries
        // use DisplayName.
        let displayNameCandidate = readItemDisplayName(rawEntry, parsed.name)
        if (typeof rawEntry === 'string') {
          const legacyDisplayName = (rawEntry.split('/')[7] ?? '').trim()
          if (legacyDisplayName) {
            displayNameCandidate = legacyDisplayName
          }
        }
        index.displayNames[`(F)${id}`] = resolveItemDisplayName(displayNameCandidate, parsed.name, furnitureStrings) || id
        const lookupName = normalizeItemLookupName(parsed.name)
        if (!(lookupName in index.furnitureIdsByName)) {
          index.furnitureIdsByName[lookupName] = id
        }
      }
    } catch {
      // Malformed asset content simply yields an empty index.
    }
  }

  return index
}

/** Returns true when the index carries no item data at all. */
export function isObjectLightItemIndexEmpty(index: ObjectLightItemIndex | null | undefined) {
  if (!index) {
    return true
  }
  return Object.keys(index.bigCraftables).length === 0 && Object.keys(index.furnitureTypes).length === 0
}

function isLightRelevantBigCraftable(facts: ObjectLightBigCraftableFacts | undefined, id: string) {
  return Boolean(facts && (facts.isTorch || facts.isLamp || id === BONFIRE_ITEM_ID || id === STRANGE_CAPSULE_ITEM_ID))
}

/** (BC)74 Bonfire: DarkCyan light, radius 1.5. */
export const BONFIRE_ITEM_ID = '74'
/** (BC)96 Strange Capsule: HotPink light, radius 1. */
export const STRANGE_CAPSULE_ITEM_ID = '96'

/**
 * Resolves a marker's item reference to a qualified item id using the item
 * index. Accepts qualified ids (`(BC)146`, `(F)1792`), bare numeric ids
 * (light-relevant big craftables win over furniture), and exact internal item
 * names (`Wood Lamp-post`, `Brick Fireplace`). Returns null when the
 * reference matches no known item.
 */
export function resolvePlacedItemQualifiedId(reference: string, index: ObjectLightItemIndex): string | null {
  const token = reference.trim()
  if (!token) {
    return null
  }

  const qualified = /^\((?<family>[A-Za-z]+)\)(?<id>.+)$/u.exec(token)
  if (qualified?.groups) {
    const family = qualified.groups.family?.toUpperCase()
    const id = (qualified.groups.id ?? '').trim()
    if (!id) {
      return null
    }
    if (family === 'BC' && index.bigCraftables[id]) {
      return `(BC)${id}`
    }
    if (family === 'F' && index.furnitureTypes[id] != null) {
      return `(F)${id}`
    }
    return null
  }

  if (/^\d+$/u.test(token)) {
    const bigCraftableFacts = index.bigCraftables[token]
    if (isLightRelevantBigCraftable(bigCraftableFacts, token)) {
      return `(BC)${token}`
    }
    const furnitureType = index.furnitureTypes[token]
    if (furnitureType === FIREPLACE_FURNITURE_TYPE || furnitureType === TORCH_FURNITURE_TYPE) {
      return `(F)${token}`
    }
    if (bigCraftableFacts) {
      return `(BC)${token}`
    }
    if (furnitureType != null) {
      return `(F)${token}`
    }
    return null
  }

  const byName = index.bigCraftableIdsByName[normalizeItemLookupName(token)]
  if (byName) {
    return `(BC)${byName}`
  }
  const furnitureByName = index.furnitureIdsByName[normalizeItemLookupName(token)]
  return furnitureByName ? `(F)${furnitureByName}` : null
}

function readObjectProperty(object: Pick<MapObject, 'properties'>, keys: string[]) {
  for (const key of keys) {
    const value = asMapPropertyString(object.properties[key]).trim()
    if (value) {
      return value
    }
  }
  return ''
}

/**
 * Resolves the item reference a map object stands for: an explicit
 * `QualifiedItemId`/`ItemId` property wins over the object's `type`, then its
 * `name`. Empty markers (the editor's default `TileData` objects) resolve to
 * nothing.
 */
export function resolveMapObjectItemReference(object: Pick<MapObject, 'name' | 'type' | 'properties'>) {
  return (
    readObjectProperty(object, ['QualifiedItemId', 'qualifiedItemId', 'ItemId', 'itemId']) ||
    object.type.trim() ||
    object.name.trim() ||
    null
  )
}

/**
 * Parses the marker's lit state from an optional `IsOn` property. Markers
 * default to lit — the preview exists to show how placed lights look at
 * night; `IsOn` false/T/F/0 models an unlit fixture.
 */
export function resolveMapObjectLightIsOn(object: Pick<MapObject, 'properties'>) {
  const raw = readObjectProperty(object, ['IsOn', 'isOn'])
  if (!raw) {
    return true
  }
  return /^(?:true|t|1|yes)$/iu.test(raw)
}

/**
 * Resolves visible light markers from a map's object groups: entries whose
 * item reference resolves to a known item become markers at the tile under
 * the object's bounds center. One marker per tile wins (the game keeps one
 * object per tile; the light source id derives from the tile).
 */
export function resolvePlacedObjectLightMarkers(
  objectGroups: Array<{ objects: MapObject[] }> | null | undefined,
  options: { tileWidth: number; tileHeight: number },
  index: ObjectLightItemIndex,
): PlacedObjectLightMarker[] {
  if (!objectGroups?.length || isObjectLightItemIndexEmpty(index)) {
    return []
  }
  const tileWidth = options.tileWidth > 0 ? options.tileWidth : 16
  const tileHeight = options.tileHeight > 0 ? options.tileHeight : 16
  const markers: PlacedObjectLightMarker[] = []
  const seenTiles = new Set<string>()

  for (const group of objectGroups) {
    for (const object of group.objects) {
      const reference = resolveMapObjectItemReference(object)
      if (!reference) {
        continue
      }
      const qualifiedItemId = resolvePlacedItemQualifiedId(reference, index)
      if (!qualifiedItemId) {
        continue
      }
      const tileX = Math.floor((object.x + object.width / 2) / tileWidth)
      const tileY = Math.floor((object.y + object.height / 2) / tileHeight)
      const tileKey = `${tileX},${tileY}`
      if (seenTiles.has(tileKey)) {
        continue
      }
      seenTiles.add(tileKey)
      markers.push({ qualifiedItemId, tileX, tileY, isOn: resolveMapObjectLightIsOn(object) })
    }
  }
  return markers
}

/**
 * Light behavior of one placed item, mirroring the branch order of
 * `Object.initializeLightSource` as implemented in `buildPlacedObjectLightGlow`:
 * fireplace/torch furniture first, then big craftables as campfire-torch,
 * plain torch, lamp, Bonfire (74) or Strange Capsule (96).
 */
type PlacedLightBehavior =
  | { family: 'furniture'; type: typeof FIREPLACE_FURNITURE_TYPE | typeof TORCH_FURNITURE_TYPE }
  | { family: 'bigCraftable'; glowKey: 'campfire' | 'torch' | 'lamp' | 'bonfire' | 'capsule' }

/**
 * Classifies a placed item's light behavior from its qualified id, mirroring
 * `buildPlacedObjectLightGlow`'s branch priority so picker dedup always
 * matches what the preview actually renders. Returns null for items without
 * a light behavior.
 */
function resolvePlacedLightBehavior(qualifiedItemId: string, index: ObjectLightItemIndex): PlacedLightBehavior | null {
  const furnitureMatch = /^\(F\)(?<id>.+)$/u.exec(qualifiedItemId)
  if (furnitureMatch?.groups) {
    const type = index.furnitureTypes[furnitureMatch.groups.id ?? '']
    if (type === FIREPLACE_FURNITURE_TYPE || type === TORCH_FURNITURE_TYPE) {
      return { family: 'furniture', type }
    }
    return null
  }
  const bigCraftableMatch = /^\(BC\)(?<id>.+)$/u.exec(qualifiedItemId)
  if (bigCraftableMatch?.groups) {
    const id = bigCraftableMatch.groups.id ?? ''
    const facts = index.bigCraftables[id]
    if (facts?.isTorch) {
      return { family: 'bigCraftable', glowKey: facts.isCampfire ? 'campfire' : 'torch' }
    }
    if (facts?.isLamp) {
      return { family: 'bigCraftable', glowKey: 'lamp' }
    }
    if (id === BONFIRE_ITEM_ID) {
      return { family: 'bigCraftable', glowKey: 'bonfire' }
    }
    if (id === STRANGE_CAPSULE_ITEM_ID) {
      return { family: 'bigCraftable', glowKey: 'capsule' }
    }
  }
  return null
}

/**
 * Computes the picker dedup signature for one light-relevant item: furniture
 * as `f:<type>`, big craftables as `bc:campfire|torch|lamp|bonfire|capsule`.
 * Null when the item has no light behavior.
 */
function computePlacedLightGlowKey(qualifiedItemId: string, index: ObjectLightItemIndex): string | null {
  const behavior = resolvePlacedLightBehavior(qualifiedItemId, index)
  if (!behavior) {
    return null
  }
  return behavior.family === 'furniture' ? `f:${behavior.type}` : `bc:${behavior.glowKey}`
}

/** Extracts the bare id from a qualified item id (`(BC)146` -> `146`). */
function extractPlacedItemId(qualifiedItemId: string): string {
  const match = /^\([A-Za-z]+\)(?<id>.+)$/u.exec(qualifiedItemId)
  return match?.groups?.id ?? qualifiedItemId
}

/**
 * Orders two qualified item ids by their bare id for picker dedup: numeric
 * ids compare numerically (the lowest wins), non-numeric ids as strings.
 */
function comparePlacedItemIds(a: string, b: string): number {
  const idA = extractPlacedItemId(a)
  const idB = extractPlacedItemId(b)
  const numericA = /^\d+$/u.test(idA)
  const numericB = /^\d+$/u.test(idB)
  if (numericA && numericB) {
    if (idA.length !== idB.length) {
      return idA.length - idB.length
    }
    return idA === idB ? 0 : idA < idB ? -1 : 1
  }
  return idA.localeCompare(idB, 'en')
}

/** One light-emitting picker candidate before label/behavior dedup. */
type PlacedLightItemCandidate = {
  qualifiedItemId: string
  label: string
  internalName: string
  glowKey: string
}

/**
 * One selectable light-emitting item in the marker item picker. `description`
 * carries the internal (English) item name only when several options share
 * the same display label but differ in light behavior, so the picker can
 * tell them apart.
 */
export type PlacedLightItemOption = {
  qualifiedItemId: string
  label: string
  description?: string
}

/**
 * Lists the items that actually emit light in the preview, for the marker
 * item picker: torch/fireplace furniture and torch/lamp/bonfire/strange-
 * capsule big craftables present in the game data. Labels come from the
 * index display names. Entries sharing a display name and light behavior are
 * deduped keeping the lowest item id (real game data carries several ids per
 * name, e.g. multiple campfire/torch variants); when the same label still
 * spans several behaviors each row carries its internal (English) name as
 * `description` so the picker can tell them apart. Rows are sorted by label.
 */
export function listPlacedLightItemOptions(index: ObjectLightItemIndex | null | undefined): PlacedLightItemOption[] {
  if (!index || isObjectLightItemIndexEmpty(index)) {
    return []
  }
  const candidates: PlacedLightItemCandidate[] = []
  for (const [id, facts] of Object.entries(index.bigCraftables)) {
    if (!isLightRelevantBigCraftable(facts, id)) {
      continue
    }
    const qualifiedItemId = `(BC)${id}`
    candidates.push({
      qualifiedItemId,
      label: index.displayNames[qualifiedItemId] ?? id,
      internalName: facts.name,
      glowKey: computePlacedLightGlowKey(qualifiedItemId, index) ?? '',
    })
  }
  for (const [id, type] of Object.entries(index.furnitureTypes)) {
    if (type !== FIREPLACE_FURNITURE_TYPE && type !== TORCH_FURNITURE_TYPE) {
      continue
    }
    const qualifiedItemId = `(F)${id}`
    candidates.push({
      qualifiedItemId,
      label: index.displayNames[qualifiedItemId] ?? id,
      internalName: index.furnitureNames[id] ?? id,
      glowKey: computePlacedLightGlowKey(qualifiedItemId, index) ?? '',
    })
  }

  // Keep the lowest item id per (display label, light behavior).
  const deduped = new Map<string, PlacedLightItemCandidate>()
  for (const candidate of candidates) {
    const key = `${candidate.label}\u0000${candidate.glowKey}`
    const existing = deduped.get(key)
    if (!existing || comparePlacedItemIds(candidate.qualifiedItemId, existing.qualifiedItemId) < 0) {
      deduped.set(key, candidate)
    }
  }
  const options = [...deduped.values()].sort((a, b) => a.label.localeCompare(b.label, 'en'))

  // Same label spanning several behaviors: disambiguate with internal names.
  const labelCounts = new Map<string, number>()
  for (const option of options) {
    labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1)
  }
  return options.map(({ qualifiedItemId, label, internalName }) => {
    const option: PlacedLightItemOption = { qualifiedItemId, label }
    if ((labelCounts.get(label) ?? 0) > 1 && internalName) {
      option.description = internalName
    }
    return option
  })
}

/**
 * Resolves a map object's light-item display name for marker list rows, or
 * null when the object is a plain marker or names an unknown item.
 */
export function resolvePlacedObjectDisplayName(
  object: Pick<MapObject, 'name' | 'type' | 'properties'>,
  index: ObjectLightItemIndex | null | undefined,
): string | null {
  if (!index) {
    return null
  }
  const reference = resolveMapObjectItemReference(object)
  if (!reference) {
    return null
  }
  const qualifiedItemId = resolvePlacedItemQualifiedId(reference, index)
  if (!qualifiedItemId) {
    return null
  }
  return index.displayNames[qualifiedItemId] ?? null
}

/** Creates one placed-object glow on the sconce texture scaled by the game's radius. */
function createPlacedObjectGlow(worldX: number, worldY: number, radius: number, color: LightingColor): LightingGlow {
  return {
    worldX,
    worldY,
    textureIndex: 4,
    scale: radius,
    color,
  }
}

/**
 * Maps one placed-object marker to its light glow, mirroring
 * Object.initializeLightSource: lit fireplace furniture (type 14) glows at
 * radius 2.5, lamp furniture (type 16) at 1.5, lit torches at 2.5 (campfires
 * hang lower), IsLamp big craftables at radius 3 with the dimmer tint,
 * (BC)74 Bonfire at 1.5 DarkCyan and (BC)96 Strange Capsule at radius 1
 * HotPink. Returns null for items without a light (including Error Items).
 * The behavior classification is shared with `listPlacedLightItemOptions` so
 * picker dedup stays aligned with what the preview renders.
 */
export function buildPlacedObjectLightGlow(marker: PlacedObjectLightMarker, index: ObjectLightItemIndex): LightingGlow | null {
  const behavior = resolvePlacedLightBehavior(marker.qualifiedItemId, index)
  if (!behavior) {
    return null
  }
  if (behavior.family === 'furniture') {
    if (!marker.isOn) {
      return null
    }
    return behavior.type === FIREPLACE_FURNITURE_TYPE
      ? createPlacedObjectGlow(marker.tileX * GAME_TILE_SIZE + 32, marker.tileY * GAME_TILE_SIZE - 64, 2.5, OBJECT_FIRE_LIGHT_COLOR)
      : createPlacedObjectGlow(marker.tileX * GAME_TILE_SIZE + 32, marker.tileY * GAME_TILE_SIZE - 64, 1.5, OBJECT_FIRE_LIGHT_COLOR)
  }
  if (behavior.glowKey === 'campfire' || behavior.glowKey === 'torch') {
    if (!marker.isOn) {
      return null
    }
    const yOffset = behavior.glowKey === 'campfire' ? 32 : -64
    return createPlacedObjectGlow(marker.tileX * GAME_TILE_SIZE + 32, marker.tileY * GAME_TILE_SIZE + yOffset, 2.5, OBJECT_FIRE_LIGHT_COLOR)
  }
  if (behavior.glowKey === 'lamp') {
    return createPlacedObjectGlow(marker.tileX * GAME_TILE_SIZE + 32, marker.tileY * GAME_TILE_SIZE - 64, 3, BIG_CRAFTABLE_LAMP_LIGHT_COLOR)
  }
  if (behavior.glowKey === 'bonfire') {
    return createPlacedObjectGlow(marker.tileX * GAME_TILE_SIZE + 32, marker.tileY * GAME_TILE_SIZE, 1.5, BONFIRE_LIGHT_COLOR)
  }
  return createPlacedObjectGlow(marker.tileX * GAME_TILE_SIZE + 32, marker.tileY * GAME_TILE_SIZE, 1, STRANGE_CAPSULE_LIGHT_COLOR)
}

/**
 * Builds all placed-object glows for a map document: resolves light markers
 * from its object groups and maps each through `buildPlacedObjectLightGlow`.
 * Missing object groups or tile sizes (partial fixtures) simply yield nothing.
 */
export function buildPlacedObjectLightGlows(
  mapDocument: Partial<Pick<MapDocument, 'objectGroups' | 'tileWidth' | 'tileHeight'>> | null | undefined,
  index: ObjectLightItemIndex | null | undefined,
): LightingGlow[] {
  if (!mapDocument || !index || isObjectLightItemIndexEmpty(index)) {
    return []
  }
  const markers = resolvePlacedObjectLightMarkers(
    mapDocument.objectGroups,
    { tileWidth: mapDocument.tileWidth ?? 16, tileHeight: mapDocument.tileHeight ?? 16 },
    index,
  )
  return markers.map((marker) => buildPlacedObjectLightGlow(marker, index)).filter((glow): glow is LightingGlow => glow !== null)
}

/** Returns true when a map document counts as an interior location. */
export function isIndoorMapDocument(mapDocument: Pick<MapDocument, 'properties'> | null | undefined) {
  if (!mapDocument) {
    return false
  }
  const outdoors = asMapPropertyString(mapDocument.properties.Outdoors).trim().toLowerCase()
  if (outdoors === 'false') {
    return true
  }
  // Interior maps without an explicit flag still carry a custom ambient color.
  return parseMapAmbientLightProperty(mapDocument.properties).kind === 'color'
}

/** Time-of-day presets offered by the map workspace lighting preview. */
export type MapLightingPreviewMode = 'day' | 'dusk' | 'night'

/** Dusk variants in the lighting pill: the plain evening tint or the winter one. */
export type MapLightingPreviewDuskVariant = 'dusk' | 'duskWinter'

/**
 * Resolves the dusk variant for a preview selection: `null` when the preview
 * is not showing dusk, `duskWinter` when the winter evening tint (245,225,170)
 * is active and `dusk` for the other seasons' yellow tint (255,255,0). Drives
 * both the pill's dusk button label and its mini-menu active state, so the two
 * can never disagree about which variant is selected.
 */
export function getLightingPreviewDuskVariant(mode: MapLightingPreviewMode, season: GameSeason): MapLightingPreviewDuskVariant | null {
  if (mode !== 'dusk') {
    return null
  }
  return season === 'winter' ? 'duskWinter' : 'dusk'
}

/**
 * Maps a lighting preview mode to a representative clock time: noon for day,
 * half an hour into the evening transition for dusk (window lights still on),
 * and two hours past fully dark for night.
 */
export function getLightingPreviewTimeOfDay(mode: MapLightingPreviewMode, season: GameSeason) {
  if (mode === 'dusk') {
    return getStartingToGetDarkTime(season) + 50
  }
  if (mode === 'night') {
    return getTrulyDarkTime(season) + 200
  }
  return 1200
}

/**
 * Resolves a map preview's lightmap for a clock time and season: mines use the
 * shaft color, indoor maps the (lerped) ambient light, outdoor maps the
 * seasonal evening curve; map `Light`/`WindowLight` properties, baked lamp
 * tiles and placed-object markers (when `options.objectLightIndex` carries
 * Data/BigCraftables + Data/Furniture) contribute glows. `null` means the
 * game would skip lighting (bright daytime outdoors).
 */
export function deriveMapDocumentLighting(
  mapDocument:
    | (Pick<MapDocument, 'name' | 'properties' | 'layers' | 'tilesets'> &
        Partial<Pick<MapDocument, 'objectGroups' | 'tileWidth' | 'tileHeight'>>)
    | null
    | undefined,
  timeOfDay: number,
  season: GameSeason,
  options: { objectLightIndex?: ObjectLightItemIndex | null } = {},
): WorldLightingState | null {
  let baseColor: LightingColor | null
  if (isMineLikeMapName(mapDocument?.name)) {
    baseColor = MINE_LIGHTMAP_COLOR
  } else if (isIndoorMapDocument(mapDocument)) {
    const ambient = parseMapAmbientLightProperty(mapDocument?.properties)
    if (ambient.kind === 'bright') {
      baseColor = null
    } else {
      baseColor = deriveIndoorLightmapColor(timeOfDay, season, {
        ambientLight: ambient.color,
        ambientNightLight: parseMapAmbientNightLightProperty(mapDocument?.properties),
      })
    }
  } else {
    baseColor = deriveOutdoorLightmapColor(timeOfDay, season)
  }

  // With no base color the game skips DrawLighting entirely — glows too.
  if (!baseColor) {
    return null
  }

  const windowLightsVisible = timeOfDay < getWindowLightsOffTime(season)
  return {
    baseColor,
    glows: [
      ...buildMapPropertyLightGlows(mapDocument?.properties, { windowLightsVisible }),
      ...buildTileLampLightGlows(mapDocument, { windowLightsVisible }),
      ...buildPlacedObjectLightGlows(mapDocument, options.objectLightIndex),
    ],
  }
}
