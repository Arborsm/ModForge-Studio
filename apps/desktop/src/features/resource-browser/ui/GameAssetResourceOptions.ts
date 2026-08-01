import type { AudioAssetSummary, GameDataAssetSummary, GameImageAssetSummary } from '@entities/game/api'
import type { ResourceBrowserOption } from './ResourcePicker'

function categoryFor(cpKey: string): string {
  const slash = cpKey.indexOf('/')
  return slash > 0 ? cpKey.slice(0, slash) : 'Images'
}

/** Builds game image options (CP asset key labels) for the shared resource browser. */
export function toGameImageResourceBrowserOptions(
  assets: readonly GameImageAssetSummary[],
  idPrefix = 'game-image',
): ResourceBrowserOption[] {
  return assets.map((asset) => ({
    id: `${idPrefix}:${asset.relativePath}`,
    kind: 'texture',
    value: asset.relativePath,
    aliases: [asset.name],
    label: asset.name,
    category: categoryFor(asset.name),
    subtitle: 'XNB',
    meta: `${asset.sizeBytes}`,
    sourcePath: asset.relativePath,
    sourceKind: 'game',
  }))
}

/** Builds game audio options for the shared resource browser. */
export function toGameAudioResourceBrowserOptions(assets: readonly AudioAssetSummary[], idPrefix = 'game-audio'): ResourceBrowserOption[] {
  return assets.map((asset) => ({
    id: `${idPrefix}:${asset.relativePath}`,
    kind: asset.kind === 'music' ? 'music' : 'sound',
    value: asset.relativePath,
    aliases: [asset.cue],
    label: asset.cue,
    category: asset.kind === 'music' ? 'Music' : 'Sound',
    subtitle: asset.kind,
    sourcePath: asset.relativePath,
    sourceKind: 'game',
  }))
}

/** Builds game data options (CP asset key labels) for the shared resource browser. */
export function toGameDataResourceBrowserOptions(assets: readonly GameDataAssetSummary[], idPrefix = 'game-data'): ResourceBrowserOption[] {
  return assets.map((asset) => ({
    id: `${idPrefix}:${asset.relativePath}`,
    kind: 'item',
    value: asset.relativePath,
    aliases: [asset.name],
    label: asset.name,
    category: 'Data',
    subtitle: asset.relativePath.endsWith('.json') ? 'JSON' : 'XNB',
    meta: `${asset.sizeBytes}`,
    sourcePath: asset.relativePath,
    sourceKind: 'game',
  }))
}
