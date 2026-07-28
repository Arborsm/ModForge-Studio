/**
 * Create dialog for a new `Data/Objects` entry.
 *
 * Type, category, price, texture and sprite index are collected up front rather
 * than left to the form: an object missing them loads as an unsellable blank
 * tile that no menu lists, and the game reports none of that as an error.
 */

import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  DEFAULT_OBJECT_ENTRY_SEED,
  displayNameFromObjectId,
  ITEM_ID_TOKEN_PREFIX,
  loadItemTextureAssetState,
  OBJECT_INEDIBLE,
  OBJECT_TYPE_SUGGESTIONS,
  type ItemTextureAssetState,
  type ObjectEntrySeed,
} from '@entities/item'
import type { LocaleCode } from '@locales/api'
import { useItemDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { cellIndexFor, regionForCellIndex, SheetRegionPicker } from '@shared/ui/SheetRegionPicker'

type AddObjectError = 'empty' | 'duplicate' | 'spriteIndex'

/** Text state kept alongside the seed so a half-typed number is not clobbered. */
type NumericText = { category: string; price: string; spriteIndex: string; edibility: string }

const DEFAULT_TEXT: NumericText = {
  category: String(DEFAULT_OBJECT_ENTRY_SEED.category),
  price: String(DEFAULT_OBJECT_ENTRY_SEED.price),
  spriteIndex: String(DEFAULT_OBJECT_ENTRY_SEED.spriteIndex),
  edibility: String(DEFAULT_OBJECT_ENTRY_SEED.edibility),
}

function parseIntOr(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export function AddObjectDialog({
  open,
  existingIds,
  textureSuggestions,
  projectUniqueId,
  gameRootPath,
  locale,
  onClose,
  onCreate,
}: {
  open: boolean
  existingIds: readonly string[]
  textureSuggestions: readonly string[]
  projectUniqueId: string
  gameRootPath: string | null
  locale: LocaleCode
  onClose: () => void
  onCreate: (objectId: string, seed: ObjectEntrySeed) => void
}) {
  const copy = useItemDataEditorCopy()
  const titleId = useId()
  const typeListId = useId()
  const textureListId = useId()
  const [objectId, setObjectId] = useState('')
  const [seed, setSeed] = useState<ObjectEntrySeed>(DEFAULT_OBJECT_ENTRY_SEED)
  const [text, setText] = useState<NumericText>(DEFAULT_TEXT)
  const [error, setError] = useState<AddObjectError | null>(null)
  const [sheet, setSheet] = useState<ItemTextureAssetState | null>(null)

  useEffect(() => {
    if (open) {
      setObjectId('')
      setSeed(DEFAULT_OBJECT_ENTRY_SEED)
      setText(DEFAULT_TEXT)
      setError(null)
    }
  }, [open])

  // Load the sprite sheet named by the texture field (debounced while typing).
  const textureAsset = seed.texture.trim() || 'Maps/springobjects'
  useEffect(() => {
    if (!open || gameRootPath === null) {
      setSheet(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      void loadItemTextureAssetState(gameRootPath, textureAsset, locale).then((state) => {
        if (!cancelled) {
          setSheet(state.url !== null && state.width !== null && state.height !== null ? state : null)
        }
      })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, gameRootPath, locale, textureAsset])

  const errorMessages: Record<AddObjectError, string> = {
    empty: copy.addDialog.emptyError,
    duplicate: copy.addDialog.duplicateError,
    spriteIndex: copy.addDialog.spriteIndexError,
  }

  function confirm() {
    const trimmed = objectId.trim()
    if (!trimmed) {
      setError('empty')
      return
    }
    if (existingIds.some((id) => id.toLowerCase() === trimmed.toLowerCase())) {
      setError('duplicate')
      return
    }
    if (!Number.isInteger(seed.spriteIndex) || seed.spriteIndex < 0) {
      setError('spriteIndex')
      return
    }
    onCreate(trimmed, seed)
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
              value={objectId}
              placeholder={copy.addDialog.idPlaceholder}
              data-autofocus
              onChange={(event) => {
                setObjectId(event.target.value)
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
            disabled={objectId.trim().startsWith(ITEM_ID_TOKEN_PREFIX)}
            onClick={() =>
              setObjectId((current) =>
                current.trim().startsWith(ITEM_ID_TOKEN_PREFIX) ? current : `${ITEM_ID_TOKEN_PREFIX}${current.trim()}`,
              )
            }
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{copy.addDialog.prefixAction}</span>
          </button>
          <p className="asset-field-hint">{copy.addDialog.prefixHint(projectUniqueId)}</p>

          <div className="asset-editor-add-section">
            <span className="asset-field-label">{copy.addDialog.basicsSectionTitle}</span>
            <p className="asset-field-hint">{copy.addDialog.basicsSectionHint}</p>
            <label className="asset-field">
              <span className="asset-field-label">{copy.addDialog.displayNameLabel}</span>
              <input
                type="text"
                className="control-input"
                value={seed.displayName}
                placeholder={objectId.trim() ? displayNameFromObjectId(objectId.trim()) : copy.addDialog.displayNamePlaceholder}
                onChange={(event) => setSeed((current) => ({ ...current, displayName: event.target.value }))}
              />
            </label>
            <div className="asset-editor-add-grid">
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.typeLabel}</span>
                <input
                  type="text"
                  className="control-input"
                  list={typeListId}
                  value={seed.type}
                  onChange={(event) => setSeed((current) => ({ ...current, type: event.target.value }))}
                />
                <datalist id={typeListId}>
                  {OBJECT_TYPE_SUGGESTIONS.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.categoryLabel}</span>
                <input
                  type="number"
                  step={1}
                  className="control-input"
                  value={text.category}
                  onChange={(event) => {
                    setText((current) => ({ ...current, category: event.target.value }))
                    setSeed((current) => ({ ...current, category: parseIntOr(event.target.value, 0) }))
                  }}
                />
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.priceLabel}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="control-input"
                  value={text.price}
                  onChange={(event) => {
                    setText((current) => ({ ...current, price: event.target.value }))
                    setSeed((current) => ({ ...current, price: parseIntOr(event.target.value, 0) }))
                  }}
                />
              </label>
            </div>
          </div>

          <div className="asset-editor-add-section">
            <span className="asset-field-label">{copy.addDialog.spriteSectionTitle}</span>
            <p className="asset-field-hint">{copy.addDialog.spriteSectionHint}</p>
            {sheet !== null && sheet.url !== null && sheet.width !== null && sheet.height !== null ? (
              <div className="mb-2">
                <SheetRegionPicker
                  imageUrl={sheet.url}
                  imageWidth={sheet.width}
                  imageHeight={sheet.height}
                  cellPick
                  snap={16}
                  value={regionForCellIndex(seed.spriteIndex, 16, sheet.width, sheet.height)}
                  onChange={(region) => {
                    const index = cellIndexFor(region, 16, sheet.width!)
                    setSeed((current) => ({ ...current, spriteIndex: index }))
                    setText((current) => ({ ...current, spriteIndex: String(index) }))
                    setError(null)
                  }}
                />
                <p className="asset-field-hint mt-1">{copy.addDialog.spritePickHint}</p>
              </div>
            ) : null}
            <label className="asset-field">
              <span className="asset-field-label">{copy.addDialog.textureLabel}</span>
              <input
                type="text"
                className="control-input"
                list={textureListId}
                value={seed.texture}
                placeholder={copy.addDialog.texturePlaceholder}
                onChange={(event) => setSeed((current) => ({ ...current, texture: event.target.value }))}
              />
              <datalist id={textureListId}>
                {textureSuggestions.map((texture) => (
                  <option key={texture} value={texture} />
                ))}
              </datalist>
            </label>
            <div className="asset-editor-add-grid">
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.spriteIndexLabel}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="control-input"
                  value={text.spriteIndex}
                  onChange={(event) => {
                    setText((current) => ({ ...current, spriteIndex: event.target.value }))
                    setSeed((current) => ({ ...current, spriteIndex: parseIntOr(event.target.value, Number.NaN) }))
                    setError(null)
                  }}
                />
              </label>
              <label className="asset-field">
                <span className="asset-field-label">{copy.addDialog.edibilityLabel}</span>
                <input
                  type="number"
                  step={1}
                  className="control-input"
                  value={text.edibility}
                  onChange={(event) => {
                    setText((current) => ({ ...current, edibility: event.target.value }))
                    setSeed((current) => ({ ...current, edibility: parseIntOr(event.target.value, OBJECT_INEDIBLE) }))
                  }}
                />
              </label>
            </div>
            <p className="asset-field-hint">{copy.addDialog.edibilityHint(OBJECT_INEDIBLE)}</p>
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
