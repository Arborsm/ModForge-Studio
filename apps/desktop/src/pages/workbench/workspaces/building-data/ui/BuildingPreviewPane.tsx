/**
 * Right pane of the building authoring editor: the building as the game would
 * assemble it, the footprint it claims, and everything validation has to say.
 *
 * The sprite comes from the shared `BuildingSpritePreview`, so the codex and
 * this editor never drift on how a texture is cut. What is authoring-only is
 * the footprint overlay: it doubles as a picker, which is the only practical way
 * to place `HumanDoor` / `UpgradeSignTile` without counting tiles by hand.
 */

import { useEffect, useState } from 'react'
import { Crop, Image as ImageIcon, MousePointerClick } from 'lucide-react'
import { AssetValidationRail, type AssetEntryDraft, type AssetIssue } from '@entities/asset-schema'
import {
  BuildingSpritePreview,
  getBuildingTexturePath,
  loadBuildingImageState,
  parseBuildingPoint,
  parseBuildingRectangle,
  type BuildingAssetPatchState,
  type BuildingTextureAssetState,
  type BuildingWorkspaceEntry,
} from '@entities/building'
import type { LocaleCode } from '@locales'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import {
  BuildingFootprintOverlay,
  isFootprintRectTarget,
  TILE_PIXELS,
  type FootprintPickTarget,
  type FootprintRect,
  type FootprintRectPickTarget,
  type FootprintTilePickTarget,
} from './BuildingFootprintOverlay'
import { BuildingSourceRectDialog } from './BuildingSourceRectDialog'
import type { BuildingChainStage } from '../state/useBuildingAuthoringSources'

const EMPTY_TEXTURE: BuildingTextureAssetState = { loading: false, path: null, url: null, width: null, height: null }

/** Loads the sheet the entry's `Texture` points at, from the game directory. */
function useBuildingTexture(
  building: BuildingWorkspaceEntry | null,
  gameRootPath: string | null,
  locale: LocaleCode,
): BuildingTextureAssetState {
  const [state, setState] = useState<BuildingTextureAssetState>(EMPTY_TEXTURE)
  const texturePath = getBuildingTexturePath(gameRootPath, building)

  useEffect(() => {
    if (!texturePath) {
      setState(EMPTY_TEXTURE)
      return
    }

    let cancelled = false
    setState({ ...EMPTY_TEXTURE, loading: true })

    void loadBuildingImageState(texturePath, locale)
      .then((image) => {
        if (!cancelled) {
          setState(image)
        }
      })
      .catch(() => {
        if (!cancelled) {
          // The texture may only exist as a Load patch the project ships; the
          // texture card below says so, so the preview just stays empty.
          setState(EMPTY_TEXTURE)
        }
      })

    return () => {
      cancelled = true
    }
  }, [texturePath, locale])

  return state
}

/** Footprint-relative rectangles from `AdditionalPlacementTiles`. */
function readAdditionalTiles(raw: unknown): FootprintRect[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((item) => parseBuildingRectangle(typeof item === 'object' && item !== null ? (item as Record<string, unknown>)['TileArea'] : null))
    .filter((rect): rect is FootprintRect => rect !== null && rect.Width > 0 && rect.Height > 0)
}

function SummaryCard({ draft }: { draft: AssetEntryDraft }) {
  const copy = useBuildingDataEditorCopy()
  const fields = draft.fields
  const size = parseBuildingPoint(fields['Size'])
  const builder = typeof fields['Builder'] === 'string' && fields['Builder'].trim() ? fields['Builder'].trim() : null
  const cost = typeof fields['BuildCost'] === 'number' ? fields['BuildCost'] : null
  const days = typeof fields['BuildDays'] === 'number' ? fields['BuildDays'] : null
  const indoorMap = typeof fields['IndoorMap'] === 'string' && fields['IndoorMap'].trim() ? fields['IndoorMap'].trim() : null
  const nonInstanced =
    typeof fields['NonInstancedIndoorLocation'] === 'string' && fields['NonInstancedIndoorLocation'].trim()
      ? fields['NonInstancedIndoorLocation'].trim()
      : null
  const skinCount = Array.isArray(fields['Skins']) ? fields['Skins'].length : 0

  const chips: Array<{ label: string; value: string | null }> = [
    { label: copy.summary.footprint, value: size === null ? null : copy.summary.footprintValue(size.X, size.Y) },
    { label: copy.summary.builder, value: builder },
    { label: copy.summary.buildCost, value: cost === null ? null : copy.summary.goldValue(cost) },
    { label: copy.summary.buildDays, value: days === null ? null : copy.summary.dayValue(days) },
    { label: copy.summary.interior, value: indoorMap ?? nonInstanced },
    { label: copy.summary.skins, value: skinCount === 0 ? null : copy.summary.skinValue(skinCount) },
  ]

  return (
    <section className="asset-editor-card">
      <div className="asset-editor-card-title">{copy.summary.title}</div>
      <dl className="asset-editor-summary-list">
        {chips.map((chip) => (
          <div key={chip.label} className="asset-editor-summary-chip">
            <dt>{chip.label}</dt>
            <dd className={chip.value === null ? 'is-unset' : undefined}>{chip.value ?? copy.summary.notSet}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/**
 * The upgrade chain the entry sits in, in build order.
 *
 * `BuildingToUpgrade` is a single backwards link, so a chain is only visible once
 * every link is followed — which is exactly what an author cannot do while
 * staring at one text field. Showing the resolved order here, and letting a click
 * jump to a stage, is what makes the chain editable rather than guessable.
 */
function UpgradeChainCard({ stages, onSelectStage }: { stages: readonly BuildingChainStage[]; onSelectStage: (key: string) => void }) {
  const copy = useBuildingDataEditorCopy()

  if (stages.length < 2) {
    return null
  }

  return (
    <section className="asset-editor-card">
      <div className="asset-editor-card-title">{copy.chain.title}</div>
      <ol className="building-chain-strip">
        {stages.map((stage, index) => (
          <li key={stage.key} className="building-chain-stage">
            <button
              type="button"
              className={cx('building-chain-button', stage.isActive && 'is-active')}
              aria-current={stage.isActive ? 'true' : undefined}
              onClick={() => onSelectStage(stage.key)}
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
      <p className="asset-editor-asset-hint">{copy.chain.hint}</p>
    </section>
  )
}

function TextureCard({ state, onOpenEditor }: { state: BuildingAssetPatchState | null; onOpenEditor: () => void }) {
  const copy = useBuildingDataEditorCopy()

  return (
    <section className="asset-editor-card">
      <div className="asset-editor-card-title">
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        <span>{copy.texture.title}</span>
      </div>
      {state === null || state.assetTarget === '' ? (
        <p className="asset-editor-asset-hint">{copy.texture.noAsset}</p>
      ) : (
        <>
          <div className="asset-editor-asset-row">
            <span className="asset-editor-asset-file-label">{copy.texture.assetLabel}</span>
            <span className={state.patchFound ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
              {state.patchFound ? copy.texture.patchFound : copy.texture.patchMissing}
            </span>
          </div>
          <div className="asset-editor-asset-target">{state.assetTarget}</div>
          {state.fromFile !== null ? (
            <div className="asset-editor-asset-file">
              <span className="asset-editor-asset-file-value">{state.fromFile}</span>
              <span className={state.fileInDraft ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
                {state.fileInDraft ? copy.texture.patchFound : copy.texture.patchMissing}
              </span>
            </div>
          ) : null}
          <p className="asset-editor-asset-hint">{copy.texture.manageHint}</p>
          <button type="button" className="control-button mt-2" onClick={onOpenEditor}>
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copy.texture.openEditorAction}</span>
          </button>
        </>
      )}
    </section>
  )
}

export function BuildingPreviewPane({
  building,
  draft,
  issues,
  texturePatchState,
  chainStages,
  gameRootPath,
  locale,
  onPickTile,
  onPickRect,
  onApplySourceRect,
  onSelectStage,
  onOpenTextureEditor,
  onSelectIssue,
}: {
  building: BuildingWorkspaceEntry | null
  draft: AssetEntryDraft | null
  issues: AssetIssue[]
  texturePatchState: BuildingAssetPatchState | null
  /** Upgrade chain the active entry belongs to, in build order. */
  chainStages: readonly BuildingChainStage[]
  gameRootPath: string | null
  locale: LocaleCode
  onPickTile: (target: FootprintTilePickTarget, tile: { X: number; Y: number }) => void
  onPickRect: (target: FootprintRectPickTarget, rect: FootprintRect) => void
  onApplySourceRect: (rect: FootprintRect) => void
  onSelectStage: (key: string) => void
  onOpenTextureEditor: () => void
  onSelectIssue: (issue: AssetIssue) => void
}) {
  const copy = useBuildingDataEditorCopy()
  const [pickTarget, setPickTarget] = useState<FootprintPickTarget | null>(null)
  const [sourceRectOpen, setSourceRectOpen] = useState(false)
  const textureState = useBuildingTexture(building, gameRootPath, locale)

  const fields = draft?.fields ?? {}
  const size = parseBuildingPoint(fields['Size'])
  const humanDoor = parseBuildingPoint(fields['HumanDoor'])
  const upgradeSign = parseBuildingPoint(fields['UpgradeSignTile'])
  const animalDoor = parseBuildingRectangle(fields['AnimalDoor'])
  const sourceRect = parseBuildingRectangle(fields['SourceRect'])
  const additionalTiles = readAdditionalTiles(fields['AdditionalPlacementTiles'])
  const hasFootprint = size !== null && size.X > 0 && size.Y > 0
  const canPickSourceRect = draft !== null && textureState.url !== null && textureState.width !== null && textureState.height !== null

  const pickButtons: Array<{ id: FootprintPickTarget; label: string }> = [
    { id: 'HumanDoor', label: copy.preview.pickHumanDoor },
    { id: 'AnimalDoor', label: copy.preview.pickAnimalDoor },
    { id: 'UpgradeSignTile', label: copy.preview.pickUpgradeSign },
  ]
  const activePickLabel = pickButtons.find((button) => button.id === pickTarget)?.label ?? null

  return (
    <aside className="asset-preview-pane">
      {building === null ? (
        <div className="asset-editor-card">
          <p className="asset-field-hint">{copy.preview.empty}</p>
        </div>
      ) : (
        <section className="asset-editor-card">
          <div className="asset-preview-head">
            <span className="asset-editor-card-title">{copy.preview.title}</span>
            {hasFootprint ? <span className="asset-editor-badge is-ok">{copy.summary.footprintValue(size.X, size.Y)}</span> : null}
          </div>

          <div className="building-preview-stage">
            <BuildingSpritePreview
              building={building}
              textureState={textureState}
              fillContainer
              // A building being authored usually has no texture patch yet; the
              // footprint frame keeps the grid and its picker usable until then.
              overlayFallbackSource={hasFootprint ? { width: size.X * TILE_PIXELS, height: size.Y * TILE_PIXELS } : null}
              renderOverlay={(geometry) => (
                <BuildingFootprintOverlay
                  geometry={geometry}
                  size={size}
                  humanDoor={humanDoor}
                  upgradeSign={upgradeSign}
                  animalDoor={animalDoor}
                  additionalTiles={additionalTiles}
                  pickTarget={pickTarget}
                  onPickTile={(target, tile) => {
                    onPickTile(target, tile)
                    setPickTarget(null)
                  }}
                  onPickRect={(target, rect) => {
                    onPickRect(target, rect)
                    setPickTarget(null)
                  }}
                />
              )}
            />
          </div>

          <div className="building-preview-toolbar">
            <button type="button" className="control-button" onClick={() => setSourceRectOpen(true)} disabled={!canPickSourceRect}>
              <Crop className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copy.preview.pickSourceRectAction}</span>
            </button>
            <span className="building-preview-source-rect-value">
              {sourceRect === null
                ? copy.sourceRect.noRegion
                : copy.sourceRect.regionValue(sourceRect.X, sourceRect.Y, sourceRect.Width, sourceRect.Height)}
            </span>
          </div>

          {hasFootprint ? (
            <>
              <div className="building-preview-toolbar">
                <MousePointerClick className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.preview.pickIdle}</span>
                {pickButtons.map((button) => (
                  <button
                    key={button.id}
                    type="button"
                    aria-pressed={button.id === pickTarget}
                    className={cx('building-preview-pick-button', button.id === pickTarget && 'is-active')}
                    onClick={() => setPickTarget((current) => (current === button.id ? null : button.id))}
                    disabled={draft === null}
                  >
                    {button.label}
                  </button>
                ))}
                {pickTarget !== null ? (
                  <button type="button" className="building-preview-pick-button" onClick={() => setPickTarget(null)}>
                    {copy.preview.pickCancelAction}
                  </button>
                ) : null}
              </div>
              <p className="asset-editor-asset-hint">
                {activePickLabel === null
                  ? copy.preview.footprintHint
                  : pickTarget !== null && isFootprintRectTarget(pickTarget)
                    ? copy.preview.pickRectActiveHint(activePickLabel)
                    : copy.preview.pickActiveHint(activePickLabel)}
              </p>
              <ul className="building-preview-legend" aria-label={copy.preview.footprintTitle}>
                {[
                  { id: 'footprint', className: 'is-footprint', label: copy.preview.legendFootprint },
                  { id: 'human-door', className: 'is-human-door', label: copy.preview.legendHumanDoor },
                  { id: 'animal-door', className: 'is-animal-door', label: copy.preview.legendAnimalDoor },
                  { id: 'upgrade-sign', className: 'is-upgrade-sign', label: copy.preview.legendUpgradeSign },
                  { id: 'additional', className: 'is-additional', label: copy.preview.legendAdditionalTile },
                ].map((item) => (
                  <li key={item.id} className={cx('building-preview-legend-item', item.className)}>
                    <span className="building-preview-legend-swatch" aria-hidden="true" />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="asset-editor-asset-hint">{copy.preview.noFootprint}</p>
          )}
        </section>
      )}

      {draft !== null ? <SummaryCard draft={draft} /> : null}
      <UpgradeChainCard stages={chainStages} onSelectStage={onSelectStage} />
      {building !== null ? <TextureCard state={texturePatchState} onOpenEditor={onOpenTextureEditor} /> : null}

      <AssetValidationRail issues={issues} onSelectIssue={onSelectIssue} />

      <BuildingSourceRectDialog
        open={sourceRectOpen}
        textureUrl={textureState.url}
        textureWidth={textureState.width}
        textureHeight={textureState.height}
        value={sourceRect}
        size={size}
        onClose={() => setSourceRectOpen(false)}
        onApply={(rect) => {
          onApplySourceRect(rect)
          setSourceRectOpen(false)
        }}
      />
    </aside>
  )
}
