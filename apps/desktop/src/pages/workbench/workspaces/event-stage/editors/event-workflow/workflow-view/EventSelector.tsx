// 事件选择下拉

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, FileText, Sparkles } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useEventStageCopy } from '@locales/provider'

export type EventSelectorProps = {
  events: Array<{ key: string; isModified?: boolean }>
  selectedKey: string | null
  onSelect: (key: string) => void
  locale?: 'zh-CN' | 'en-US'
  className?: string
}

export function EventSelector({ events, selectedKey, onSelect, className }: EventSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const copy = useEventStageCopy().workflow.eventSelector

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return events
    const q = search.toLowerCase()
    return events.filter((e) => e.key.toLowerCase().includes(q))
  }, [events, search])

  const selectedLabel = selectedKey ?? copy.placeholder

  return (
    <div ref={containerRef} className={cx('relative', className)}>
      <button
        type="button"
        className={cx(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all',
          open
            ? 'border-accent bg-surface-active shadow-sm'
            : 'border-border-subtle bg-surface-panel hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
        )}
        onClick={() => setOpen(!open)}
      >
        <FileText className="text-text-tertiary h-3.5 w-3.5 shrink-0" />
        <span className={cx('min-w-0 flex-1 truncate text-xs', selectedKey ? 'font-medium text-text-primary' : 'text-text-tertiary')}>
          {selectedLabel}
        </span>
        {events.find((e) => e.key === selectedKey)?.isModified && <Sparkles className="text-accent h-3 w-3 shrink-0" />}
        <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-border-subtle bg-surface-panel shadow-float absolute z-50 mt-1 w-full overflow-hidden rounded-lg border">
          <div className="border-border-subtle border-b p-2">
            <div className="border-border-subtle bg-surface-app flex items-center gap-1.5 rounded-md border px-2 py-1">
              <Search className="text-text-tertiary h-3 w-3" />
              <input
                type="text"
                autoFocus
                placeholder={copy.searchPlaceholder}
                className="text-text-primary placeholder:text-text-tertiary text-meta-px min-w-0 flex-1 bg-transparent outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.map((event) => (
              <button
                key={event.key}
                type="button"
                className={cx(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                  selectedKey === event.key ? 'bg-surface-active text-accent' : 'text-text-secondary hover:bg-surface-panel-muted',
                )}
                onClick={() => {
                  onSelect(event.key)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{event.key}</span>
                {event.isModified && <span className="bg-accent h-1.5 w-1.5 shrink-0 rounded-full" />}
              </button>
            ))}
            {filtered.length === 0 && <div className="text-text-tertiary text-meta-px px-3 py-4 text-center">{copy.empty}</div>}
          </div>
        </div>
      )}
    </div>
  )
}
