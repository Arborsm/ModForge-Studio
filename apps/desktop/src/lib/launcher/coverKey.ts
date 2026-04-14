type LauncherCoverKeySource = {
  labelKey: string
  nexusModId: number | null
}

function normalizeCandidate(value: string | null | undefined) {
  return value?.trim() ?? ''
}

export function getLauncherCoverKey(item: LauncherCoverKeySource) {
  return item.nexusModId != null ? String(item.nexusModId) : normalizeCandidate(item.labelKey)
}

export function getLauncherCoverKeyCandidates(item: LauncherCoverKeySource) {
  const candidates = [getLauncherCoverKey(item), normalizeCandidate(item.labelKey)].filter(Boolean)
  return Array.from(new Set(candidates))
}
