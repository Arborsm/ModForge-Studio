import type { MapAssetSummary } from '@entities/game/api'
import type { ResourceBrowserOption } from './ResourcePicker'

function mapTarget(assetName: string): string {
  const name = assetName
    .trim()
    .replaceAll('\\', '/')
    .replace(/^Maps\//iu, '')
    .replace(/\.(?:xnb|tbin|tmx)$/iu, '')
  return `Maps/${name}`
}

/** Builds path-aware map options for the shared resource browser. */
export function toMapResourceBrowserOptions(
  assets: readonly MapAssetSummary[],
  categoryFor: (asset: MapAssetSummary) => string,
  idPrefix = 'map',
): ResourceBrowserOption[] {
  return assets.map((asset) => ({
    id: `${idPrefix}:${asset.id}`,
    kind: 'map',
    value: mapTarget(asset.name),
    aliases: [asset.name, asset.fileName, asset.relativePath],
    label: asset.name,
    category: categoryFor(asset),
    subtitle: asset.format.toUpperCase(),
    meta: `${asset.sizeBytes}`,
    sourcePath: asset.relativePath,
    sourceKind: 'game',
  }))
}
