/**
 * @file Builds path-aware map options for the shared resource browser from map asset summaries.
 * @module features/resource-browser
 */

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

/**
 * Builds path-aware map options for the shared resource browser.
 *
 * `displayNameFor` is injected by callers that can resolve localized location
 * names (e.g. the replacement editor): when it returns a name for a map
 * target, the option labels itself with it and keeps the raw asset name as
 * the subtitle so the two stay disambiguated.
 */
export function toMapResourceBrowserOptions(
  assets: readonly MapAssetSummary[],
  categoryFor: (asset: MapAssetSummary) => string,
  idPrefix = 'map',
  displayNameFor?: (target: string) => string | null,
): ResourceBrowserOption[] {
  return assets.map((asset) => {
    const target = mapTarget(asset.name)
    const displayName = displayNameFor?.(target) ?? null
    return {
      id: `${idPrefix}:${asset.id}`,
      kind: 'map',
      value: target,
      aliases: displayName
        ? [asset.name, asset.fileName, asset.relativePath, displayName]
        : [asset.name, asset.fileName, asset.relativePath],
      label: displayName ?? asset.name,
      category: categoryFor(asset),
      subtitle: displayName ? asset.name : asset.format.toUpperCase(),
      meta: `${asset.sizeBytes}`,
      sourcePath: asset.relativePath,
      sourceKind: 'game',
    }
  })
}
