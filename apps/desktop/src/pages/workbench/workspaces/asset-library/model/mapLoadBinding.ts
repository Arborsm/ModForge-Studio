import type { DraftPatch, ProjectAssetRef } from '@features/cp-maker'
import { splitMapTargets } from '../../map/model/mapPatchReducer'
import { classifyProjectAsset } from './projectAssets'

/**
 * Pure helpers for the structured Load binding editor.
 *
 * The asset library owns every CP `Load` patch: one patch binds several
 * targets to one `fromFile` template. The template may reference each target
 * through Content Patcher's target tokens, so one patch maps
 * `Maps/SpringObjects, Maps/Town` to
 * `assets/TileSheets/{{TargetWithoutPath}}.png` in a single expression. These
 * helpers resolve that template per target, classify targets into asset
 * families for the graphical pickers, and let the editor round-trip the
 * multi-target expression without touching the raw JSON.
 */

/** Asset families a Load patch can replace, matching the library's icon/copy keys. */
export type LoadAssetFamily = 'maps' | 'images' | 'audio' | 'fonts' | 'data' | 'other'

/** Stable display order for the family picker and the grouped binding list. */
export const LOAD_FAMILY_ORDER: readonly LoadAssetFamily[] = ['maps', 'images', 'audio', 'fonts', 'data', 'other']

/** Image asset sub-families whose vanilla targets can render thumbnails. */
const IMAGE_TARGET_PREFIXES = ['Portraits/', 'Characters/', 'TileSheets/', 'LooseSprites/', 'Animals/', 'Buildings/'] as const

/**
 * Classifies a Load target into an asset family after normalizing separators
 * and case. Targets whose prefix is unknown (or token-only) fall into `other`.
 */
export function loadAssetFamily(target: string): LoadAssetFamily {
  const normalized = target.trim().replaceAll('\\', '/').toLowerCase()
  if (normalized === 'maps' || normalized.startsWith('maps/')) return 'maps'
  if (IMAGE_TARGET_PREFIXES.some((prefix) => normalized.startsWith(prefix.toLowerCase()))) return 'images'
  if (normalized.startsWith('audio/')) return 'audio'
  if (normalized.startsWith('fonts/')) return 'fonts'
  if (normalized.startsWith('data/') || normalized.startsWith('strings/')) return 'data'
  return 'other'
}

/** The full target asset name, normalized to forward slashes. */
function targetAsWritten(target: string): string {
  return target.trim().replaceAll('\\', '/')
}

/** Last path segment of a target, e.g. `Maps/SpringObjects` → `SpringObjects`. */
function targetWithoutPath(target: string): string {
  const slash = target.lastIndexOf('/')
  return slash >= 0 ? target.slice(slash + 1) : target
}

/** Target with any trailing extension stripped, e.g. `Maps/Foo.png` → `Maps/Foo`. */
function targetWithoutExtension(target: string): string {
  const slash = target.lastIndexOf('/')
  const dot = target.lastIndexOf('.')
  return dot > slash && dot >= 0 ? target.slice(0, dot) : target
}

/**
 * Resolves a Load `fromFile` template against one target, replacing the three
 * Content Patcher target tokens. Unknown tokens are kept verbatim.
 */
export function resolveLoadFromFile(template: string, target: string): string {
  const normalizedTarget = targetAsWritten(target)
  return template
    .replaceAll('{{TargetWithoutExtension}}', targetWithoutExtension(normalizedTarget))
    .replaceAll('{{TargetWithoutPath}}', targetWithoutPath(normalizedTarget))
    .replaceAll('{{Target}}', normalizedTarget)
}

/**
 * Normalizes a user-typed map target the way the authoring catalog does: strips
 * a trailing map extension and forces forward slashes, then ensures a `Maps/`
 * prefix. Token expressions (`{{...}}`) are kept intact — they may reference a
 * mod map outside `Maps/`, so no prefix is forced onto them.
 */
export function normalizeLoadTargetInput(raw: string): string | null {
  const value = raw.trim().replaceAll('\\', '/')
  if (!value) return null
  const withoutExtension = value.replace(/\.(?:xnb|tbin|tmx)$/iu, '')
  if (withoutExtension.includes('{{')) return withoutExtension
  return /^maps\//iu.test(withoutExtension) ? withoutExtension : `Maps/${withoutExtension}`
}

/**
 * Joins targets into a comma-separated CP expression, the inverse of
 * `splitMapTargets`: each entry is trimmed and targets containing `{{...}}`
 * with inner commas survive the round-trip.
 */
export function buildLoadTargetExpression(targets: readonly string[]): string {
  return targets
    .map((target) => target.trim())
    .filter((target) => target !== '')
    .join(', ')
}

export type LoadBindingPreviewRow = {
  target: string
  resolvedFromFile: string
  /** Whether a project asset matches the resolved path, case/slash insensitive. */
  exists: boolean
}

function normalizeAssetPath(value: string): string {
  return value.trim().replaceAll('\\', '/').toLowerCase()
}

/**
 * Resolves every target of a Load patch against the `fromFile` template and
 * checks the result against the project's asset paths. The table is shown even
 * when the template carries no target tokens, so identical resolved rows are
 * reported faithfully.
 */
export function analyzeLoadBindings(
  targetExpression: string,
  fromFileTemplate: string,
  projectAssetPaths: readonly string[],
): LoadBindingPreviewRow[] {
  const knownPaths = new Set(projectAssetPaths.map(normalizeAssetPath))
  return splitMapTargets(targetExpression)
    .filter((target) => target.trim() !== '')
    .map((target) => {
      const resolvedFromFile = resolveLoadFromFile(fromFileTemplate, target)
      return {
        target,
        resolvedFromFile,
        exists: resolvedFromFile !== '' && knownPaths.has(normalizeAssetPath(resolvedFromFile)),
      }
    })
}

/**
 * Every `Load` patch in the draft. The asset library owns all of them (not
 * just `Maps/` bindings), so every workspace routes Load patches to read-only
 * summaries while the structured editor lives here.
 */
export function collectLoadPatches(patches: readonly DraftPatch[]): DraftPatch[] {
  return patches.filter((patch) => patch.action === 'Load')
}

/** Groups Load patches by asset family, keeping every family key present. */
export function groupLoadPatchesByFamily(patches: readonly DraftPatch[]): Record<LoadAssetFamily, DraftPatch[]> {
  const groups: Record<LoadAssetFamily, DraftPatch[]> = { maps: [], images: [], audio: [], fonts: [], data: [], other: [] }
  for (const patch of patches) {
    groups[loadAssetFamily(patch.target)].push(patch)
  }
  return groups
}

/**
 * Curated vanilla targets shown as point-and-click suggestions in the binding
 * editor. The maps family is empty because the editor offers the scanned game
 * map catalog instead; expert mode accepts any target the curated list misses.
 * Image thumbnails load lazily and fall back to an icon when a file is absent.
 */
export const COMMON_LOAD_TARGETS: Record<LoadAssetFamily, readonly string[]> = {
  maps: [],
  images: [
    'Portraits/Abigail',
    'Portraits/Alex',
    'Portraits/Elliott',
    'Portraits/Emily',
    'Portraits/Haley',
    'Portraits/Harvey',
    'Portraits/Leah',
    'Portraits/Lewis',
    'Portraits/Linus',
    'Portraits/Maru',
    'Portraits/Penny',
    'Portraits/Sam',
    'Portraits/Sebastian',
    'Portraits/Shane',
    'Portraits/Willy',
    'Portraits/Wizard',
    'Characters/Abigail',
    'Characters/Alex',
    'Characters/Elliott',
    'Characters/Emily',
    'Characters/Haley',
    'Characters/Harvey',
    'Characters/Leah',
    'Characters/Lewis',
    'Characters/Linus',
    'Characters/Maru',
    'Characters/Penny',
    'Characters/Sam',
    'Characters/Sebastian',
    'Characters/Shane',
    'Characters/Willy',
    'Characters/Wizard',
    'TileSheets/springobjects',
    'TileSheets/furniture',
    'TileSheets/craftables',
    'TileSheets/crops',
    'TileSheets/cjk',
    'TileSheets/sprites',
    'TileSheets/townInterior',
    'TileSheets/cave',
    'TileSheets/mines',
    'TileSheets/beach',
    'TileSheets/desert',
    'LooseSprites/Cursors',
    'LooseSprites/Cursors2',
    'LooseSprites/DayTimeIcon',
    'LooseSprites/LightRamp',
    'Animals/WhiteChicken',
    'Animals/BrownChicken',
    'Animals/BlueChicken',
    'Animals/VoidChicken',
    'Animals/WhiteCow',
    'Animals/BrownCow',
    'Animals/Sheep',
    'Animals/Goat',
    'Animals/Pig',
    'Animals/Duck',
    'Animals/Rabbit',
    'Animals/Horse',
    'Buildings/Cabin',
    'Buildings/Coop',
    'Buildings/Barn',
  ],
  audio: ['Audio/NewCue', 'Audio/NewMusic', 'Audio/NewSound'],
  fonts: ['Fonts/NewFont'],
  data: [
    'Data/Achievements',
    'Data/Bundles',
    'Data/Events/AdventureGuild',
    'Data/Mail',
    'Data/NPCGiftTastes',
    'Data/Objects',
    'Strings/Characters',
  ],
  other: [],
}

/** Placeholder target stamped on a freshly created Load patch per family. */
export function placeholderLoadTarget(family: LoadAssetFamily): string {
  switch (family) {
    case 'maps':
      return 'Maps/NewMap'
    case 'images':
      return 'Portraits/NewPortrait'
    case 'audio':
      return 'Audio/NewCue'
    case 'fonts':
      return 'Fonts/NewFont'
    case 'data':
      return 'Data/NewData'
    case 'other':
      return 'NewAsset'
  }
}

/** Draft workspace a newly created Load patch belongs to: maps stay in the map workspace, the rest in mods. */
export function loadFamilyWorkspace(family: LoadAssetFamily): 'map' | 'mods' {
  return family === 'maps' ? 'map' : 'mods'
}

/** Map family fromFile assets may point at (map documents and tile textures). */
const MAP_FROM_FILE_EXTENSIONS = /\.(?:tmx|tbin|tsx|png)$/iu

/**
 * Filters project assets to the ones a Load patch of this family can consume:
 * map documents for maps, and media-type buckets for the other families.
 */
export function projectAssetsForLoadFamily<T extends Pick<ProjectAssetRef, 'relativePath' | 'mediaType'>>(
  family: LoadAssetFamily,
  assets: readonly T[],
): T[] {
  if (family === 'maps') {
    return assets.filter((asset) => MAP_FROM_FILE_EXTENSIONS.test(asset.relativePath))
  }
  const kind = family === 'images' ? 'image' : family === 'audio' ? 'audio' : family === 'fonts' || family === 'data' ? 'data' : 'other'
  return assets.filter((asset) => classifyProjectAsset(asset.mediaType, asset.relativePath) === kind)
}
