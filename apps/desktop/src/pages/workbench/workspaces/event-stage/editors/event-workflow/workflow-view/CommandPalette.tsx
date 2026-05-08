// 智能指令添加器

import { useState, useMemo, useEffect, useRef } from 'react'
import { Search, X, Command } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import { getAllSchemas } from '../workflow-model/commandSchemaRegistry'
import type { CommandCategory } from '../workflow-model/commandSchema'

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  dialogue: '对话',
  movement: '移动',
  visual: '视觉',
  audio: '音频',
  logic: '逻辑',
  scene: '场景',
  item: '物品',
  animation: '动画',
  other: '其他',
}

const CATEGORY_ORDER: CommandCategory[] = [
  'dialogue', 'movement', 'visual', 'audio', 'logic', 'scene', 'item', 'animation', 'other',
]

const SEMANTIC_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f97316',
  pink: '#ec4899',
  green: '#22c55e',
  cyan: '#06b6d4',
  yellow: '#eab308',
  red: '#ef4444',
  gray: '#6b7280',
}

export type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  onSelect: (commandKey: string) => void
  locale?: 'zh-CN' | 'en-US'
}

export function CommandPalette({ open, onClose, onSelect, locale = 'zh-CN' }: CommandPaletteProps) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<CommandCategory | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const onSelectRef = useRef(onSelect)
  onCloseRef.current = onClose
  onSelectRef.current = onSelect

  useEffect(() => {
    if (open) {
      setSearch('')
      setActiveCategory(null)
      setHighlightedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setHighlightedIndex(0)
  }, [search, activeCategory])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCloseRef.current()
      }
    }
    if (open) {
      document.addEventListener('mousedown', onClick)
      return () => document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const schemas = getAllSchemas()

  const grouped = useMemo(() => {
    const byCategory = new Map<CommandCategory, typeof schemas>()
    for (const cat of CATEGORY_ORDER) {
      byCategory.set(cat, [])
    }
    for (const s of schemas) {
      const list = byCategory.get(s.category) ?? []
      list.push(s)
      byCategory.set(s.category, list)
    }
    return byCategory
  }, [schemas])

  const filtered = useMemo(() => {
    if (!search.trim() && !activeCategory) return grouped
    const q = search.toLowerCase()
    const result = new Map<CommandCategory, typeof schemas>()
    for (const [cat, list] of grouped) {
      if (activeCategory && cat !== activeCategory) continue
      const filteredList = list.filter(
        (s) =>
          s.key.toLowerCase().includes(q) ||
          s.label.toLowerCase().includes(q) ||
          s.labelZh.toLowerCase().includes(q),
      )
      if (filteredList.length) result.set(cat, filteredList)
    }
    return result
  }, [grouped, search, activeCategory])

  const flattened = useMemo(() => {
    const items: typeof schemas = []
    for (const [, list] of filtered) {
      items.push(...list)
    }
    return items
  }, [filtered])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (!open) return

      const flat = flattened
      if (flat.length === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % flat.length)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          setHighlightedIndex((prev) => (prev - 1 + flat.length) % flat.length)
          break
        }
        case 'Enter': {
          e.preventDefault()
          const item = flat[highlightedIndex]
          if (item) {
            onSelectRef.current(item.key)
            onCloseRef.current()
          }
          break
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, highlightedIndex, flattened])

  useEffect(() => {
    const el = resultsRef.current?.querySelector('[data-cmd-highlight="true"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [highlightedIndex])

  if (!open) return null

  let globalIndex = 0

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/20 pt-[15vh]"
    >
      <div
        ref={containerRef}
        className="flex w-[640px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[var(--shadow-float)]"
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-[var(--border-color)] px-3 py-2"
        >
          <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            type="text"
            placeholder={locale === 'zh-CN' ? '搜索命令或按分类浏览...' : 'Search commands or browse by category...'}
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="rounded p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
              onClick={() => { setSearch(''); inputRef.current?.focus() }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            className="rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category filters */}
        <div className="flex gap-1 border-b border-[var(--border-color)] px-3 py-1.5 overflow-x-auto"
        >
          <button
            type="button"
            className={cx(
              'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
              activeCategory === null
                ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                : 'bg-[var(--bg-panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
            )}
            onClick={() => setActiveCategory(null)}
          >
            {locale === 'zh-CN' ? '全部' : 'All'}
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = grouped.get(cat)?.length ?? 0
            if (count === 0) return null
            return (
              <button
                key={cat}
                type="button"
                className={cx(
                  'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                  activeCategory === cat
                    ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                    : 'bg-[var(--bg-panel-muted)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                )}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            )
          })}
        </div>

        {/* Results */}
        <div ref={resultsRef} className="max-h-[50vh] overflow-y-auto p-2"
        >
          {Array.from(filtered).length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-[var(--text-tertiary)]"
            >
              <Command className="h-8 w-8 opacity-40" />
              <p className="mt-2 text-sm">{locale === 'zh-CN' ? '未找到命令' : 'No commands found'}</p>
            </div>
          )}
          {Array.from(filtered).map(([cat, list]) => (
            <div key={cat} className="mb-2"
            >
              <div className="sticky top-0 mb-1 bg-[var(--bg-panel)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"
              >
                {CATEGORY_LABELS[cat]} ({list.length})
              </div>
              <div className="grid grid-cols-2 gap-1"
              >
                {list.map((schema) => {
                  const isHighlighted = globalIndex === highlightedIndex
                  const itemIndex = globalIndex
                  globalIndex++
                  return (
                    <button
                      key={schema.key}
                      type="button"
                      data-cmd-highlight={isHighlighted}
                      className={cx(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-all',
                        isHighlighted
                          ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_50%,transparent)]'
                          : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))] hover:bg-[color-mix(in_srgb,var(--accent-soft)_40%,transparent)]',
                      )}
                      onClick={() => { onSelect(schema.key); onClose() }}
                      onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    >
                      <div
                        className={cx(
                          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                        )}
                        style={{
                          backgroundColor: `${SEMANTIC_COLORS[schema.color] ?? '#6b7280'}26`,
                          color: SEMANTIC_COLORS[schema.color] ?? '#6b7280',
                        }}
                      >
                        {schema.label.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0"
                      >
                        <div className="text-xs font-medium text-[var(--text-primary)]">
                          {locale === 'zh-CN' ? schema.labelZh : schema.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] truncate">{schema.key}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
