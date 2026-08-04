import { useEffect, useMemo, useState } from 'react'
import { FileJson, Loader2, Search } from 'lucide-react'
import { scanEvents, type EventAssetSummary } from '@entities/game/api'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

export type EventPatchCreateDialogProps = {
  open: boolean
  /** Game root used to scan vanilla event files; null skips the scan and leaves only the custom target input. */
  gameRootPath: string | null
  /** CP targets already edited by a draft patch, normalized to lowercase forward-slash form. */
  existingTargets: string[]
  onClose: () => void
  /**
   * `importSource` is the scanned vanilla asset when the author asked to parse
   * its events into the fresh draft; null for custom targets and plain creates.
   */
  onConfirm: (target: string, importSource: EventAssetSummary | null) => void | Promise<void>
}

function normalizeTargetInput(value: string) {
  return value.trim().replaceAll('\\', '/')
}

function isValidEventTarget(value: string) {
  return /^data\/events\/.+/i.test(value)
}

/**
 * Creates an `EditData` event patch from a scanned vanilla event file
 * (`Data/Events/<location>`) or a hand-typed custom target. Targets already
 * covered by the draft stay selectable — confirming one simply re-selects the
 * existing patch, since patch creation dedupes by target.
 */
export function EventPatchCreateDialog({ open, gameRootPath, existingTargets, onClose, onConfirm }: EventPatchCreateDialogProps) {
  const desk = useEditorCopy().studioDesk
  const dialogCopy = desk.addPatchDialog
  const copy = desk.eventPatchHub.createPatch
  const importCopy = desk.eventPatchHub.importVanilla
  const [query, setQuery] = useState('')
  const [assets, setAssets] = useState<EventAssetSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [scanFailed, setScanFailed] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<EventAssetSummary | null>(null)
  const [customTarget, setCustomTarget] = useState('')
  const [importVanilla, setImportVanilla] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedTarget(null)
      setSelectedAsset(null)
      setCustomTarget('')
      setImportVanilla(false)
      setBusy(false)
      return
    }
    if (!gameRootPath) {
      setAssets([])
      setLoading(false)
      setScanFailed(false)
      return
    }
    let active = true
    setLoading(true)
    setScanFailed(false)
    void scanEvents(gameRootPath).then(
      (scanned) => {
        if (active) {
          setAssets(scanned)
          setLoading(false)
        }
      },
      () => {
        if (active) {
          setAssets([])
          setScanFailed(true)
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [gameRootPath, open])

  const existing = useMemo(() => new Set(existingTargets), [existingTargets])
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return assets
      .map((asset) => ({ asset, target: `Data/Events/${asset.name}` }))
      .filter((row) => !normalized || row.asset.name.toLowerCase().includes(normalized) || row.target.toLowerCase().includes(normalized))
  }, [assets, query])

  const normalizedCustom = normalizeTargetInput(customTarget)
  const customValid = normalizedCustom.length > 0 && isValidEventTarget(normalizedCustom)
  const effectiveTarget = customValid ? normalizedCustom : selectedTarget
  const selectedAlreadyAdded = selectedTarget !== null && existing.has(selectedTarget.toLowerCase())
  const canOfferImport = selectedAsset !== null && !selectedAlreadyAdded

  async function handleConfirm() {
    if (!effectiveTarget || busy) {
      return
    }
    const importSource = canOfferImport && importVanilla ? selectedAsset : null
    setBusy(true)
    try {
      await onConfirm(effectiveTarget, importSource)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy="event-patch-create-title">
      <DialogHeader id="event-patch-create-title" title={copy.action} onClose={onClose} closeLabel={dialogCopy.closeLabel} />
      <DialogBody>
        <div className="event-patch-create">
          <label className="event-patch-create-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{dialogCopy.filterPlaceholder}</span>
            <input
              type="search"
              value={query}
              placeholder={dialogCopy.filterPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="event-patch-create-section" role="group" aria-label={dialogCopy.selectTargetTitle}>
            {loading ? (
              <p className="event-patch-create-state" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {copy.loading}
              </p>
            ) : scanFailed ? (
              <p className="event-patch-create-state is-error" role="alert">
                {copy.loadError}
              </p>
            ) : rows.length === 0 ? (
              <p className="event-patch-create-state">{dialogCopy.noSuggestedTargets}</p>
            ) : (
              <div className="event-patch-create-list">
                {rows.map((row) => {
                  const added = existing.has(row.target.toLowerCase())
                  return (
                    <button
                      key={row.asset.id}
                      type="button"
                      className={cx('event-patch-create-row', row.target === selectedTarget && 'active')}
                      onClick={() => {
                        setSelectedTarget(row.target)
                        setSelectedAsset(row.asset)
                        setCustomTarget('')
                      }}
                    >
                      <FileJson className="h-4 w-4" aria-hidden="true" />
                      <span className="event-patch-create-row-copy">
                        <strong>{row.asset.name}</strong>
                        <span>{row.target}</span>
                      </span>
                      {added ? <span className="event-patch-create-badge">{copy.alreadyAdded}</span> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <label className="event-patch-create-custom">
            <span>{dialogCopy.customTarget}</span>
            <input
              className="control-input"
              value={customTarget}
              placeholder={dialogCopy.customTargetPlaceholder}
              spellCheck={false}
              onChange={(event) => {
                setCustomTarget(event.target.value)
                setSelectedTarget(null)
                setSelectedAsset(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleConfirm()
                }
              }}
            />
            {normalizedCustom.length > 0 && !customValid ? <span className="event-patch-create-hint">{copy.invalidTarget}</span> : null}
          </label>

          {canOfferImport ? (
            <label className="event-patch-create-import">
              <input type="checkbox" checked={importVanilla} disabled={busy} onChange={(event) => setImportVanilla(event.target.checked)} />
              <span>{importCopy.importAllLabel}</span>
            </label>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose} disabled={busy}>
          {dialogCopy.cancel}
        </DialogAction>
        <DialogAction tone="primary" disabled={!effectiveTarget || busy} onClick={() => void handleConfirm()}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {busy && importVanilla ? importCopy.loadingLabel : dialogCopy.addPatch}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
