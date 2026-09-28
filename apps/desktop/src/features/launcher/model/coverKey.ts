/**
 * @file Derives stable cover-image cache keys from a library entry's Nexus mod
 * id or label key.
 */
type LauncherCoverKeySource = {
  labelKey: string
  nexusModId: number | null
}

function normalizeCandidate(value: string | null | undefined) {
  return value?.trim() ?? ''
}

/** Returns the primary cover key: Nexus mod id when present, otherwise the label key. */
export function getLauncherCoverKey(item: LauncherCoverKeySource) {
  return item.nexusModId != null ? String(item.nexusModId) : normalizeCandidate(item.labelKey)
}

/** Returns all distinct cover key candidates (primary key plus label key fallback). */
export function getLauncherCoverKeyCandidates(item: LauncherCoverKeySource) {
  const candidates = [getLauncherCoverKey(item), normalizeCandidate(item.labelKey)].filter(Boolean)
  return Array.from(new Set(candidates))
}
