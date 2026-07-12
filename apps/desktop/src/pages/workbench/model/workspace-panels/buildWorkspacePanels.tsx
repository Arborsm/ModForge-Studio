import type { WorkspacePanelConfig } from '@shared/contracts'
import { buildCoreWorkspacePanels } from './core'
import { buildBuildingsWorkspacePanels } from './buildings'
import { buildCharactersWorkspacePanels } from './characters'
import { buildEventsWorkspacePanels } from './events'
import { buildItemsWorkspacePanels } from './items'
import { buildMapsWorkspacePanels } from './maps'
import { buildModI18nWorkspacePanels } from './modI18n'
import { buildModsWorkspacePanels } from './mods'
import type { BuildWorkspacePanelsOptions } from './types'

export type { BuildWorkspacePanelsOptions } from './types'

export function buildWorkspacePanels(options: BuildWorkspacePanelsOptions): WorkspacePanelConfig[] {
  const { workspaceMode } = options

  if (workspaceMode === 'mod-browser') {
    return buildModsWorkspacePanels(options)
  }

  if (workspaceMode === 'mod-i18n') {
    return buildModI18nWorkspacePanels(options)
  }

  if (workspaceMode === 'items') {
    return buildItemsWorkspacePanels(options)
  }

  if (workspaceMode === 'buildings') {
    return buildBuildingsWorkspacePanels(options)
  }

  if (workspaceMode === 'characters') {
    return buildCharactersWorkspacePanels(options)
  }

  if (workspaceMode === 'events') {
    return buildEventsWorkspacePanels(options)
  }

  if (workspaceMode === 'map') {
    return buildMapsWorkspacePanels(options)
  }

  return buildCoreWorkspacePanels(options)
}
