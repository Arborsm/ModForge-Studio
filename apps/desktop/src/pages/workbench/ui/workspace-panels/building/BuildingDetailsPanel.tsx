import type { BuildingWorkspaceEntry } from '../../../workspaces/building'
import type { BuildingTextureAssetState } from '../../../workspaces/building'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { BuildingDetailPane } from '../../../workspaces/building/view/BuildingDetailPane'

type BuildingDetailsPanelProps = {
  building: BuildingWorkspaceEntry | null
  textureState?: BuildingTextureAssetState | null
  activeIndoorMapPath?: string | null
  activeExteriorMapPath?: string | null
  modSources?: ModSourceEntry[]
}

/**
 * @deprecated Prefer BuildingInspectorPanel / BuildingDetailPane.
 * Kept for import stability; renders the unified detail pane.
 */
export function BuildingDetailsPanel({
  building,
  textureState = null,
  activeIndoorMapPath = null,
  activeExteriorMapPath = null,
  modSources = [],
}: BuildingDetailsPanelProps) {
  return (
    <BuildingDetailPane
      building={building}
      textureState={textureState}
      activeIndoorMapPath={activeIndoorMapPath}
      activeExteriorMapPath={activeExteriorMapPath}
      modSources={modSources}
    />
  )
}
