/**
 * Reference data the schema-driven controls offer as suggestions.
 *
 * Populated from the shared game resource registry by whichever page hosts the
 * canvas. Two shapes are supported per reference kind:
 *
 * - the flat `npcs` / `items` / … string lists, which every `*_ref` control can
 *   always fall back to, and
 * - the richer `*Options` catalogs, which carry the label, category and sprite
 *   preview the picker dialog needs to be browsable rather than a bare list.
 *
 * Both may be empty, in which case the matching control degrades to a plain
 * text input with the picker button hidden rather than blocking the form.
 */
import type { CSSProperties } from 'react'
import type { LocaleCode } from '@locales/api'

/**
 * One sprite cut out of an already-loaded sheet.
 *
 * Options carry the sheet plus a rectangle rather than a per-option data URL:
 * a material list is hundreds of entries off one `Maps/springobjects` sheet, and
 * encoding each one separately would decode the same image hundreds of times.
 */
export type ResourceSprite = {
  /** Object URL of the sheet the sprite is cut from. */
  url: string
  /** Natural sheet size, needed to place the background. */
  sheetWidth: number
  sheetHeight: number
  /** Rectangle inside the sheet, in source pixels. */
  x: number
  y: number
  width: number
  height: number
  /** Magnification applied to the cut-out; a 16px object sprite needs it to read at thumbnail size. */
  scale?: number
}

/** One browsable reference option shown by the picker dialog. */
export type ResourceOption = {
  /** Value written into the asset JSON. */
  value: string
  /** Legacy or shorthand spellings that resolve to this canonical value. */
  aliases?: readonly string[]
  /** Human readable label; falls back to `value` when absent. */
  label?: string
  /** Grouping bucket shown in the picker sidebar. */
  category?: string
  /** Origin used by the shared browser's game/project/catalog filters. */
  sourceKind?: 'game' | 'project' | 'catalog'
  /** Secondary line under the label (internal name, path, …). */
  detail?: string
  /** Image data URL rendered as the option preview. */
  preview?: string
  /** Sheet-backed preview, used when a whole catalog shares one texture. */
  sprite?: ResourceSprite
}

/** Reference kinds a `*_ref` control can resolve against. */
export type ResourceRefKind = 'npc' | 'item' | 'location' | 'texture' | 'map' | 'building'

export type AssetResources = {
  npcs: readonly string[]
  items: readonly string[]
  locations: readonly string[]
  textures: readonly string[]
  maps: readonly string[]
  /** Building keys `BuildingToUpgrade` and friends may reference. */
  buildings: readonly string[]
  /** Browsable catalogs backing the picker dialog, keyed by reference kind. */
  options?: Partial<Record<ResourceRefKind, readonly ResourceOption[]>>
  /** Game root used to resolve `[LocalizedText ...]` field values; hint stays hidden when absent. */
  gameRootPath?: string | null
  /** UI locale for the resolved text. */
  locale?: LocaleCode
}

export const EMPTY_ASSET_RESOURCES: AssetResources = {
  npcs: [],
  items: [],
  locations: [],
  textures: [],
  maps: [],
  buildings: [],
}

const FLAT_LIST_BY_KIND = {
  npc: 'npcs',
  item: 'items',
  location: 'locations',
  texture: 'textures',
  map: 'maps',
  building: 'buildings',
} as const satisfies Record<ResourceRefKind, keyof AssetResources>

/**
 * Options a picker offers for one reference kind.
 *
 * A rich catalog wins when present; otherwise the flat list is lifted into
 * value-only options so both data sources drive the exact same widget.
 */
export function resourceOptionsFor(resources: AssetResources, kind: ResourceRefKind): readonly ResourceOption[] {
  const rich = resources.options?.[kind]
  if (rich && rich.length > 0) {
    return rich
  }
  return resources[FLAT_LIST_BY_KIND[kind]].map((value) => ({ value }))
}

/** Label shown for one option; the raw value is the fallback. */
export function resourceOptionLabel(option: ResourceOption): string {
  return option.label?.trim() ? option.label : option.value
}

/** Case-insensitive substring match across every searchable option field. */
export function resourceOptionMatches(option: ResourceOption, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') {
    return true
  }
  return [option.value, ...(option.aliases ?? []), option.label, option.category, option.detail].some((part) =>
    part?.toLowerCase().includes(needle),
  )
}

/** Whether a stored reference uses an option's canonical value or a supported alias. */
export function resourceOptionHasValue(option: ResourceOption, value: string): boolean {
  const wanted = value.trim().toLowerCase()
  return wanted !== '' && [option.value, ...(option.aliases ?? [])].some((candidate) => candidate.trim().toLowerCase() === wanted)
}

/**
 * Background style that shows one sheet-backed sprite at its natural size.
 *
 * Kept here rather than reusing an entity's sprite helper so the schema layer
 * does not depend on any one asset entity; the maths is the same background
 * cut-out every sprite view in the app uses.
 */
export function resourceSpriteStyle(sprite: ResourceSprite): CSSProperties {
  const scale = sprite.scale ?? 1
  return {
    width: `${sprite.width}px`,
    height: `${sprite.height}px`,
    backgroundImage: `url("${sprite.url}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: `-${sprite.x}px -${sprite.y}px`,
    backgroundSize: `${sprite.sheetWidth}px ${sprite.sheetHeight}px`,
    imageRendering: 'pixelated',
    ...(scale === 1 ? {} : { transform: `scale(${scale})` }),
  }
}
