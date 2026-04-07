import type { GameDirectoryInfo, MapAssetSummary } from '../../../lib/desktop'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '../../../lib/app/modAssetIndex'
import type { LocaleCode, WorkspaceMode } from '../../../locales'

export type ProjectPanelProps = {
  locale: LocaleCode
  workspaceMode: WorkspaceMode
  desktopHost: boolean
  gameDirectory: string
  onGameDirectoryChange: (value: string) => void
  onChooseDirectory: () => void
  onUseKnownPath: () => void
  onValidateOnly: () => void
  onScanAndOpenTown: () => void
  directoryInfo: GameDirectoryInfo | null
  mapAssets: MapAssetSummary[]
  activeMapId: string | null
  sceneLabel?: string
}

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

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getAssetGroupLabel(asset: MapAssetSummary) {
  const relativePath = asset.relativePath.replaceAll('\\', '/')
  const pathSegments = relativePath.split('/')
  const fileName = pathSegments[pathSegments.length - 1]?.replace(/\.(tmx|xnb)$/i, '') ?? asset.name
  const familySource = /^Island(?:_|-|[A-Z])/.test(fileName)
    ? 'Island'
    : fileName.split(/[-_]/)[0]?.replace(/\d+$/u, '') || fileName

  return familySource || '#'
}
