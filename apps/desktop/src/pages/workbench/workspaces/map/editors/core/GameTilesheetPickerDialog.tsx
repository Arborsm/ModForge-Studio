import { useEffect, useMemo, useState } from 'react'
import { ImageOff, Loader2, Search } from 'lucide-react'
import { loadImageDataUrl, scanImageAssets, type GameImageAssetSummary } from '@entities/game/api'
import { useMapAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

export type GameTilesheetPickerDialogProps = {
  open: boolean
  /** Game root used to scan and decode vanilla tilesheets; null disables the scan. */
  gameRootPath: string | null
  locale: string
  /** Relative path of the tilesheet currently being copied; disables the grid while set. */
  busyAssetPath: string | null
  onClose: () => void
  onPick: (asset: GameImageAssetSummary) => void
}

/**
 * The game's dedicated map tilesheets live under `Content/TileSheets`; the
 * image scan skips `Content/Maps` and `Content/Data`, so filtering on the
 * `TileSheets/` asset key yields exactly the generic tilesheets usable on any
 * map. Map-specific sheets (e.g. `Maps/spring_outdoorsTileSheet`) come in with
 * the copy-a-game-map flow instead.
 */
function isGameTilesheet(asset: GameImageAssetSummary): boolean {
  return asset.name.toLowerCase().startsWith('tilesheets/')
}

function TilesheetCell({
  asset,
  locale,
  alt,
  busy,
  onPick,
}: {
  asset: GameImageAssetSummary
  locale: string
  alt: string
  busy: boolean
  onPick: (asset: GameImageAssetSummary) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setUrl(null)
    setFailed(false)
    void loadImageDataUrl(asset.absolutePath, locale).then(
      (dataUrl) => {
        if (active) setUrl(dataUrl)
      },
      () => {
        if (active) setFailed(true)
      },
    )
    return () => {
      active = false
    }
  }, [asset.absolutePath, locale])

  const fallbackName = (asset.name.split('/').at(-1) ?? asset.name).replace(/\.[^.]+$/u, '')
  return (
    <button
      type="button"
      className={cx('game-tilesheet-cell', (busy || url === null) && 'is-busy')}
      disabled={busy}
      title={asset.name}
      onClick={() => onPick(asset)}
    >
      <span className="game-tilesheet-cell-image">
        {url ? (
          <img src={url} alt={alt} draggable={false} />
        ) : (
          <span className={cx('game-tilesheet-cell-fallback', failed && 'is-failed')}>
            {failed ? (
              <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            )}
            <span>{fallbackName}</span>
          </span>
        )}
      </span>
      <span className="game-tilesheet-cell-name">{asset.name}</span>
    </button>
  )
}

/**
 * Thumbnail-grid picker for vanilla game tilesheets. Each cell loads its
 * decoded texture asynchronously and falls back to a name block while loading
 * or when decoding fails. The parent copies the chosen image into the project
 * and attaches it to the map; `busyAssetPath` keeps the grid locked meanwhile.
 */
export function GameTilesheetPickerDialog({ open, gameRootPath, locale, busyAssetPath, onClose, onPick }: GameTilesheetPickerDialogProps) {
  const copy = useMapAuthoringCopy().assetEditor
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<GameImageAssetSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    if (!gameRootPath) {
      setAssets([])
      setLoading(false)
      setError(null)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void scanImageAssets(gameRootPath).then(
      (scanned) => {
        if (active) {
          setAssets(scanned.filter(isGameTilesheet))
          setLoading(false)
        }
      },
      (reason) => {
        if (active) {
          setAssets([])
          setError(reason instanceof Error ? reason.message : String(reason))
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [gameRootPath, open])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return assets
    return assets.filter((asset) => asset.name.toLowerCase().includes(normalized))
  }, [assets, query])

  return (
    <Dialog open={open} onClose={onClose} size="lg" labelledBy="game-tilesheet-picker-title">
      <DialogHeader id="game-tilesheet-picker-title" title={copy.gameTilesetPickerTitle} onClose={onClose} closeLabel={copy.cancel} />
      <DialogBody>
        <div className="game-tilesheet-picker">
          <label className="game-tilesheet-picker-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{copy.gameTilesetPickerSearch}</span>
            <input
              type="search"
              value={query}
              placeholder={copy.gameTilesetPickerSearch}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {loading ? (
            <p className="game-tilesheet-picker-state" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {copy.gameTilesetPickerLoading}
            </p>
          ) : error ? (
            <p className="game-tilesheet-picker-state is-error" role="alert">
              {copy.gameTilesetPickerScanFailed}
            </p>
          ) : filtered.length === 0 ? (
            <p className="game-tilesheet-picker-state">{copy.gameTilesetPickerEmpty}</p>
          ) : (
            <div className="game-tilesheet-picker-grid">
              {filtered.map((asset) => (
                <TilesheetCell
                  key={asset.relativePath}
                  asset={asset}
                  locale={locale}
                  alt={copy.gameTilesetThumbnailAlt(asset.name)}
                  busy={busyAssetPath !== null}
                  onPick={onPick}
                />
              ))}
            </div>
          )}
          {busyAssetPath !== null ? (
            <p className="game-tilesheet-picker-adding" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {copy.gameTilesetAdding}
            </p>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancel}</DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
