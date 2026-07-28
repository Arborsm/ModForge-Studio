import { useEffect, useId, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { useScheduleEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { SCHEDULE_KEY_SUGGESTIONS } from '../entities/schedule'

/**
 * Asks for the key of a new schedule entry before staging it.
 *
 * The key decides which day the entry runs on and is the entry's identity in
 * the patch, so it is validated up front rather than left blank and fixed up on
 * save the way a free-text field would be.
 */
export function AddScheduleEntryDialog({
  open,
  onClose,
  onValidateKey,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onValidateKey: (key: string) => 'empty' | 'conflict' | null
  onCreate: (key: string) => void
}) {
  const copy = useScheduleEditorCopy()
  const titleId = useId()
  const keyListId = useId()
  const [key, setKey] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setKey('')
      setTouched(false)
    }
  }, [open])

  const error = onValidateKey(key)
  const showError = touched && error !== null

  function handleCreate() {
    setTouched(true)
    if (error !== null) {
      return
    }
    onCreate(key.trim())
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="sm">
      <DialogHeader
        id={titleId}
        title={copy.newEntryTitle}
        icon={<CalendarPlus className="h-4 w-4" aria-hidden="true" />}
        onClose={onClose}
        closeLabel={copy.closeLabel}
      />
      <DialogBody>
        <datalist id={keyListId}>
          {SCHEDULE_KEY_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <label className="schedule-editor-form-field">
          <span className="schedule-editor-field-label">{copy.entryKeyLabel}</span>
          <input
            className="control-input font-mono"
            list={keyListId}
            value={key}
            placeholder={copy.entryKeyPlaceholder}
            spellCheck={false}
            autoFocus
            onChange={(event) => {
              setKey(event.target.value)
              setTouched(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleCreate()
              }
            }}
          />
          {showError ? (
            <span className="schedule-editor-inline-error">{error === 'empty' ? copy.keyRequiredError : copy.keyConflictError}</span>
          ) : null}
        </label>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancelAction}</DialogAction>
        <DialogAction tone="primary" onClick={handleCreate} disabled={error !== null}>
          {copy.createEntryAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
