/**
 * Browse-and-pick dialog shared by every `*_ref` control.
 *
 * Presentational only: the option list arrives through `AssetResources`, so the
 * dialog never touches the host. Selection is buffered until confirm so that a
 * mis-click does not rewrite the field, and a query that matches nothing can
 * still be committed verbatim — mods legitimately reference ids that are not in
 * the local registry (another mod's item, a not-yet-created texture).
 */

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useAssetAuthoringCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { resourceOptionLabel, resourceOptionMatches, resourceSpriteStyle, type ResourceOption } from '../model/resources'

export type ResourcePickerDialogProps = {
  open: boolean
  /** Localized kind label used in the dialog title. */
  kindLabel: string
  options: readonly ResourceOption[]
  /** Currently committed field value, preselected when it matches an option. */
  value: string
  onClose: () => void
  /** Commits the chosen value; empty string clears the field. */
  onSelect: (next: string) => void
}

/**
 * Thumbnail for one option.
 *
 * A sheet-backed sprite wins over a standalone data URL: catalogs cut from one
 * atlas (every build material off `Maps/springobjects`) share a single decode
 * that way, which is what keeps a several-hundred-entry list scrollable.
 */
function OptionPreview({ option }: { option: ResourceOption }) {
  if (option.sprite) {
    // The sprite keeps its natural pixel size inside the fixed frame, centred and
    // scaled up to fill it, so a 16x16 object and a 32x32 one read the same size.
    return (
      <span className="asset-picker-option-preview is-sprite" role="presentation">
        <span className="asset-picker-option-sprite" style={resourceSpriteStyle(option.sprite)} />
      </span>
    )
  }
  if (option.preview) {
    return <img src={option.preview} alt="" className="asset-picker-option-preview" />
  }
  return null
}

export function ResourcePickerDialog({ open, kindLabel, options, value, onClose, onSelect }: ResourcePickerDialogProps) {
  const copy = useAssetAuthoringCopy().picker
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [draft, setDraft] = useState(value)

  // Each opening starts from what the field currently holds, so an abandoned
  // browse never leaks its highlight into the next one.
  useEffect(() => {
    if (open) {
      setDraft(value)
      setQuery('')
      setCategory('all')
    }
  }, [open, value])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const option of options) {
      if (option.category) {
        counts.set(option.category, (counts.get(option.category) ?? 0) + 1)
      }
    }
    return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  }, [options])

  const visible = useMemo(
    () => options.filter((option) => (category === 'all' || option.category === category) && resourceOptionMatches(option, query)),
    [category, options, query],
  )

  const trimmedQuery = query.trim()
  const canUseCustomValue = trimmedQuery !== '' && !options.some((option) => option.value === trimmedQuery)

  function commit(next: string) {
    onSelect(next)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} ariaLabel={copy.dialogTitle(kindLabel)} size="lg" stack>
      <DialogHeader
        title={copy.dialogTitle(kindLabel)}
        subtitle={draft === '' ? copy.noSelection : copy.currentSelection(draft)}
        onClose={onClose}
        closeLabel={copy.cancel}
      />
      <DialogBody className="asset-picker-body">
        <div className="asset-picker-toolbar">
          <label className="asset-picker-search">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{copy.searchPlaceholder}</span>
            <input
              type="search"
              className="control-input"
              value={query}
              placeholder={copy.searchPlaceholder}
              data-autofocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {categories.length > 0 ? (
            <label className="asset-picker-category">
              <span className="sr-only">{copy.categoryFilterLabel}</span>
              <select className="control-input" value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">{copy.allCategories}</option>
                {categories.map(([name, count]) => (
                  <option key={name} value={name}>{`${name} (${count})`}</option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="asset-picker-count">{copy.resultCount(visible.length, options.length)}</span>
        </div>

        {canUseCustomValue ? (
          <button
            type="button"
            className={cx('asset-picker-option', 'is-custom', draft === trimmedQuery && 'is-selected')}
            onClick={() => setDraft(trimmedQuery)}
            onDoubleClick={() => commit(trimmedQuery)}
          >
            <span className="asset-picker-option-label">{copy.customValueTitle}</span>
            <span className="asset-picker-option-detail">{copy.customValueHint(trimmedQuery)}</span>
          </button>
        ) : null}

        {visible.length === 0 && !canUseCustomValue ? (
          <p className="asset-picker-empty">{copy.empty}</p>
        ) : (
          <div className="asset-picker-list">
            {visible.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cx('asset-picker-option', draft === option.value && 'is-selected')}
                aria-pressed={draft === option.value}
                onClick={() => setDraft(option.value)}
                onDoubleClick={() => commit(option.value)}
              >
                <OptionPreview option={option} />
                <span className="asset-picker-option-label">{resourceOptionLabel(option)}</span>
                <span className="asset-picker-option-value">{option.value}</span>
                {option.category ? <span className="asset-picker-option-tag">{option.category}</span> : null}
                {option.detail ? <span className="asset-picker-option-detail">{option.detail}</span> : null}
              </button>
            ))}
          </div>
        )}
      </DialogBody>
      <DialogFooter align="between">
        <DialogAction onClick={() => commit('')}>{copy.clearAction}</DialogAction>
        <span className="asset-picker-actions">
          <DialogAction onClick={onClose}>{copy.cancel}</DialogAction>
          <DialogAction tone="primary" disabled={draft === ''} onClick={() => commit(draft)}>
            {copy.confirm}
          </DialogAction>
        </span>
      </DialogFooter>
    </Dialog>
  )
}
