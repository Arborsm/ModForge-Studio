import type { BuildingWorkspaceEntry } from '@entities/building'
import { useBuildingsCopy } from '@locales/provider'

export type BuildingSkinsPanelProps = {
  building: BuildingWorkspaceEntry
}

/** Registered skins list; only rendered when skins exist. */
export function BuildingSkinsPanel(props: BuildingSkinsPanelProps) {
  const copy = useBuildingsCopy()

  if (props.building.sourceKind !== 'constructible' || props.building.skins.length === 0) {
    return null
  }

  return (
    <div>
      <p className="building-workspace-section-title mb-1.5">{copy.skinsTitle}</p>
      <div className="space-y-1">
        {props.building.skins.map((skin) => (
          <div key={`${props.building.key}:${skin.id}`} className="flex items-start justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="text-text-primary truncate text-xs font-semibold">{skin.displayName}</p>
              <p className="text-text-secondary text-meta truncate">{skin.texturePathLabel}</p>
            </div>
            {skin.showAsSeparateConstructionEntry ? <span className="dock-chip shrink-0">{copy.separateBuildBadge}</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
