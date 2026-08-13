import type { DraftPatch, VirtualPreviewAsset } from '@features/cp-maker'

export type ProjectAssetKind = 'map' | 'image' | 'audio' | 'data' | 'other'

/** Normalizes an imported or renamed project-relative path without allowing parent traversal. */
export function sanitizeProjectAssetPath(input: string): string {
  const parts = input
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.' && part !== '..')
    .map((part) =>
      Array.from(part, (character) => (character.charCodeAt(0) < 32 ? '-' : character))
        .join('')
        .replace(/[<>:"|?*]/gu, '-')
        .replace(/[. ]+$/gu, '')
        .trim(),
    )
    .filter(Boolean)
  return parts.join('/')
}

/** Returns a collision-free path using the familiar `name-2.ext` suffix scheme. */
export function allocateProjectAssetPath(existingPaths: Iterable<string>, requestedPath: string, ignoredPath?: string): string {
  const requested = sanitizeProjectAssetPath(requestedPath) || 'asset'
  const ignored = ignoredPath?.replaceAll('\\', '/').toLowerCase()
  const existing = new Set(Array.from(existingPaths, (path) => path.replaceAll('\\', '/').toLowerCase()).filter((path) => path !== ignored))
  if (!existing.has(requested.toLowerCase())) {
    return requested
  }
  const slash = requested.lastIndexOf('/')
  const folder = slash >= 0 ? requested.slice(0, slash + 1) : ''
  const file = slash >= 0 ? requested.slice(slash + 1) : requested
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  const extension = dot > 0 ? file.slice(dot) : ''
  let suffix = 2
  while (existing.has(`${folder}${stem}-${suffix}${extension}`.toLowerCase())) {
    suffix += 1
  }
  return `${folder}${stem}-${suffix}${extension}`
}

/** Returns true for map assets whose parsed payload can render a thumbnail (TMX/TBIN). */
export function isProjectMapAssetPath(path: string): boolean {
  const normalized = path.toLowerCase()
  return normalized.endsWith('.tmx') || normalized.endsWith('.tbin')
}

/** Common image extensions used when the browser reports no usable MIME. */
const IMAGE_EXTENSION_FALLBACK = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])

/**
 * Broad media bucket used by the library filters and preview renderer.
 *
 * Map documents have no standard MIME (browsers report `application/octet-stream`),
 * so the project-relative path is checked first; when the MIME is missing or
 * generic, the path extension is the fallback so imported assets never silently
 * land in "other".
 */
export function classifyProjectAsset(mediaType: string, relativePath: string): ProjectAssetKind {
  if (isProjectMapAssetPath(relativePath)) return 'map'
  if (mediaType.startsWith('image/')) return 'image'
  if (mediaType.startsWith('audio/')) return 'audio'
  if (mediaType.includes('json') || mediaType.startsWith('text/')) return 'data'
  if (mediaType === '' || mediaType === 'application/octet-stream') {
    const extension = relativePath.split('.').at(-1)?.toLowerCase() ?? ''
    if (IMAGE_EXTENSION_FALLBACK.has(extension)) return 'image'
    if (extension === 'json') return 'data'
  }
  return 'other'
}

/** Human-readable byte count derived from a base64 payload without decoding it. */
export function estimateBase64Bytes(bytesBase64: string): number {
  const padding = bytesBase64.endsWith('==') ? 2 : bytesBase64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((bytesBase64.length * 3) / 4) - padding)
}

export type AssetRenamePlan = {
  asset: VirtualPreviewAsset
  oldPath: string
  patchUpdates: Array<{ patchId: string; fromFile: string }>
}

/** Builds an atomic rename plan, including every patch whose `FromFile` must follow the asset. */
export function planProjectAssetRename(
  assets: readonly VirtualPreviewAsset[],
  patches: readonly DraftPatch[],
  oldPath: string,
  requestedPath: string,
): AssetRenamePlan | null {
  const current = assets.find((asset) => asset.relativePath === oldPath)
  if (!current) return null
  const nextPath = allocateProjectAssetPath(
    assets.map((asset) => asset.relativePath),
    requestedPath,
    oldPath,
  )
  const wanted = oldPath.replaceAll('\\', '/').toLowerCase()
  return {
    asset: { ...current, relativePath: nextPath },
    oldPath,
    patchUpdates: patches.flatMap((patch) =>
      patch.fromFile?.replaceAll('\\', '/').toLowerCase() === wanted ? [{ patchId: patch.id, fromFile: nextPath }] : [],
    ),
  }
}

/** Changes an image asset's extension to PNG while preserving its directory. */
export function pngAssetPath(path: string): string {
  const normalized = sanitizeProjectAssetPath(path)
  return /\.[^./]+$/u.test(normalized) ? normalized.replace(/\.[^./]+$/u, '.png') : `${normalized}.png`
}
