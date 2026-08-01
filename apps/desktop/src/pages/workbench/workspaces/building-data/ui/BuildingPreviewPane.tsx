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
import type { AssetEntryDraft } from '@entities/asset-schema'
import type { MapAssetSummary } from '@entities/game/api'
import { BuildingSpritePreview, parseBuildingPoint, parseBuildingRectangle, type BuildingWorkspaceEntry } from '@entities/building'
import type { LocaleCode, ThemeMode } from '@locales'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import {
  BuildingFootprintOverlay,
  TILE_PIXELS,
  type FootprintPickTarget,
  type FootprintRect,
  type FootprintRectPickTarget,
  type FootprintTilePickTarget,
} from './BuildingFootprintOverlay'
import { BuildingSourceRectDialog } from './BuildingSourceRectDialog'
import { BuildingFootprintMapDialog } from './BuildingFootprintMapDialog'
import { useBuildingTexture } from '../state/useBuildingTexture'

export type BuildingAuthoringToolRequest = {
  id: number
  tool: 'footprint' | 'source-rect'
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

function SummaryStrip({ draft }: { draft: AssetEntryDraft }) {
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
    <dl className="asset-editor-summary-list building-preview-summary" aria-label={copy.summary.title}>
      {chips.map((chip) => (
        <div key={chip.label} className="asset-editor-summary-chip">
          <dt>{chip.label}</dt>
          <dd className={chip.value === null ? 'is-unset' : undefined}>{chip.value ?? copy.summary.notSet}</dd>
        </div>
      ))}
    </dl>
  )
}

export function BuildingPreviewPane({
  building,
  draft,
  gameRootPath,
  locale,
  theme,
  accentColor,
  farmAsset,
  pickTarget,
  onPickTile,
  onPickRect,
  onApplySourceRect,
  onApplyFootprint,
  toolRequest,
}: {
  building: BuildingWorkspaceEntry | null
  draft: AssetEntryDraft | null
  gameRootPath: string | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  farmAsset: MapAssetSummary | null
  pickTarget: FootprintPickTarget | null
  onPickTile: (target: FootprintTilePickTarget, tile: { X: number; Y: number }) => void
  onPickRect: (target: FootprintRectPickTarget, rect: FootprintRect) => void
  onApplySourceRect: (rect: FootprintRect) => void
  onApplyFootprint: (size: { width: number; height: number }) => void
  /** Opens a visual dialog requested by a tool inside the active centre tab. */
  toolRequest: BuildingAuthoringToolRequest | null
}) {
  const copy = useBuildingDataEditorCopy()
  const [sourceRectOpen, setSourceRectOpen] = useState(false)
  const [footprintMapOpen, setFootprintMapOpen] = useState(false)
  const textureState = useBuildingTexture(building, gameRootPath, locale)

  useEffect(() => {
    if (toolRequest?.tool === 'footprint') {
      setFootprintMapOpen(true)
    } else if (toolRequest?.tool === 'source-rect') {
      setSourceRectOpen(true)
    }
  }, [toolRequest])

  const fields = draft?.fields ?? {}
  const size = parseBuildingPoint(fields['Size'])
  const humanDoor = parseBuildingPoint(fields['HumanDoor'])
  const upgradeSign = parseBuildingPoint(fields['UpgradeSignTile'])
  const animalDoor = parseBuildingRectangle(fields['AnimalDoor'])
  const sourceRect = parseBuildingRectangle(fields['SourceRect'])
  const additionalTiles = readAdditionalTiles(fields['AdditionalPlacementTiles'])
  const hasFootprint = size !== null && size.X > 0 && size.Y > 0
  const activePickLabel =
    pickTarget === 'HumanDoor'
      ? copy.preview.pickHumanDoor
      : pickTarget === 'AnimalDoor'
        ? copy.preview.pickAnimalDoor
        : pickTarget === 'UpgradeSignTile'
          ? copy.preview.pickUpgradeSign
          : null

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
                  onPickTile={onPickTile}
                  onPickRect={onPickRect}
                />
              )}
            />
          </div>

          {hasFootprint ? (
            <>
              {activePickLabel !== null ? (
                <p className="building-preview-pick-status">
                  {pickTarget === 'AnimalDoor'
                    ? copy.preview.pickRectActiveHint(activePickLabel)
                    : copy.preview.pickActiveHint(activePickLabel)}
                </p>
              ) : null}
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

          {draft !== null ? <SummaryStrip draft={draft} /> : null}
        </section>
      )}

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
      <BuildingFootprintMapDialog
        open={footprintMapOpen}
        gameRootPath={gameRootPath}
        farmAsset={farmAsset}
        locale={locale}
        theme={theme}
        accentColor={accentColor}
        currentSize={size === null ? null : { width: size.X, height: size.Y }}
        onClose={() => setFootprintMapOpen(false)}
        onApply={(next) => {
          onApplyFootprint(next)
          setFootprintMapOpen(false)
        }}
      />
    </aside>
  )
}
