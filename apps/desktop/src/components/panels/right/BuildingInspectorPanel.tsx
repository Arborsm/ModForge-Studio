import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../../../lib/app/buildingWorkspace'
import type { ModSourceEntry } from '../../../lib/app/modAssetIndex'
import { useBuildingsCopy } from '../../../lib/app/localeContext'
import { PanelFrame } from '../../ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '../../ui/PanelSection'
import { ModSourceList } from '../../ui/ModSourceList'

type BuildingInspectorPanelProps = {
  building: BuildingWorkspaceEntry | null
  textureState: BuildingTextureAssetState | null
  activeIndoorMapPath: string | null
  activeExteriorMapPath: string | null
  modSources?: ModSourceEntry[]
}

function renderKv(label: string, value: string) {
  return (
    <div className="kv-row">
      <span>{label}</span>
      <span className="max-w-[55%] truncate text-right">{value}</span>
    </div>
  )
}

function formatPoint(value: { X: number; Y: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y}` : fallback
}

function formatRect(value: { X: number; Y: number; Width: number; Height: number } | null, fallback: string) {
  return value ? `${value.X}, ${value.Y} / ${value.Width} x ${value.Height}` : fallback
}

export function BuildingInspectorPanel({
  building,
  textureState,
  activeIndoorMapPath,
  activeExteriorMapPath,
  modSources = [],
}: BuildingInspectorPanelProps) {
  const copy = useBuildingsCopy()
  const { yesLabel, noLabel } = copy

  return (
    <PanelFrame title={copy.inspectorTitle} subtitle={copy.inspectorSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!building ? (
          <PanelEmptyState>{copy.inspectorEmpty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection title={copy.basics} bodyClassName="space-y-2">
                {renderKv(copy.displayNameLabel, building.displayName)}
                {renderKv(copy.internalNameLabel, building.internalName)}
                {renderKv(copy.sourceKindLabel, building.sourceKind === 'constructible' ? copy.sourceConstructibleLabel : copy.sourceWorldLabel)}
                {renderKv(copy.groupLabel, building.groupDisplayName)}
                {renderKv(copy.builderLabel, building.builder ?? copy.noneLabel)}
                {renderKv(copy.typeLabel, building.buildingClassName ?? copy.noneLabel)}
                {renderKv(copy.descriptionLabel, building.description ?? copy.noneLabel)}
            </PanelSection>

            <PanelSection title={copy.construction} bodyClassName="space-y-2">
                {renderKv(copy.buildDaysLabel, String(building.buildDays))}
                {renderKv(copy.buildCostLabel, String(building.buildCost))}
                {renderKv(copy.buildConditionLabel, building.buildCondition ?? copy.noneLabel)}
                {renderKv(copy.magicalLabel, building.magicalConstruction ? yesLabel : noLabel)}
                {renderKv(copy.upgradeFromLabel, building.upgradeFromKey ?? copy.noneLabel)}
                {renderKv(copy.upgradeToLabel, building.upgradeToKeys.join(', ') || copy.noneLabel)}
                {renderKv(copy.entranceCountLabel, String(building.worldEntrances.length))}
            </PanelSection>

            <PanelSection title={copy.indoor} bodyClassName="space-y-2">
                {renderKv(copy.sizeLabel, building.size ? `${building.size.X} x ${building.size.Y}` : copy.noneLabel)}
                {renderKv(copy.humanDoorLabel, formatPoint(building.humanDoor, copy.noneLabel))}
                {renderKv(copy.animalDoorLabel, formatRect(building.animalDoor, copy.noneLabel))}
                {renderKv(copy.exteriorMapLabel, activeExteriorMapPath ?? building.exteriorMapPathLabel ?? copy.noneLabel)}
                {renderKv(copy.exteriorEntryLabel, formatPoint(building.exteriorEntryTile, copy.noneLabel))}
                {renderKv(copy.indoorMapLabel, activeIndoorMapPath ?? building.indoorMapPathLabel)}
                {renderKv(copy.indoorTypeLabel, building.indoorMapType ?? copy.noneLabel)}
                {renderKv(copy.nonInstancedIndoorLabel, building.nonInstancedIndoorLocation ?? copy.noneLabel)}
            </PanelSection>

            <PanelSection title={copy.assets} bodyClassName="space-y-2">
                {renderKv(copy.textureLabel, building.texturePathLabel)}
                {renderKv(
                  copy.textureSizeLabel,
                  textureState?.width && textureState?.height ? `${textureState.width} x ${textureState.height}` : copy.noneLabel,
                )}
                {renderKv(copy.sourceRectLabel, formatRect(building.sourceRect, copy.noneLabel))}
                {renderKv(copy.drawOffsetLabel, formatPoint(building.drawOffset, copy.noneLabel))}
                {renderKv(copy.mapPathLabel, activeIndoorMapPath ?? building.indoorMapPathLabel)}
            </PanelSection>

            <PanelSection title="Mod Sources">
              <ModSourceList sources={modSources} />
            </PanelSection>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
