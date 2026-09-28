function assetPathSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, '_')
    .replaceAll(/^_+|_+$/gu, '')
  return normalized || fallback
}

/** Builds the project-owned asset target used when an item stops using a vanilla sheet. */
export function buildItemTextureTarget(projectUniqueId: string, itemId: string): string {
  const owner = assetPathSegment(projectUniqueId, 'ModForge.Project')
  const item = assetPathSegment(itemId, 'Item')
  return `TileSheets/Mods/${owner}/Items/${item}`
}

/** Vanilla item sheets must never be replaced just to provide one custom sprite. */
export function needsProjectItemTexture(assetTarget: string): boolean {
  const normalized = assetTarget.trim().replaceAll('\\', '/').toLowerCase()
  if (normalized.startsWith('tilesheets/mods/')) return false
  return normalized === '' || normalized.startsWith('maps/') || normalized.startsWith('tilesheets/') || normalized.startsWith('characters/')
}
