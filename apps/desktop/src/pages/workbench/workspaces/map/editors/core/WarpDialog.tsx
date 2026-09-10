import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import { gidAtCell, type MapDocument } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogBody, DialogFooter, DialogAction, DialogHeader } from '@shared/ui/Dialog'
import { WarpDestinationPointPicker } from '../../ui/WarpDestinationPointPicker'
import { CurrentMapCellPicker } from '../../ui/CurrentMapCellPicker'

export type WarpDialogMapOption = {
  value: string
  label: string
  description?: string
}

/** Where a warp entry is written: the map property or one of the per-cell carriers. */
export type WarpCarrier = 'property' | 'touch' | 'action'

export type WarpCarrierOption = {
  value: WarpCarrier
  label: string
  /** Optional trigger-condition hint shown beneath the option label in the dropdown. */
  description?: string
  disabled?: boolean
}

/** Layer each per-cell carrier attaches its warp to. */
const CARRIER_LAYERS: Record<Exclude<WarpCarrier, 'property'>, string> = {
  touch: 'Back',
  action: 'Buildings',
}

/**
 * Studio dialog for one warp entry, following the day/night studio layout: the
 * left map picker chooses the origin cell (existing warp origins are
 * highlighted), the right panel asks for the carrier (while adding), the
 * target map and the landing cell. The caller owns the property/cell writes
 * and receives the picked origin plus the destination draft through
 * `onConfirm`.
 */
export function WarpDialog({
  open,
  document,
  renderDocument,
  initialMap,
  initialX,
  initialY,
  initialOrigin,
  originRects,
  gameRootPath = null,
  carrier = 'property',
  carrierOptions,
  onCarrierChange,
  mapOptions,
  locale,
  theme,
  accentColor,
  loadTargetDocument,
  onClose,
  onConfirm,
}: {
  open: boolean
  /** Data document validating the origin cell against the carrier layer tiles. */
  document: MapDocument
  /** Render document feeding the left map picker (tileset image paths loadable as data URLs). */
  renderDocument: MapDocument
  /** Current target map (a CP target or relative path); empty for a new warp. */
  initialMap: string
  initialX: number
  initialY: number
  /** Origin preselected when the dialog opens; null starts with no origin picked. */
  initialOrigin: { x: number; y: number } | null
  /** Existing warp origin rectangles framed as picker highlights; the edited entry is excluded by the caller. */
  originRects: readonly { x: number; y: number; width: number; height: number }[]
  /** Game root used to resolve dynamically referenced vanilla sheets in the origin picker; null leaves them blank. */
  gameRootPath?: string | null
  /** Carrier the confirm should write to (hidden while editing an existing entry). */
  carrier?: WarpCarrier
  /** Carrier choices shown when adding; an empty list hides the selector. */
  carrierOptions?: readonly WarpCarrierOption[]
  onCarrierChange?: (carrier: WarpCarrier) => void
  /** Localized target-map choices for the select. */
  mapOptions: readonly WarpDialogMapOption[]
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  loadTargetDocument: (target: string) => Promise<MapDocument>
  onClose: () => void
  onConfirm: (carrier: WarpCarrier, origin: { x: number; y: number }, toMap: string, toX: number, toY: number) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(initialOrigin)
  const [targetMap, setTargetMap] = useState(initialMap)
  const [landing, setLanding] = useState<{ x: number; y: number }>({ x: initialX, y: initialY })
  const [landingKey, setLandingKey] = useState(`${initialMap}\u0000${initialX},${initialY}`)
  // Primitive snapshots keep the open-effect free of object-identity churn:
  // callers pass fresh object literals on every parent render.
  const initialOriginX = initialOrigin?.x ?? null
  const initialOriginY = initialOrigin?.y ?? null

  // Each dialog open restarts from the entry's current values; switching the
  // target map also re-mounts the preview (fresh picked cell) for that map.
  useEffect(() => {
    if (!open) return
    setOrigin(initialOriginX != null ? { x: initialOriginX, y: initialOriginY ?? 0 } : null)
    setTargetMap(initialMap)
    setLanding({ x: initialX, y: initialY })
  }, [open, initialMap, initialX, initialY, initialOriginX, initialOriginY])

  useEffect(() => {
    if (!open) return
    setLandingKey(`${targetMap}\u0000`)
  }, [open, targetMap])

  const canConfirm = origin != null && targetMap.trim() !== ''

  // Per-cell carriers need an origin cell that holds a tile on the target
  // layer (TMX rules attach to placed tiles only) and a layer that exists.
  function carrierOriginReady(layerName: string) {
    if (!origin) return false
    if (!document.layers.some((layer) => layer.name === layerName)) return false
    return gidAtCell(document, layerName, origin.x, origin.y) !== 0
  }

  const carrierOptionsWithOrigin: readonly WarpCarrierOption[] = (carrierOptions ?? []).map((option) => {
    const layerName = option.value === 'property' ? null : CARRIER_LAYERS[option.value]
    if (!layerName || carrierOriginReady(layerName)) return option
    const missingReason =
      origin == null
        ? copy.warpCarrierOriginDisabledHint
        : layerName === 'Back'
          ? copy.warpCarrierTouchDisabledHint
          : copy.warpCarrierActionDisabledHint
    return { ...option, label: `${option.label}${missingReason}`, disabled: true }
  })

  return (
    <Dialog open={open} onClose={onClose} size="xl" labelledBy="map-warp-dialog-title">
      <DialogHeader id="map-warp-dialog-title" title={copy.warpDialogTitle} onClose={onClose} closeLabel={copy.warpDialogClose} />
      <DialogBody>
        <div className="map-asset-studio">
          <div className="map-asset-studio-map">
            <CurrentMapCellPicker
              document={renderDocument}
              locale={locale}
              theme={theme}
              accentColor={accentColor}
              onPick={(tileX, tileY) => setOrigin({ x: tileX, y: tileY })}
              selectedCell={origin}
              highlightRects={originRects}
              gameRootPath={gameRootPath}
            />
          </div>
          <div className="map-asset-studio-panel">
            <p className="map-warp-dialog-empty">{copy.warpOriginPickHint}</p>
            {carrierOptions && carrierOptions.length > 0 ? (
              <label className="map-warp-dialog-field">
                <span className="map-concept-info-anchor">
                  {copy.warpCarrierLabel}
                  <Info className="map-concept-info-icon" aria-hidden="true" />
                  <span className="map-concept-info-tooltip" role="tooltip">
                    {copy.warpCarrierConceptHint}
                  </span>
                </span>
                <CompactSelect
                  value={carrier}
                  options={carrierOptionsWithOrigin}
                  onChange={(value) => onCarrierChange?.(value)}
                  ariaLabel={copy.warpCarrierLabel}
                  placeholder={copy.warpCarrierLabel}
                  placement="bottom-start"
                  menuClassName="compact-select__menu--in-dialog"
                />
              </label>
            ) : null}
            <label className="map-warp-dialog-field">
              <span>{copy.warpDialogMapLabel}</span>
              <CompactSelect
                value={targetMap}
                options={mapOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  description: option.description,
                }))}
                onChange={(value) => setTargetMap(value)}
                ariaLabel={copy.warpDialogMapLabel}
                placeholder={copy.warpDialogMapPlaceholder}
                placement="bottom-start"
                menuClassName="compact-select__menu--in-dialog"
              />
            </label>
            <label className="map-warp-dialog-field">
              <span>{copy.warpDialogPointLabel}</span>
              {targetMap.trim() ? (
                <WarpDestinationPointPicker
                  key={landingKey}
                  target={targetMap}
                  locale={locale}
                  theme={theme}
                  accentColor={accentColor}
                  loadTargetDocument={loadTargetDocument}
                  onPick={(x, y) => setLanding({ x, y })}
                />
              ) : (
                <p className="map-warp-dialog-empty">{copy.warpDialogPointHint}</p>
              )}
            </label>
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.warpDialogCancel}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={!canConfirm}
          onClick={() => {
            if (!origin) return
            onConfirm(carrier, origin, targetMap.trim(), landing.x, landing.y)
          }}
        >
          {copy.warpDialogConfirm}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
