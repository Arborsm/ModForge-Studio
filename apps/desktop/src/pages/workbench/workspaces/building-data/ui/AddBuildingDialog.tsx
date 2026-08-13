/**
 * Create dialog for a new `Data/Buildings` entry.
 *
 * The footprint is collected up front rather than left to the form: a building
 * without a positive `Size` cannot be placed at all, and the game reports that
 * as a silently missing build-menu row instead of an error.
 */

import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { BUILDER_SUGGESTIONS, BUILDING_ID_TOKEN_PREFIX, validateBuildingFootprint, type BuildingFootprint } from '@entities/building'
import { useBuildingDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type AddBuildingError = 'empty' | 'duplicate' | 'sizeNotPositive'

const DEFAULT_FOOTPRINT: BuildingFootprint = { tilesWide: 3, tilesHigh: 3, builder: 'Robin' }

function parseTiles(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

export function AddBuildingDialog({
  open,
  existingIds,
  projectUniqueId,
  onClose,
  onCreate,
}: {
  open: boolean
  existingIds: readonly string[]
  projectUniqueId: string
  onClose: () => void
  onCreate: (buildingId: string, footprint: BuildingFootprint) => void
}) {
  const copy = useBuildingDataEditorCopy()
  const titleId = useId()
  const builderListId = useId()
  const [buildingId, setBuildingId] = useState('')
  const [footprint, setFootprint] = useState<BuildingFootprint>(DEFAULT_FOOTPRINT)
  const [sizeText, setSizeText] = useState({ width: '3', height: '3' })
  const [error, setError] = useState<AddBuildingError | null>(null)

  useEffect(() => {
    if (open) {
      setBuildingId('')
      setFootprint(DEFAULT_FOOTPRINT)
      setSizeText({ width: '3', height: '3' })
      setError(null)
    }
  }, [open])

  const errorMessages: Record<AddBuildingError, string> = {
    empty: copy.addDialog.emptyError,
    duplicate: copy.addDialog.duplicateError,
    sizeNotPositive: copy.addDialog.sizeNotPositiveError,
  }

  function confirm() {
    const trimmed = buildingId.trim()
    if (!trimmed) {
      setError('empty')
      return
    }
    if (existingIds.some((id) => id.toLowerCase() === trimmed.toLowerCase())) {
      setError('duplicate')
      return
    }
    const footprintError = validateBuildingFootprint(footprint)
    if (footprintError !== null) {
      setError(footprintError)
      return
    }
    onCreate(trimmed, footprint)
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        id={titleId}
        title={copy.addDialog.title}
        subtitle={copy.addDialog.subtitle}
        onClose={onClose}
        closeLabel={copy.addDialog.closeLabel}
      />
      <DialogBody>
        <div className="asset-editor-add-form">
          <label className="asset-field">
            <span className="asset-field-label">{copy.addDialog.idLabel}</span>
            <input
              type="text"
              className="control-input"
              value={buildingId}
              placeholder={copy.addDialog.idPlaceholder}
              data-autofocus
              onChange={(event) => {
                setBuildingId(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirm()
                }
              }}
            />
            <span className="asset-field-hint">{copy.addDialog.idHint}</span>
          </label>
          <button
            type="button"
            className="control-button asset-editor-prefix-button"
            disabled={buildingId.trim().startsWith(BUILDING_ID_TOKEN_PREFIX)}
            onClick={() =>
              setBuildingId((current) =>
                current.trim().startsWith(BUILDING_ID_TOKEN_PREFIX) ? current : `${BUILDING_ID_TOKEN_PREFIX}${current.trim()}`,
              )
            }
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{copy.addDialog.prefixAction}</span>
          </button>
          <p className="asset-field-hint">{copy.addDialog.prefixHint(projectUniqueId)}</p>

          <div className="asset-editor-add-section">
            <span className="asset-field-label">{copy.addDialog.footprintSectionTitle}</span>
            <p className="asset-field-hint">{copy.addDialog.footprintSectionHint}</p>
            <div className="asset-editor-add-grid">
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.widthLabel}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="control-input"
                  value={sizeText.width}
                  onChange={(event) => {
                    setSizeText((current) => ({ ...current, width: event.target.value }))
                    setFootprint((current) => ({ ...current, tilesWide: parseTiles(event.target.value) }))
                    setError(null)
                  }}
                />
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.heightLabel}</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  className="control-input"
                  value={sizeText.height}
                  onChange={(event) => {
                    setSizeText((current) => ({ ...current, height: event.target.value }))
                    setFootprint((current) => ({ ...current, tilesHigh: parseTiles(event.target.value) }))
                    setError(null)
                  }}
                />
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.builderLabel}</span>
                <input
                  type="text"
                  className="control-input"
                  list={builderListId}
                  value={footprint.builder}
                  onChange={(event) => setFootprint((current) => ({ ...current, builder: event.target.value }))}
                />
                <datalist id={builderListId}>
                  {BUILDER_SUGGESTIONS.map((builder) => (
                    <option key={builder} value={builder} />
                  ))}
                </datalist>
              </label>
            </div>
            <p className="asset-field-hint">{copy.addDialog.builderHint}</p>
          </div>

          {error ? <p className="asset-field-error">{errorMessages[error]}</p> : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.addDialog.cancelAction}</DialogAction>
        <DialogAction tone="primary" onClick={confirm}>
          {copy.addDialog.confirmAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
