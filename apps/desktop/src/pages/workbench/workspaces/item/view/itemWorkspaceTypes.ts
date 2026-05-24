import type { LucideIcon } from 'lucide-react'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup, ModSourceEntry } from '@pages/workbench/workspaces/mod'
import type { ItemBrowseCategory, ItemTextureAssetState, ItemWorkspaceEntry } from '../entities/item'

export type ItemsCopy = import('@locales/editor-shell').ItemsPanelCopy

export type ItemWorkspaceProps = {
  item: ItemWorkspaceEntry | null
  items: ItemWorkspaceEntry[]
  filteredItems: ItemWorkspaceEntry[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modItemGroups: ModBrowserGroup<ItemWorkspaceEntry>[]
  activeItemModSources: ModSourceEntry[]
  activeItemId: string | null
  activeModItemSelectionId: string | null
  itemFilter: string
  itemLookup: Map<string, ItemWorkspaceEntry>
  textureStatesByAssetName: Record<string, ItemTextureAssetState>
  ensureTextureAssetStates: (assetNames: string[]) => void
  onItemFilterChange: (value: string) => void
  onSelectItem: (itemKey: string) => void
  onSelectModItem: (entry: ModBrowserEntry<ItemWorkspaceEntry>) => void
}

export type Tone = 'neutral' | 'positive' | 'danger' | 'accent'

export type HeroChip = {
  key: string
  label: string
  value: string
  tone?: Tone
  icon?: 'coins' | 'heart' | 'skull'
}

export type SourceCard = {
  key: string
  badge: string
  title: string
  detail: string
  meta: string[]
  relatedQualifiedItemId?: string | null
  chance?: string | null
}

export type UseCard = {
  key: string
  badge: string
  title: string
  subtitle: string
  outputQualifiedItemId?: string | null
  outputCount?: number
  ingredients: Array<{
    key: string
    label: string
    amount: number
    qualifiedItemId?: string | null
    isCurrent?: boolean
  }>
}

export type BrowseTab = {
  id: ItemBrowseCategory
  label: string
  count: number
  Icon: LucideIcon
}

export type SignalCard = {
  key: string
  label: string
  value: string
  detail: string
}

export type AsideRow = {
  label: string
  value: string
}

export type AsideSection = {
  key: string
  title: string
  rows: AsideRow[]
}

export type DetailTab = 'info' | 'relations' | 'resources'
