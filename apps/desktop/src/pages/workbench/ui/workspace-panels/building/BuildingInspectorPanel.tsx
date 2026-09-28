import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '@entities/building'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { BuildingDetailPane } from '../../../workspaces/building/view/BuildingDetailPane'

type BuildingInspectorPanelProps = {
  building: BuildingWorkspaceEntry | null
  textureState: BuildingTextureAssetState | null
  activeIndoorMapPath: string | null
  activeExteriorMapPath: string | null
  modSources?: ModSourceEntry[]
}

/** Right-rail building details (hero + tabs). Kept as panel entry for workspace registry. */
export function BuildingInspectorPanel({
  building,
  textureState,
  activeIndoorMapPath,
  activeExteriorMapPath,
  modSources = [],
}: BuildingInspectorPanelProps) {
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
