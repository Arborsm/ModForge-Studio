// 事件选择下拉

import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, FileText, Sparkles } from 'lucide-react'
import { cx } from '@shared/lib/cx'

export type EventSelectorProps = {
  events: Array<{ key: string; isModified?: boolean }>
  selectedKey: string | null
  onSelect: (key: string) => void
  locale?: 'zh-CN' | 'en-US'
  className?: string
}

export function EventSelector({
  events,
  selectedKey,
  onSelect,
  locale = 'zh-CN',
  className,
}: EventSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

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

  const selectedLabel = selectedKey ?? (locale === 'zh-CN' ? '选择事件...' : 'Select event...')

  return (
    <div ref={containerRef} className={cx('relative', className)}>
      <button
        type="button"
        className={cx(
          'flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all',
          open
            ? 'border-[var(--accent)] bg-[var(--bg-active)] shadow-sm'
            : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
        )}
        onClick={() => setOpen(!open)}
      >
        <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        <span className={cx('min-w-0 flex-1 truncate text-xs', selectedKey ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-tertiary)]')}>
          {selectedLabel}
        </span>
        {events.find((e) => e.key === selectedKey)?.isModified && (
          <Sparkles className="h-3 w-3 shrink-0 text-[var(--accent)]" />
        )}
        <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[var(--shadow-float)]"
        >
          <div className="border-b border-[var(--border-color)] p-2"
          >
            <div className="flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1"
            >
              <Search className="h-3 w-3 text-[var(--text-tertiary)]" />
              <input
                type="text"
                autoFocus
                placeholder={locale === 'zh-CN' ? '搜索事件...' : 'Search events...'}
                className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1"
          >
            {filtered.map((event) => (
              <button
                key={event.key}
                type="button"
                className={cx(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
                  selectedKey === event.key
                    ? 'bg-[var(--bg-active)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]',
                )}
                onClick={() => { onSelect(event.key); setOpen(false); setSearch('') }}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{event.key}</span>
                {event.isModified && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px] text-[var(--text-tertiary)]"
              >
                {locale === 'zh-CN' ? '未找到事件' : 'No events found'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
