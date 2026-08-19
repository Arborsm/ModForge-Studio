/**
 * @file Map name normalization helper for case-insensitive map key matching.
 */

/** Normalizes a map name to lowercase trimmed form for stable key comparison. */
export function normalizeMapName(name: string) {
  return name.trim().toLowerCase()
}
