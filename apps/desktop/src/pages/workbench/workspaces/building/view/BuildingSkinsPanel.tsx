import type { BuildingWorkspaceEntry } from '../entities/building'
import type { BuildingsPanelCopy } from '@locales/api'

export type BuildingSkinsPanelProps = {
  building: BuildingWorkspaceEntry
  copy: BuildingsPanelCopy
}

/** Registered skins list; only rendered when skins exist. */
export function BuildingSkinsPanel(props: BuildingSkinsPanelProps) {
  if (props.building.sourceKind !== 'constructible' || props.building.skins.length === 0) {
    return null
  }

  return (
    <div>
      <p className="building-workspace-section-title mb-1.5">{props.copy.skinsTitle}</p>
      <div className="space-y-1">
        {props.building.skins.map((skin) => (
          <div key={`${props.building.key}:${skin.id}`} className="flex items-start justify-between gap-2 py-1">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-(--text-primary)">{skin.displayName}</p>
              <p className="truncate text-[0.65rem] text-(--text-secondary)">{skin.texturePathLabel}</p>
            </div>
            {skin.showAsSeparateConstructionEntry ? <span className="dock-chip shrink-0">{props.copy.separateBuildBadge}</span> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
