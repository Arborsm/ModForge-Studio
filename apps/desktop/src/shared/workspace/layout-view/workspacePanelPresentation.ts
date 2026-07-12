import { Activity, Boxes, Files, FolderOpen, Layers3, Library, Map, Package, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import type { DockArea } from '@shared/contracts'

const PANEL_ICON_MAP: Record<string, LucideIcon> = {
  project: FolderOpen,
  assets: Files,
  viewport: Map,
  'item-navigation': Files,
  'item-catalog': Package,
  'item-details': SlidersHorizontal,
  'mods-browser': Library,
  'mods-navigator': Files,
  'mods-workspace': Package,
  'mods-trace': Activity,
  'mods-target-diagnostics': Activity,
  'mods-export': Files,
  'mods-inspector': SlidersHorizontal,
  'mods-diagnostics': Activity,
  inspector: SlidersHorizontal,
  layers: Layers3,
  'object-groups': Boxes,
  diagnostics: Activity,
}

export function getPanelIcon(panelId: string) {
  const localPanelId = panelId.includes('/') ? panelId.slice(panelId.lastIndexOf('/') + 1) : panelId
  return PANEL_ICON_MAP[panelId] ?? PANEL_ICON_MAP[localPanelId] ?? Library
}

export function getDockLabel(area: DockArea) {
  switch (area) {
    case 'left-top':
      return 'Left Top'
    case 'left-bottom':
      return 'Left Bottom'
    case 'right-top':
      return 'Right Top'
    case 'right-bottom':
      return 'Right Bottom'
    case 'bottom-left':
      return 'Bottom Left'
    case 'bottom-right':
      return 'Bottom Right'
    case 'center':
      return 'Center'
  }
}
