import type { MapAssetSummary } from '@entities/game/api'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'

export type AssetBrowserPanelProps = {
  mapAssets: MapAssetSummary[]
  filteredAssets: MapAssetSummary[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modMapGroups: ModBrowserGroup<MapAssetSummary>[]
  activeModMapSelectionId: string | null
  activeMapId: string | null
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: MapAssetSummary) => void
  onOpenModAsset: (entry: ModBrowserEntry<MapAssetSummary>) => void
}

export function getAssetGroupLabel(asset: MapAssetSummary) {
  const relativePath = asset.relativePath.replaceAll('\\', '/')
  const pathSegments = relativePath.split('/')
  const fileName = pathSegments[pathSegments.length - 1]?.replace(/\.(tmx|xnb)$/i, '') ?? asset.name
  const familySource = /^Island(?:_|-|[A-Z])/.test(fileName) ? 'Island' : fileName.split(/[-_]/)[0]?.replace(/\d+$/u, '') || fileName

  return familySource || '#'
}

export { formatBytes } from '@shared/lib/formatting'
