/**
 * `Data/NPCGiftTastes` editor, rendered next to the character entry it belongs
 * to but staged into its own patch.
 *
 * A row is a positional ten-slot string, which no generic schema control can
 * express safely, so the five tastes are edited as structured sections and
 * serialized through the shared parser. The row is only written when the author
 * actually changes something, so opening a character never creates an empty
 * gift-taste entry behind their back.
 */

import { useId, useState } from 'react'
import { AlertTriangle, Download, Gift, Plus, Trash2 } from 'lucide-react'
import {
  GIFT_TASTE_KINDS,
  createEmptyNpcGiftTasteEntry,
  parseGiftTasteTokenList,
  parseNpcGiftTasteEntry,
  serializeNpcGiftTasteEntry,
  type GiftTasteKind,
  type NpcGiftTasteEntry,
} from '@entities/character'
import { useCharacterDataEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

export type GiftTasteEditorProps = {
  /** NPC whose row is being edited, or null when no character is selected. */
  npcId: string | null
  /** Raw row currently staged in the draft; undefined when the row does not exist. */
  rawValue: unknown
  /** Whether a patch in the draft targets `Data/NPCGiftTastes`. */
  patchExists: boolean
  /** Vanilla row for this NPC, offered as a starting point. */
  vanillaRow: string | null
  onCreatePatch: () => void
  onChange: (row: string) => void
  onRemove: () => void
}

function kindLabel(copy: ReturnType<typeof useCharacterDataEditorCopy>, kind: GiftTasteKind): string {
  switch (kind) {
    case 'love':
      return copy.giftTastes.kindLove
    case 'like':
      return copy.giftTastes.kindLike
    case 'dislike':
      return copy.giftTastes.kindDislike
    case 'hate':
      return copy.giftTastes.kindHate
    case 'neutral':
      return copy.giftTastes.kindNeutral
  }
}

function TasteSection({
  kind,
  entry,
  onChange,
}: {
  kind: GiftTasteKind
  entry: NpcGiftTasteEntry
  onChange: (next: NpcGiftTasteEntry) => void
}) {
  const copy = useCharacterDataEditorCopy()
  const section = entry[kind]
  const externalText = section.items.join(' ')
  const [itemsText, setItemsText] = useState(externalText)
  // Token text is edited as free text so a trailing space can be typed; the
  // marker tells an external replacement (vanilla import) apart from the
  // normalized echo of the author's own keystroke.
  const [normalizedMarker, setNormalizedMarker] = useState(externalText)

  if (externalText !== normalizedMarker) {
    setNormalizedMarker(externalText)
    setItemsText(externalText)
  }

  function commitItems(nextText: string) {
    const items = parseGiftTasteTokenList(nextText)
    setItemsText(nextText)
    setNormalizedMarker(items.join(' '))
    onChange({ ...entry, [kind]: { ...section, items } })
  }

  return (
    <section className={`character-gift-taste-section is-${kind}`}>
      <header className="character-gift-taste-head">
        <span className="character-gift-taste-kind">{kindLabel(copy, kind)}</span>
        <span className="character-gift-taste-count">{copy.giftTastes.itemCount(section.items.length)}</span>
      </header>
      <label className="asset-field">
        <span className="asset-field-label">{copy.giftTastes.reactionLabel}</span>
        <input
          type="text"
          className="control-input"
          value={section.reaction}
          placeholder={copy.giftTastes.reactionPlaceholder}
          onChange={(event) => onChange({ ...entry, [kind]: { ...section, reaction: event.target.value } })}
        />
      </label>
      <label className="asset-field">
        <span className="asset-field-label">{copy.giftTastes.itemsLabel}</span>
        <input
          type="text"
          className="control-input font-mono"
          value={itemsText}
          placeholder={copy.giftTastes.itemsPlaceholder}
          onChange={(event) => commitItems(event.target.value)}
        />
        <span className="asset-field-hint">{copy.giftTastes.itemsHint}</span>
      </label>
    </section>
  )
}

export function CharacterGiftTasteEditor({
  npcId,
  rawValue,
  patchExists,
  vanillaRow,
  onCreatePatch,
  onChange,
  onRemove,
}: GiftTasteEditorProps) {
  const copy = useCharacterDataEditorCopy()
  const removeTitleId = useId()
  const [removeOpen, setRemoveOpen] = useState(false)
  const rowExists = typeof rawValue === 'string'
  const entry = rowExists ? parseNpcGiftTasteEntry(rawValue) : createEmptyNpcGiftTasteEntry()

  if (npcId === null) {
    return null
  }

  return (
    <section className="asset-editor-card">
      <div className="asset-editor-card-title">
        <Gift className="h-4 w-4" aria-hidden="true" />
        <span>{copy.giftTastes.title}</span>
      </div>
      <p className="asset-field-hint">{copy.giftTastes.subtitle}</p>

      {!patchExists ? (
        <div className="character-gift-taste-cta">
          <p className="asset-field-hint">{copy.giftTastes.createHint}</p>
          <button type="button" className="control-button control-button-primary" onClick={onCreatePatch}>
            <Plus className="h-3.5 w-3.5" />
            <span>{copy.giftTastes.createAction}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="character-gift-taste-actions">
            <button
              type="button"
              className="control-button"
              disabled={vanillaRow === null}
              title={vanillaRow === null ? copy.giftTastes.vanillaUnavailable : copy.giftTastes.importVanillaHint}
              onClick={() => {
                if (vanillaRow !== null) {
                  onChange(vanillaRow)
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
              <span>{copy.giftTastes.importVanillaAction}</span>
            </button>
            {rowExists ? (
              <button type="button" className="control-button asset-editor-remove-entry" onClick={() => setRemoveOpen(true)}>
                <Trash2 className="h-3.5 w-3.5" />
                <span>{copy.giftTastes.removeAction}</span>
              </button>
            ) : null}
          </div>

          <div className="character-gift-taste-grid">
            {GIFT_TASTE_KINDS.map((kind) => (
              <TasteSection
                key={`${npcId}:${kind}`}
                kind={kind}
                entry={entry}
                onChange={(next) => onChange(serializeNpcGiftTasteEntry(next))}
              />
            ))}
          </div>
        </>
      )}

      <Dialog open={removeOpen} onClose={() => setRemoveOpen(false)} labelledBy={removeTitleId} size="sm">
        <DialogHeader
          id={removeTitleId}
          title={copy.giftTastes.removeConfirmTitle}
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          onClose={() => setRemoveOpen(false)}
          closeLabel={copy.entries.closeLabel}
        />
        <DialogBody>
          <p className="asset-editor-remove-message">{copy.giftTastes.removeConfirmMessage(npcId)}</p>
        </DialogBody>
        <DialogFooter>
          <DialogAction onClick={() => setRemoveOpen(false)}>{copy.entries.cancelAction}</DialogAction>
          <DialogAction
            tone="danger"
            onClick={() => {
              onRemove()
              setRemoveOpen(false)
            }}
          >
            {copy.entries.removeConfirmAction}
          </DialogAction>
        </DialogFooter>
      </Dialog>
    </section>
  )
}
