import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, FileJson, Loader2, Search } from 'lucide-react'
import { loadEventAsset } from '@entities/game/api'
import { useEditorCopy, useLocale } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import type { EventScript } from '@shared/contracts/event-script'

export type EventVanillaImportDialogProps = {
  open: boolean
  gameRootPath: string
  /** CP target of the active patch, e.g. `Data/Events/Town`; resolved to `Content/<target>.xnb`. */
  target: string
  /** Event keys already present in the draft patch; those rows are disabled so imports never overwrite edits. */
  existingKeys: string[]
  onClose: () => void
  onImport: (entries: Record<string, string>) => void
}

function eventSearchText(event: EventScript) {
  return [event.key, event.eventId, ...event.preconditions, ...event.scene.actors.map((actor) => actor.actorName)].join(' ').toLowerCase()
}

/**
 * Parses the vanilla event file behind a patch target and lets the author pick
 * individual events into the draft (`editorState.entries`). Keys already in the
 * draft are listed but locked, so importing can never clobber local edits.
 */
export function EventVanillaImportDialog({ open, gameRootPath, target, existingKeys, onClose, onImport }: EventVanillaImportDialogProps) {
  const desk = useEditorCopy().studioDesk
  const hub = desk.eventPatchHub
  const copy = hub.importVanilla
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [events, setEvents] = useState<EventScript[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedKeys(new Set())
      return
    }
    let active = true
    setLoading(true)
    setLoadFailed(false)
    void loadEventAsset(gameRootPath, `Content/${target}.xnb`, locale).then(
      (parsed) => {
        if (active) {
          setEvents(parsed.events)
          setLoading(false)
        }
      },
      () => {
        if (active) {
          setEvents([])
          setLoadFailed(true)
          setLoading(false)
        }
      },
    )
    return () => {
      active = false
    }
  }, [gameRootPath, target, locale, open])

  const existing = useMemo(() => new Set(existingKeys), [existingKeys])
  const rows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return events.filter((event) => !normalized || eventSearchText(event).includes(normalized))
  }, [events, query])

  function toggle(event: EventScript) {
    if (existing.has(event.key)) {
      return
    }
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(event.key)) {
        next.delete(event.key)
      } else {
        next.add(event.key)
      }
      return next
    })
  }

  function handleImport() {
    const entries = Object.fromEntries(
      events.filter((event) => selectedKeys.has(event.key) && !existing.has(event.key)).map((event) => [event.key, event.rawScript]),
    )
    if (Object.keys(entries).length === 0) {
      return
    }
    onImport(entries)
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy="event-vanilla-import-title">
      <DialogHeader id="event-vanilla-import-title" title={copy.action} subtitle={target} onClose={onClose} closeLabel={copy.closeLabel} />
      <DialogBody>
        <div className="event-patch-create">
          <label className="event-patch-create-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{copy.searchPlaceholder}</span>
            <input type="search" value={query} placeholder={copy.searchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
          </label>

          <div className="event-patch-create-section">
            {loading ? (
              <p className="event-patch-create-state" role="status">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                {copy.loadingLabel}
              </p>
            ) : loadFailed ? (
              <p className="event-patch-create-state is-error" role="alert">
                {copy.loadErrorLabel}
              </p>
            ) : rows.length === 0 ? (
              <p className="event-patch-create-state">{copy.emptyLabel}</p>
            ) : (
              <div className="event-patch-create-list">
                {rows.map((event) => {
                  const inDraft = existing.has(event.key)
                  const selected = selectedKeys.has(event.key)
                  return (
                    <button
                      key={event.key}
                      type="button"
                      className={cx('event-patch-create-row', selected && 'active')}
                      disabled={inDraft}
                      aria-pressed={selected}
                      onClick={() => toggle(event)}
                    >
                      {selected ? (
                        <CheckSquare className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <FileJson className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span className="event-patch-create-row-copy">
                        <strong>{event.eventId}</strong>
                        <span>{event.key}</span>
                      </span>
                      {inDraft ? <span className="event-patch-create-badge">{copy.alreadyInDraft}</span> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{desk.addPatchDialog.cancel}</DialogAction>
        <DialogAction tone="primary" disabled={selectedKeys.size === 0} onClick={handleImport}>
          {copy.confirm(selectedKeys.size)}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
