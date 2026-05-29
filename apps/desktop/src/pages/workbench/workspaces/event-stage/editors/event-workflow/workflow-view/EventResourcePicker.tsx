import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Database, Search, X } from 'lucide-react'
import { ItemSprite, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@pages/workbench/workspaces/item/entities/item'
import { cx } from '@shared/lib/cx'

export type EventResourceKind = 'actor' | 'item' | 'location' | 'music' | 'sound'

export type EventResourceOption = {
  id: string
  value: string
  label: string
  kind: EventResourceKind
  subtitle?: string
  badge?: string
  preview?: string
  tone?: string
  category?: string
  meta?: string
  sourcePath?: string
  item?: Pick<
    ItemWorkspaceEntry,
    'displayName' | 'kind' | 'textureAssetName' | 'spriteIndex' | 'menuSpriteIndex' | 'spriteWidth' | 'spriteHeight' | 'apparelStats'
  >
  itemTexture?: ItemTextureAssetState | null
}

type EventResourcePickerProps = {
  value: string
  label: string
  placeholder: string
  options: EventResourceOption[]
  onSelect: (value: string) => void
  className?: string
  triggerClassName?: string
  emptyLabel?: string
}

function optionMatches(option: EventResourceOption, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return [option.label, option.value, option.subtitle, option.badge, option.category, option.meta, option.sourcePath].some((part) =>
    part?.toLowerCase().includes(normalized),
  )
}

function ResourcePreview({ option }: { option: EventResourceOption }) {
  if (option.item) {
    return (
      <ItemSprite
        item={option.item}
        textureState={option.itemTexture ?? null}
        scale={1.5}
        className="h-8 w-8 shrink-0 rounded border bg-[var(--bg-panel)]"
      />
    )
  }

  if (option.preview) {
    return (
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded border border-[var(--border-color)] bg-[var(--bg-app)]"
        aria-hidden
      >
        <img src={option.preview} alt="" className="h-full w-full object-cover [image-rendering:pixelated]" />
      </span>
    )
  }

  return (
    <span
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_72%,transparent)] font-mono text-[10px] font-bold text-[var(--text-secondary)]"
      style={option.tone ? { borderColor: option.tone, color: option.tone } : undefined}
      aria-hidden
    >
      {(option.label || option.value).slice(0, 2).toUpperCase()}
    </span>
  )
}

export function EventResourcePicker({
  value,
  label,
  placeholder,
  options,
  onSelect,
  className,
  triggerClassName,
  emptyLabel = 'No resources',
}: EventResourcePickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(() => options.filter((option) => optionMatches(option, query)), [options, query])
  const trimmedQuery = query.trim()
  const canApplyQuery = trimmedQuery.length > 0 && filtered.length === 0 && !options.some((option) => option.value === trimmedQuery)
  const triggerTitle = value ? `${label}: ${value}` : label
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const option of options) {
      const category = option.category ?? option.badge ?? option.subtitle ?? option.kind
      counts.set(category, (counts.get(category) ?? 0) + 1)
    }
    return [...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))
  }, [options])
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const categoryFiltered = useMemo(
    () =>
      activeCategory === 'all'
        ? filtered
        : filtered.filter((option) => (option.category ?? option.badge ?? option.subtitle ?? option.kind) === activeCategory),
    [activeCategory, filtered],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    const timeout = window.setTimeout(() => inputRef.current?.focus(), 20)

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.clearTimeout(timeout)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [open])

  function selectValue(nextValue: string) {
    onSelect(nextValue)
    setQuery('')
    setOpen(false)
  }

  return (
    <span className={cx('inline-flex', className)}>
      <button
        type="button"
        className={cx(
          'inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] [&::-webkit-details-marker]:hidden',
          triggerClassName,
        )}
        title={triggerTitle}
        aria-label={triggerTitle}
        onClick={(event) => {
          event.preventDefault()
          setOpen((current) => !current)
        }}
      >
        <span className="max-w-28 truncate">{selected?.label ?? (value || placeholder)}</span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/20 px-4 pt-[12vh]">
          <div
            ref={dialogRef}
            className="grid h-[min(760px,calc(100vh-7rem))] w-[min(920px,calc(100vw-2rem))] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] shadow-[var(--shadow-float)]"
            role="dialog"
            aria-modal="true"
            aria-label={label}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--text-primary)]">{label}</p>
                <p className="truncate text-[10px] text-[var(--text-tertiary)]">
                  {categoryFiltered.length} shown / {options.length} total · {selected?.label ?? value ?? placeholder}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                title="Close"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <label className="mx-3 mt-3 flex h-8 items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 text-[var(--text-tertiary)]">
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="sr-only">{label}</span>
              <input
                ref={inputRef}
                className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                value={query}
                placeholder={placeholder}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && trimmedQuery) {
                    event.preventDefault()
                    selectValue(trimmedQuery)
                  }
                }}
              />
            </label>
            <div className="grid min-h-0 grid-cols-[180px_minmax(0,1fr)] border-t border-[var(--border-color)]">
              <aside className="min-h-0 overflow-auto border-r border-[var(--border-color)] bg-[var(--bg-panel)] p-2">
                <button
                  type="button"
                  className={cx(
                    'mb-1 flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[11px] font-semibold',
                    activeCategory === 'all' ? 'bg-[var(--bg-panel-muted)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                  )}
                  onClick={() => setActiveCategory('all')}
                >
                  <span>All</span>
                  <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{options.length}</span>
                </button>
                {categories.map(([category, count]) => (
                  <button
                    key={category}
                    type="button"
                    className={cx(
                      'mb-1 flex h-8 w-full items-center justify-between rounded-md px-2 text-left text-[11px]',
                      activeCategory === category
                        ? 'bg-[color-mix(in_srgb,var(--accent-soft)_56%,transparent)] font-semibold text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]',
                    )}
                    onClick={() => setActiveCategory(category)}
                  >
                    <span className="truncate">{category}</span>
                    <span className="ml-2 font-mono text-[10px] text-[var(--text-tertiary)]">{count}</span>
                  </button>
                ))}
              </aside>
              <div className="min-h-0 overflow-auto p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-[var(--text-tertiary)]">
                  <span className="truncate">{activeCategory === 'all' ? 'All resources' : activeCategory}</span>
                  <span className="shrink-0">{categoryFiltered.length} visible</span>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-1.5">
                  {canApplyQuery ? (
                    <button
                      type="button"
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-dashed border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-left text-[var(--text-secondary)] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_42%,var(--border-color))] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
                      onClick={() => selectValue(trimmedQuery)}
                    >
                      <ResourcePreview
                        option={{
                          id: `custom:${trimmedQuery}`,
                          value: trimmedQuery,
                          label: trimmedQuery,
                          kind: options[0]?.kind ?? 'actor',
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{trimmedQuery}</span>
                        <span className="block truncate text-[10px] text-[var(--text-tertiary)]">Use custom resource</span>
                      </span>
                    </button>
                  ) : null}
                  {categoryFiltered.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={cx(
                        'grid min-w-0 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors',
                        option.value === value
                          ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_70%,transparent)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:border-[color-mix(in_srgb,var(--accent)_38%,var(--border-color))] hover:bg-[var(--bg-panel-muted)]',
                      )}
                      onClick={() => selectValue(option.value)}
                    >
                      <ResourcePreview option={option} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-[var(--text-primary)]">{option.label}</span>
                        <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
                          {option.meta ?? option.value} · {option.subtitle ?? option.badge ?? option.kind}
                        </span>
                        {option.sourcePath ? (
                          <span className="mt-0.5 flex min-w-0 items-center gap-1 truncate text-[10px] text-[var(--text-tertiary)]">
                            <Database className="h-3 w-3 shrink-0" />
                            <span className="truncate">{option.sourcePath}</span>
                          </span>
                        ) : null}
                      </span>
                      {option.value === value ? <Check className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
                    </button>
                  ))}
                </div>
                {categoryFiltered.length === 0 && !canApplyQuery ? (
                  <p className="px-2 py-8 text-center text-xs text-[var(--text-tertiary)]">{emptyLabel}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  )
}
