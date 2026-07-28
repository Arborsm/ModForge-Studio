/**
 * Create dialog for a new `Data/Characters` entry.
 *
 * The home placement is part of creation rather than a later edit: an entry
 * without a resolvable `Home` loads into the game at an undefined position, so
 * the dialog asks for the location and tile up front and refuses to create the
 * entry until they are usable.
 */

import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  DEFAULT_HOME_DIRECTION,
  HOME_DIRECTION_VALUES,
  MOD_ID_TOKEN_PREFIX,
  validateHomePlacement,
  type CharacterHomePlacement,
} from '@entities/character'
import { enumLabelKey } from '@entities/asset-schema'
import { useAssetAuthoringCopy, useCharacterDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type AddCharacterError = 'empty' | 'duplicate' | 'locationMissing' | 'tileNotNumeric'

const DEFAULT_PLACEMENT: CharacterHomePlacement = {
  location: '',
  tileX: 0,
  tileY: 0,
  direction: DEFAULT_HOME_DIRECTION,
}

function parseTile(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? Number.NaN : parsed
}

export function AddCharacterDialog({
  open,
  existingIds,
  projectUniqueId,
  locationNames,
  onClose,
  onCreate,
}: {
  open: boolean
  existingIds: readonly string[]
  projectUniqueId: string
  locationNames: readonly string[]
  onClose: () => void
  onCreate: (npcId: string, home: CharacterHomePlacement) => void
}) {
  const copy = useCharacterDataEditorCopy()
  const authoring = useAssetAuthoringCopy()
  const titleId = useId()
  const locationListId = useId()
  const [name, setName] = useState('')
  const [placement, setPlacement] = useState<CharacterHomePlacement>(DEFAULT_PLACEMENT)
  const [tileText, setTileText] = useState({ x: '0', y: '0' })
  const [error, setError] = useState<AddCharacterError | null>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setPlacement(DEFAULT_PLACEMENT)
      setTileText({ x: '0', y: '0' })
      setError(null)
    }
  }, [open])

  const errorMessages: Record<AddCharacterError, string> = {
    empty: copy.addDialog.emptyError,
    duplicate: copy.addDialog.duplicateError,
    locationMissing: copy.addDialog.locationMissingError,
    tileNotNumeric: copy.addDialog.tileNotNumericError,
  }

  function confirm() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('empty')
      return
    }
    if (existingIds.some((id) => id.toLowerCase() === trimmed.toLowerCase())) {
      setError('duplicate')
      return
    }
    const placementError = validateHomePlacement(placement)
    if (placementError !== null) {
      setError(placementError)
      return
    }
    onCreate(trimmed, placement)
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
            <span className="asset-field-label">{copy.addDialog.nameLabel}</span>
            <input
              type="text"
              className="control-input"
              value={name}
              placeholder={copy.addDialog.namePlaceholder}
              data-autofocus
              onChange={(event) => {
                setName(event.target.value)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  confirm()
                }
              }}
            />
            <span className="asset-field-hint">{copy.addDialog.nameHint}</span>
          </label>
          <button
            type="button"
            className="control-button asset-editor-prefix-button"
            disabled={name.trim().startsWith(MOD_ID_TOKEN_PREFIX)}
            onClick={() =>
              setName((current) => (current.trim().startsWith(MOD_ID_TOKEN_PREFIX) ? current : `${MOD_ID_TOKEN_PREFIX}${current.trim()}`))
            }
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{copy.addDialog.prefixAction}</span>
          </button>
          <p className="asset-field-hint">{copy.addDialog.prefixHint(projectUniqueId)}</p>

          <div className="asset-editor-add-section">
            <span className="asset-field-label">{copy.addDialog.homeSectionTitle}</span>
            <p className="asset-field-hint">{copy.addDialog.homeSectionHint}</p>
            <label className="asset-field">
              <span className="asset-field-label">{copy.addDialog.locationLabel}</span>
              <input
                type="text"
                className="control-input"
                list={locationNames.length > 0 ? locationListId : undefined}
                value={placement.location}
                placeholder={copy.addDialog.locationPlaceholder}
                onChange={(event) => {
                  setPlacement((current) => ({ ...current, location: event.target.value }))
                  setError(null)
                }}
              />
              {locationNames.length > 0 ? (
                <datalist id={locationListId}>
                  {locationNames.map((location) => (
                    <option key={location} value={location} />
                  ))}
                </datalist>
              ) : null}
            </label>
            <div className="asset-editor-add-grid">
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.tileXLabel}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="control-input"
                  value={tileText.x}
                  onChange={(event) => {
                    setTileText((current) => ({ ...current, x: event.target.value }))
                    setPlacement((current) => ({ ...current, tileX: parseTile(event.target.value) }))
                    setError(null)
                  }}
                />
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.tileYLabel}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="control-input"
                  value={tileText.y}
                  onChange={(event) => {
                    setTileText((current) => ({ ...current, y: event.target.value }))
                    setPlacement((current) => ({ ...current, tileY: parseTile(event.target.value) }))
                    setError(null)
                  }}
                />
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.directionLabel}</span>
                <select
                  className="control-input"
                  value={placement.direction}
                  onChange={(event) => setPlacement((current) => ({ ...current, direction: event.target.value }))}
                >
                  {HOME_DIRECTION_VALUES.map((direction) => (
                    <option key={direction} value={direction}>
                      {authoring.enums[enumLabelKey('character.direction', direction)] ?? direction}
                    </option>
                  ))}
                </select>
              </label>
            </div>
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
