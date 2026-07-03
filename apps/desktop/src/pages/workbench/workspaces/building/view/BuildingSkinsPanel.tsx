import { formatPoint } from '@shared/lib/geometryFormatting'
import type { BuildingTextureAssetState, BuildingWorkspaceEntry } from '../entities/building'
import type { BuildingsPanelCopy } from '@locales/api'

export type BuildingSkinsPanelProps = {
  building: BuildingWorkspaceEntry
  _activeTextureState: BuildingTextureAssetState | null
  copy: BuildingsPanelCopy
}

export function BuildingSkinsPanel(props: BuildingSkinsPanelProps) {
  const isConstructible = props.building.sourceKind === 'constructible'

  return (
    <div className="panel-surface panel-surface-muted min-h-0">
      <div className="panel-header">
        <div>
          <p className="panel-title">{isConstructible ? props.copy.skinsTitle : props.copy.exteriorDataTitle}</p>
          <p className="panel-subtitle">
            {isConstructible
              ? `${props.copy.skinCountLabel}: ${props.building.skins.length}`
              : (props.building.exteriorMapPathLabel ?? props.copy.noneLabel)}
          </p>
        </div>
      </div>
      <div className="panel-body min-h-45 overflow-auto p-3">
        {isConstructible ? (
          props.building.skins.length ? (
            <div className="space-y-2">
              {props.building.skins.map((skin) => (
                <div key={`${props.building.key}:${skin.id}`} className="panel-list-card px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-(--text-primary)">{skin.displayName}</p>
                      <p className="truncate text-xs text-(--text-secondary)">{skin.texturePathLabel}</p>
                    </div>
                    {skin.showAsSeparateConstructionEntry ? <span className="dock-chip">{props.copy.separateBuildBadge}</span> : null}
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-(--text-secondary)">
                    {skin.description ?? skin.condition ?? props.copy.noneLabel}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty-state">{props.copy.skinsEmpty}</div>
          )
        ) : (
          <div className="panel-section p-3">
            <div className="space-y-2 text-sm text-(--text-primary)">
              <p>
                {props.copy.sourceMapLabel}: {props.building.exteriorMapName ?? props.copy.noneLabel}
              </p>
              <p>
                {props.copy.exteriorMapLabel}: {props.building.exteriorMapPathLabel ?? props.copy.noneLabel}
              </p>
              <p>
                {props.copy.exteriorEntryLabel}: {formatPoint(props.building.exteriorEntryTile, props.copy.noneLabel)}
              </p>
              <p>
                {props.copy.indoorMapLabel}: {props.building.indoorMapPathLabel}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
