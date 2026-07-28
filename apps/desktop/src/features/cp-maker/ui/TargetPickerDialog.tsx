import { useState } from 'react'
import { useId } from 'react'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type TargetPickerDialogProps = {
  open: boolean
  /** Dialog heading, e.g. the events workspace's location picker title. */
  title: string
  /** Candidate targets, pre-filtered by the caller for the current context. */
  suggestions: readonly string[]
  confirmLabel: string
  onClose: () => void
  onConfirm: (target: string) => void
}

/**
 * Single-purpose target picker: one list of asset targets plus a custom entry,
 * no action choice. Workspaces use it when the action is already implied by
 * the content being created (e.g. events are always `EditData`).
 */
export function TargetPickerDialog({ open, title, suggestions, confirmLabel, onClose, onConfirm }: TargetPickerDialogProps) {
  const copy = useEditorCopy().studioDesk.addPatchDialog
  const titleId = useId()
  const [selectedTarget, setSelectedTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [targetFilter, setTargetFilter] = useState('')

  const targetToUse = customTarget.trim() || selectedTarget
  const needle = targetFilter.trim().toLowerCase()
  const visibleTargets = needle === '' ? suggestions : suggestions.filter((target) => target.toLowerCase().includes(needle))

  function handleConfirm() {
    if (!targetToUse) return
    onConfirm(targetToUse)
    setSelectedTarget('')
    setCustomTarget('')
    setTargetFilter('')
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy={titleId}>
      <DialogHeader title={title} onClose={onClose} closeLabel={copy.closeLabel} id={titleId} />
      <DialogBody>
        <div className="space-y-2">
          <input
            type="text"
            value={targetFilter}
            onChange={(event) => setTargetFilter(event.target.value)}
            placeholder={copy.filterPlaceholder}
            className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-(--accent)"
          />
          <div className="custom-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
            {visibleTargets.map((target) => (
              <button
                key={target}
                type="button"
                onClick={() => {
                  setSelectedTarget(target)
                  setCustomTarget('')
                }}
                className={`w-full rounded-md px-3 py-1.5 text-left font-mono text-xs ${
                  selectedTarget === target && customTarget.trim() === ''
                    ? 'bg-(--accent-soft) text-(--text-primary)'
                    : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)'
                }`}
              >
                {target}
              </button>
            ))}
            {visibleTargets.length === 0 ? <p className="px-3 py-2 text-xs text-(--text-secondary)">{copy.noSuggestedTargets}</p> : null}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-(--text-secondary)">{copy.customTarget}</span>
            <input
              type="text"
              value={customTarget}
              onChange={(event) => setCustomTarget(event.target.value)}
              placeholder={copy.customTargetPlaceholder}
              className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 font-mono text-xs text-(--text-primary) outline-none focus:border-(--accent)"
            />
          </label>
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancel}</DialogAction>
        <DialogAction tone="primary" onClick={handleConfirm} disabled={!targetToUse}>
          {confirmLabel}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
