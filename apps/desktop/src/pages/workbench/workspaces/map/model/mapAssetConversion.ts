import type { DraftPatch } from '@features/cp-maker'

/** Normalizes a project-relative path for case- and separator-insensitive comparison. */
export function normalizeProjectAssetPath(path: string): string {
  return path.replaceAll('\\', '/').toLowerCase()
}

/**
 * Converts a map asset path to its TMX equivalent: a `.tbin`/`.xnb` suffix
 * (case-insensitive) is replaced with `.tmx`; any other suffix passes through
 * unchanged so the caller can treat an unchanged result as a no-op.
 */
export function tmxConversionPath(assetPath: string): string {
  return assetPath.replace(/\.(?:tbin|xnb)$/iu, '.tmx')
}

/** Ids of every patch whose FromFile resolves to the given asset path. */
export function collectPatchesReferencingAsset(patches: readonly DraftPatch[], assetPath: string): string[] {
  const wanted = normalizeProjectAssetPath(assetPath)
  return patches.filter((patch) => patch.fromFile != null && normalizeProjectAssetPath(patch.fromFile) === wanted).map((patch) => patch.id)
}
