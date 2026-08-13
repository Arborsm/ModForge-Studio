import { useEffect, useState } from 'react'
import type { MapDocument } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { CompactSelect } from '@shared/ui/CompactSelect'
import { Dialog, DialogBody, DialogFooter, DialogAction, DialogHeader } from '@shared/ui/Dialog'
import { WarpDestinationPointPicker } from '../../ui/WarpDestinationPointPicker'

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
  disabled?: boolean
}

/**
 * Modal used by the warp cards to pick a warp destination without hand-typed
 * coordinates: a target-map select (localized names from the map catalog) plus
 * a large click-to-pick preview of that map. When `carrierOptions` is given
 * the dialog also asks which carrier the entry should be written to (map
 * property, Back-layer TouchAction or Buildings-layer Action); the caller
 * decides how to write it from the reported carrier.
 */
export function WarpDialog({
  open,
  initialMap,
  initialX,
  initialY,
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
  /** Current target map (a CP target or relative path); empty for a new warp. */
  initialMap: string
  initialX: number
  initialY: number
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
  onConfirm: (carrier: WarpCarrier, toMap: string, toX: number, toY: number) => void
}) {
  const copy = useMapAuthoringCopy().assetEditor.mapCards
  const [targetMap, setTargetMap] = useState(initialMap)
  const [landing, setLanding] = useState<{ x: number; y: number }>({ x: initialX, y: initialY })
  const [landingKey, setLandingKey] = useState(`${initialMap}\u0000${initialX},${initialY}`)

  // Each dialog open restarts from the entry's current values; switching the
  // target map also re-mounts the preview (fresh picked cell) for that map.
  useEffect(() => {
    if (!open) return
    setTargetMap(initialMap)
    setLanding({ x: initialX, y: initialY })
  }, [open, initialMap, initialX, initialY])

  useEffect(() => {
    if (!open) return
    setLandingKey(`${targetMap}\u0000`)
  }, [open, targetMap])

  const canConfirm = targetMap.trim() !== ''

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy="map-warp-dialog-title">
      <DialogHeader id="map-warp-dialog-title" title={copy.warpDialogTitle} onClose={onClose} closeLabel={copy.warpDialogClose} />
      <DialogBody>
        <div className="map-warp-dialog">
          {carrierOptions && carrierOptions.length > 0 ? (
            <label className="map-warp-dialog-field">
              <span>{copy.warpCarrierLabel}</span>
              <CompactSelect
                value={carrier}
                options={carrierOptions}
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
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.warpDialogCancel}</DialogAction>
        <DialogAction tone="primary" disabled={!canConfirm} onClick={() => onConfirm(carrier, targetMap.trim(), landing.x, landing.y)}>
          {copy.warpDialogConfirm}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
