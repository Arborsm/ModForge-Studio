import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { loadMapAsset, type MapAssetSummary } from '@entities/game/api'
import { MapViewport, type MapDocument, type MapTileRect } from '@entities/map'
import type { LocaleCode, ThemeMode } from '@locales/api'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type MapLoadState =
  | { status: 'idle'; document: null; error: null }
  | { status: 'loading'; document: null; error: null }
  | { status: 'ready'; document: MapDocument; error: null }
  | { status: 'error'; document: null; error: string }

export type BuildingFootprintMapDialogProps = {
  open: boolean
  gameRootPath: string | null
  farmAsset: MapAssetSummary | null
  locale: LocaleCode
  theme: ThemeMode
  accentColor: string
  currentSize: { width: number; height: number } | null
  onClose: () => void
  onApply: (size: { width: number; height: number }) => void
}

/** Real-farm-map picker for the `Data/Buildings.Size` footprint. */
export function BuildingFootprintMapDialog({
  open,
  gameRootPath,
  farmAsset,
  locale,
  theme,
  accentColor,
  currentSize,
  onClose,
  onApply,
}: BuildingFootprintMapDialogProps) {
  const copy = useBuildingDataEditorCopy().footprintMap
  const [retryToken, setRetryToken] = useState(0)
  const [selection, setSelection] = useState<MapTileRect | null>(null)
  const [loadState, setLoadState] = useState<MapLoadState>({ status: 'idle', document: null, error: null })

  useEffect(() => {
    if (open) {
      setSelection(null)
    }
  }, [open])

  useEffect(() => {
    if (!open || !gameRootPath || !farmAsset) {
      setLoadState({ status: 'idle', document: null, error: null })
      return
    }

    let cancelled = false
    setLoadState({ status: 'loading', document: null, error: null })
    void loadMapAsset(gameRootPath, farmAsset.absolutePath, locale)
      .then((asset) => {
        if (cancelled) return
        if (asset.format === 'tmx') {
          throw new Error(`Unsupported map format: ${asset.format}`)
        }
        setLoadState({ status: 'ready', document: JSON.parse(asset.content) as MapDocument, error: null })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadState({ status: 'error', document: null, error: error instanceof Error ? error.message : String(error) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [farmAsset, gameRootPath, locale, open, retryToken])

  const visibleLayerIds = useMemo(
    () => loadState.document?.layers.filter((layer) => layer.visible).map((layer) => layer.id) ?? [],
    [loadState],
  )
  const visibleObjectGroupIds = useMemo(
    () => loadState.document?.objectGroups.filter((group) => group.visible).map((group) => group.id) ?? [],
    [loadState],
  )

  return (
    <Dialog open={open} onClose={onClose} ariaLabel={copy.title} size="xl" stack>
      <DialogHeader title={copy.title} subtitle={copy.subtitle} onClose={onClose} closeLabel={copy.cancelAction} />
      <DialogBody className="building-footprint-map-body">
        <div className="building-footprint-map-stage">
          {!gameRootPath || !farmAsset ? (
            <div className="building-map-picker-status">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              <span>{copy.unavailable}</span>
            </div>
          ) : loadState.status === 'loading' ? (
            <div className="building-map-picker-status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <span>{copy.loading}</span>
            </div>
          ) : loadState.status === 'error' ? (
            <div className="building-map-picker-status is-error">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              <span>{copy.loadFailed(loadState.error)}</span>
              <button type="button" className="control-button" onClick={() => setRetryToken((value) => value + 1)}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.retryAction}</span>
              </button>
            </div>
          ) : loadState.status === 'ready' ? (
            <MapViewport
              locale={locale}
              mapDocument={loadState.document}
              visibleLayerIds={visibleLayerIds}
              visibleObjectGroupIds={visibleObjectGroupIds}
              theme={theme}
              accentColor={accentColor}
              showGrid
              showStatsChips={false}
              contextMenuEnabled={false}
              selectedTileRect={selection}
              onTileRectSelect={setSelection}
            />
          ) : null}
        </div>
        <div className="building-footprint-map-summary">
          <span>{copy.currentLabel}</span>
          <strong>{currentSize ? copy.sizeValue(currentSize.width, currentSize.height) : copy.emptySelection}</strong>
          <span>{copy.selectedLabel}</span>
          <strong>{selection ? copy.sizeValue(selection.width, selection.height) : copy.emptySelection}</strong>
          <p>{copy.hint}</p>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancelAction}</DialogAction>
        <DialogAction
          tone="primary"
          disabled={selection === null}
          onClick={() => selection && onApply({ width: selection.width, height: selection.height })}
        >
          {copy.applyAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
