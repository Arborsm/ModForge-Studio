import { Check, ChevronLeft, ChevronRight, PackageSearch, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { Dialog } from '@shared/ui/Dialog'
import type { LauncherConfigItemOption } from '../../model/launcherContracts'

type LauncherModConfigItemPickerProps = {
  value: string
  label: string
  options: LauncherConfigItemOption[]
  state: 'idle' | 'loading' | 'ready' | 'error'
  disabled?: boolean
  onSelect: (value: string) => void
}

const PAGE_SIZE = 48

function itemMatches(option: LauncherConfigItemOption, query: string) {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) {
    return true
  }
  return [option.label, option.value, option.category, option.source, ...Object.values(option.metadata)].some((part) =>
    part?.toLocaleLowerCase().includes(normalized),
  )
}

export function LauncherModConfigItemPicker({
  value,
  label,
  options,
  state,
  disabled = false,
  onSelect,
}: LauncherModConfigItemPickerProps) {
  const copy = useEditorCopy().launcher.library.modDetail.config
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const categories = Array.from(new Set(options.map((option) => option.category).filter((entry): entry is string => Boolean(entry)))).sort()
  const categoryOptions = category ? options.filter((option) => option.category === category) : options
  const filtered = categoryOptions.filter((option) => itemMatches(option, query))
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visibleOptions = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) {
      return
    }
    window.requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  const choose = (nextValue: string) => {
    onSelect(nextValue)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="launcher-mod-detail-config-item-picker-trigger"
        disabled={disabled}
        title={copy.chooseItem}
        aria-label={copy.chooseItemFor(label)}
        onClick={() => setOpen(true)}
      >
        <PackageSearch className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{selected?.label ?? copy.chooseItem}</span>
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel={copy.itemPickerTitle}
        size="xl"
        bare
        className="launcher-config-item-picker"
      >
        <header className="launcher-config-item-picker-header">
          <span className="launcher-config-item-picker-heading">
            <PackageSearch className="h-4 w-4" aria-hidden="true" />
            <span>
              <strong>{copy.itemPickerTitle}</strong>
              <small>{copy.itemsFound(filtered.length)}</small>
            </span>
          </span>
          <button type="button" title={copy.closeItemPicker} aria-label={copy.closeItemPicker} onClick={() => setOpen(false)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="launcher-config-item-picker-body">
          <aside className="launcher-config-item-picker-categories">
            <button
              type="button"
              data-active={category === null || undefined}
              onClick={() => {
                setCategory(null)
                setPage(1)
              }}
            >
              <span>{copy.allItems}</span>
              <em>{options.length}</em>
            </button>
            {categories.map((nextCategory) => (
              <button
                key={nextCategory}
                type="button"
                data-active={category === nextCategory || undefined}
                onClick={() => {
                  setCategory(nextCategory)
                  setPage(1)
                }}
              >
                <span>{nextCategory}</span>
                <em>{options.filter((option) => option.category === nextCategory).length}</em>
              </button>
            ))}
          </aside>

          <div className="launcher-config-item-picker-content">
            <label className="launcher-config-item-picker-search">
              <Search className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">{copy.searchItems}</span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder={copy.searchItems}
                onChange={(event) => {
                  setQuery(event.currentTarget.value)
                  setPage(1)
                }}
              />
            </label>

            {state === 'loading' ? <p className="launcher-config-item-picker-state">{copy.loadingItems}</p> : null}
            {state === 'error' || state === 'idle' ? (
              <p className="launcher-config-item-picker-state">{copy.itemCatalogUnavailable}</p>
            ) : null}
            {state === 'ready' && visibleOptions.length === 0 ? <p className="launcher-config-item-picker-state">{copy.noItems}</p> : null}
            {state === 'ready' && visibleOptions.length ? (
              <div className="launcher-config-item-picker-grid">
                {visibleOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="launcher-config-item-picker-option"
                    data-selected={option.value === value || undefined}
                    onClick={() => choose(option.value)}
                  >
                    <span className="launcher-config-item-picker-option-mark" aria-hidden="true">
                      {option.label.slice(0, 1).toLocaleUpperCase()}
                    </span>
                    <span className="launcher-config-item-picker-option-copy">
                      <strong>{option.label}</strong>
                      <small>{option.value}</small>
                    </span>
                    <span className="launcher-config-item-picker-option-meta">{option.category ?? option.source}</span>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="launcher-config-item-picker-footer">
          <span>{copy.itemPage(safePage, pageCount)}</span>
          <nav aria-label={copy.itemPage(safePage, pageCount)}>
            <button
              type="button"
              disabled={safePage <= 1}
              title={copy.previousItemPage}
              aria-label={copy.previousItemPage}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={safePage >= pageCount}
              title={copy.nextItemPage}
              aria-label={copy.nextItemPage}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        </footer>
      </Dialog>
    </>
  )
}
