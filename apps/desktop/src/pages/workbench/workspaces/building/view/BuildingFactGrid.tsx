import { formatPoint, formatRect } from '@shared/infra/game-formats/geometryFormatting'
import type { BuildingWorkspaceEntry } from '../entities/building'
import type { BuildingsPanelCopy } from '@locales/api'

export type BuildingFactGridProps = {
  building: BuildingWorkspaceEntry
  activeIndoorMapPath: string | null
  copy: BuildingsPanelCopy
}

export function BuildingFactGrid(props: BuildingFactGridProps) {
  const isConstructible = props.building.sourceKind === 'constructible'

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {isConstructible ? (
        <>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.builderLabel}</p>
            <p className="mt-1 text-sm text-(--text-primary)">{props.building.builder ?? props.copy.noneLabel}</p>
          </div>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.humanDoorLabel}</p>
            <p className="mt-1 text-sm text-(--text-primary)">{formatPoint(props.building.humanDoor, props.copy.noneLabel)}</p>
          </div>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.animalDoorLabel}</p>
            <p className="mt-1 text-sm text-(--text-primary)">{formatRect(props.building.animalDoor, props.copy.noneLabel)}</p>
          </div>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.occupantsLabel}</p>
            <p className="mt-1 text-sm text-(--text-primary)">{props.building.maxOccupants}</p>
          </div>
        </>
      ) : (
        <>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.exteriorMapLabel}</p>
            <p className="mt-1 truncate text-sm text-(--text-primary)">{props.building.exteriorMapName ?? props.copy.noneLabel}</p>
          </div>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.exteriorEntryLabel}</p>
            <p className="mt-1 text-sm text-(--text-primary)">{formatPoint(props.building.exteriorEntryTile, props.copy.noneLabel)}</p>
          </div>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.indoorMapLabel}</p>
            <p className="mt-1 truncate text-sm text-(--text-primary)">{props.activeIndoorMapPath ?? props.building.indoorMapPathLabel}</p>
          </div>
          <div className="panel-section p-3">
            <p className="panel-section-title">{props.copy.entranceCountLabel}</p>
            <p className="mt-1 text-sm text-(--text-primary)">{props.building.worldEntrances.length}</p>
          </div>
        </>
      )}
    </div>
  )
}
