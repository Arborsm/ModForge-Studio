import { Crop, Eraser, Image as ImageIcon, LandPlot, Map as MapIcon, MousePointerClick } from 'lucide-react'
import { AssetValidationRail, type AssetEntryDraft, type AssetIssue, type ResourceOption } from '@entities/asset-schema'
import type { BuildingAssetPatchState } from '@entities/building'
import { ResourcePicker, toResourceBrowserOptions } from '@features/resource-browser'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { BuildingChainStage } from '../state/useBuildingAuthoringSources'
import type { FootprintPickTarget } from './BuildingFootprintOverlay'

function UpgradeChainTools({ stages, onSelect }: { stages: readonly BuildingChainStage[]; onSelect: (key: string) => void }) {
  const copy = useBuildingDataEditorCopy()
  if (stages.length < 2) return null

  return (
    <div className="building-tab-tools">
      <div className="building-tab-tools-title">{copy.chain.title}</div>
      <ol className="building-chain-strip">
        {stages.map((stage, index) => (
          <li key={stage.key} className="building-chain-stage">
            <button
              type="button"
              className={cx('building-chain-button', stage.isActive && 'is-active')}
              aria-current={stage.isActive ? 'true' : undefined}
              onClick={() => onSelect(stage.key)}
            >
              <span className="building-chain-step">{copy.chain.stageLabel(index + 1, stages.length)}</span>
              <span className="building-chain-name">{stage.displayName}</span>
              <span className={stage.inProject ? 'asset-editor-badge is-ok' : 'asset-editor-badge'}>
                {stage.inProject ? copy.chain.inProjectBadge : copy.chain.vanillaBadge}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Visual and resource tools injected into the relevant building schema tab. */
export function BuildingGroupTools({
  groupId,
  draft,
  issues,
  texturePatchState,
  chainStages,
  indoorMapOptions,
  pickTarget,
  onPickTargetChange,
  onOpenFootprint,
  onOpenSourceRect,
  onOpenTextureEditor,
  onApplyIndoorMap,
  onSelectStage,
  onSelectIssue,
}: {
  groupId: string
  draft: AssetEntryDraft
  issues: readonly AssetIssue[]
  texturePatchState: BuildingAssetPatchState | null
  chainStages: readonly BuildingChainStage[]
  indoorMapOptions: readonly ResourceOption[]
  pickTarget: FootprintPickTarget | null
  onPickTargetChange: (target: FootprintPickTarget | null) => void
  onOpenFootprint: () => void
  onOpenSourceRect: () => void
  onOpenTextureEditor: () => void
  onApplyIndoorMap: (value: string | undefined) => void
  onSelectStage: (key: string) => void
  onSelectIssue: (issue: AssetIssue) => void
}) {
  const copy = useBuildingDataEditorCopy()

  if (groupId === 'basics') {
    return issues.length > 0 ? <AssetValidationRail issues={issues} onSelectIssue={onSelectIssue} /> : null
  }

  if (groupId === 'placement') {
    const picks: Array<{ id: FootprintPickTarget; label: string }> = [
      { id: 'HumanDoor', label: copy.preview.pickHumanDoor },
      { id: 'AnimalDoor', label: copy.preview.pickAnimalDoor },
      { id: 'UpgradeSignTile', label: copy.preview.pickUpgradeSign },
    ]
    return (
      <div className="building-tab-tools">
        <button type="button" className="control-button" onClick={onOpenFootprint}>
          <LandPlot className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copy.footprintMap.openAction}</span>
        </button>
        <div className="building-tab-tool-group" role="group" aria-label={copy.preview.pickIdle}>
          <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
          {picks.map((pick) => (
            <button
              key={pick.id}
              type="button"
              aria-pressed={pickTarget === pick.id}
              className={cx('building-preview-pick-button', pickTarget === pick.id && 'is-active')}
              onClick={() => onPickTargetChange(pickTarget === pick.id ? null : pick.id)}
            >
              {pick.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (groupId === 'texture') {
    return (
      <div className="building-tab-tools">
        <div className="building-tab-tool-status">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{texturePatchState?.assetTarget || copy.texture.noAsset}</span>
          {texturePatchState !== null ? (
            <span className={texturePatchState.fileInDraft ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
              {texturePatchState.fileInDraft ? copy.texture.patchFound : copy.texture.patchMissing}
            </span>
          ) : null}
        </div>
        <button type="button" className="control-button" onClick={onOpenTextureEditor} disabled={texturePatchState === null}>
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copy.texture.openEditorAction}</span>
        </button>
        <button type="button" className="control-button" onClick={onOpenSourceRect}>
          <Crop className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{copy.preview.pickSourceRectAction}</span>
        </button>
      </div>
    )
  }

  if (groupId === 'indoor') {
    const indoorMap = typeof draft.fields['IndoorMap'] === 'string' ? draft.fields['IndoorMap'] : ''
    return (
      <div className="building-tab-tools">
        <div className="building-tab-tool-status">
          <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{indoorMap || copy.summary.notSet}</span>
        </div>
        <ResourcePicker
          value={indoorMap}
          label={copy.indoorMap.title}
          placeholder={copy.indoorMap.searchPlaceholder}
          options={toResourceBrowserOptions('map', indoorMapOptions)}
          selectionMode="confirm"
          triggerClassName="control-button"
          triggerContent={
            <>
              <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copy.indoorMap.openAction}</span>
            </>
          }
          onSelect={(next) => onApplyIndoorMap(next || undefined)}
        />
        <button
          type="button"
          className="control-button"
          title={copy.indoorMap.clearAction}
          aria-label={copy.indoorMap.clearAction}
          disabled={indoorMap === ''}
          onClick={() => onApplyIndoorMap(undefined)}
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    )
  }

  if (groupId === 'upgrade') {
    return <UpgradeChainTools stages={chainStages} onSelect={onSelectStage} />
  }

  return null
}
