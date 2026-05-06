import type { WorkspacePanelConfig } from '@shared/contracts'
import { buildCoreWorkspacePanels } from './core'
import { buildItemsWorkspacePanels } from './items'
import { buildModsWorkspacePanels } from './mods'
import type { BuildWorkspacePanelsOptions } from './types'

export type { BuildWorkspacePanelsOptions } from './types'

export function buildWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const { workspaceMode } = options

  if (workspaceMode === 'mods') {
    return buildModsWorkspacePanels(options)
  }

  if (workspaceMode === 'items') {
    return buildItemsWorkspacePanels(options)
  }

  return buildCoreWorkspacePanels(options)
}
