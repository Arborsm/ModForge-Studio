import type { WorkspacePanelConfig } from '../../components/WorkspaceLayout'
import { buildCoreWorkspacePanels } from './workspacePanels/core'
import { buildItemsWorkspacePanels } from './workspacePanels/items'
import { buildModsWorkspacePanels } from './workspacePanels/mods'
import type { BuildWorkspacePanelsOptions } from './workspacePanels/types'

export type { BuildWorkspacePanelsOptions } from './workspacePanels/types'

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
