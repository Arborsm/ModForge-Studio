import type { BuildingWorkspaceEntry } from '../entities/building'
import type { BuildingsPanelCopy } from '@locales/editor-shell'

export type BuildingWorkspaceHeaderProps = {
  building: BuildingWorkspaceEntry
  copy: BuildingsPanelCopy
}

export function BuildingWorkspaceHeader(props: BuildingWorkspaceHeaderProps) {
  const isConstructible = props.building.sourceKind === 'constructible'

  return (
    <div className="panel-header">
      <div>
        <p className="panel-title">{props.copy.workspaceTitle}</p>
        <p className="panel-subtitle">
          {props.building.displayName} / {props.copy.workspaceSubtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="dock-chip">{isConstructible ? props.copy.sourceConstructibleLabel : props.copy.sourceWorldLabel}</span>
        <span className="dock-chip">{isConstructible ? (props.building.builder ?? props.copy.noneLabel) : (props.building.exteriorMapName ?? props.copy.noneLabel)}</span>
        <span className="dock-chip">
          {isConstructible
            ? props.copy.stageLabel.replace('{current}', String(props.building.stageIndex + 1)).replace('{total}', String(props.building.stageCount))
            : `$''' + '''{props.copy.entranceCountLabel}: $''' + '''{props.building.worldEntrances.length}`}
        </span>
      </div>
    </div>
  )
}
