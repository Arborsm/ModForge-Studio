import type { MapDocument } from '@entities/map'

/**
 * Parses the JSON map document payload returned by `loadCpMakerProjectMapAsset`
 * into the `MapDocument` shape consumed by the shared thumbnail renderer.
 * Returns null for content that is not a serialized map document.
 */
export function parseProjectMapDocument(content: string): MapDocument | null {
  try {
    const parsed = JSON.parse(content) as Partial<MapDocument>
    return typeof parsed.width === 'number' && typeof parsed.height === 'number' && Array.isArray(parsed.layers)
      ? (parsed as MapDocument)
      : null
  } catch {
    return null
  }
}
