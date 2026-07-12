import { ChevronDown, Eye, EyeOff, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '@shared/lib/helper'
import type { VisibilityListItem } from '../common/rightShared'

type VisibilityListVariant = 'panel' | 'dock'

const visibilitySectionClassName = {
  panel: 'overflow-hidden rounded-xl bg-(--bg-panel-muted)',
  dock: 'panel-section-muted panel-section overflow-hidden',
} satisfies Record<VisibilityListVariant, string>

const visibilityEmptyStateClassName = {
  panel: 'rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)',
  dock: 'panel-empty-state',
} satisfies Record<VisibilityListVariant, string>

function VisibilityRow({
  name,
  meta,
  visible,
  active,
  onToggle,
}: {
  name: string
  meta: string
  visible: boolean
  active?: boolean
  onToggle: () => void
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 text-xs ${
        active ? 'bg-(--accent) text-white' : 'text-(--text-secondary) hover:bg-(--bg-active)'
      }`}
    >
      <div className="min-w-0">
        <p className={`truncate font-medium ${active ? 'text-white' : 'text-(--text-primary)'}`}>{name}</p>
        <p className="truncate text-[11px] opacity-80">{meta}</p>
      </div>
      <button type="button" className="shrink-0" onClick={onToggle}>
        {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-60" />}
      </button>
    </div>
  )
}

export function GroupedVisibilityList({
  items,
  filterPlaceholder,
  emptyMessage,
  variant = 'panel',
}: {
  items: VisibilityListItem[]
  filterPlaceholder: string
  emptyMessage: string
  variant?: VisibilityListVariant
}) {
  const [filterValue, setFilterValue] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const normalizedFilter = filterValue.trim().toLowerCase()
  const entries = useMemo(() => {
    const grouped = new Map<string, VisibilityListItem[]>()

    for (const item of items) {
      const haystack = `${item.groupLabel} ${item.name} ${item.meta}`.toLowerCase()
      if (normalizedFilter && !haystack.includes(normalizedFilter)) {
        continue
      }

      const current = grouped.get(item.groupLabel)
      if (current) {
        current.push(item)
      } else {
        grouped.set(item.groupLabel, [item])
      }
    }

    return Array.from(grouped.entries())
      .map(([groupLabel, groupItems]) => ({
        groupLabel,
        items: groupItems.sort(
          (left, right) =>
            Number(right.visible) - Number(left.visible) ||
            Number(Boolean(right.active)) - Number(Boolean(left.active)) ||
            left.name.localeCompare(right.name),
        ),
        grouped: groupItems.length > 1,
      }))
      .sort((left, right) => Number(right.grouped) - Number(left.grouped) || left.groupLabel.localeCompare(right.groupLabel))
  }, [items, normalizedFilter])

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--text-tertiary)" />
        <input
          className="control-input pl-9"
          value={filterValue}
          onChange={(event) => setFilterValue(event.target.value)}
          placeholder={filterPlaceholder}
          spellCheck={false}
        />
      </div>

      {entries.length ? (
        <div className="space-y-3">
          {entries.map((group) => {
            const isCollapsed = collapsedGroups[group.groupLabel] ?? true
            const visibleCount = group.items.filter((item) => item.visible).length

            if (!group.grouped) {
              const item = group.items[0]
              return (
                <div key={item.id} className={visibilitySectionClassName[variant]}>
                  <VisibilityRow
                    name={item.name}
                    meta={item.meta}
                    visible={item.visible}
                    active={item.active}
                    onToggle={() => item.setVisible(!item.visible)}
                  />
                </div>
              )
            }

            return (
              <section key={group.groupLabel} className={visibilitySectionClassName[variant]}>
                <div className="flex items-center gap-2 border-b border-(--border-color) px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                    onClick={() =>
                      setCollapsedGroups((current) => ({
                        ...current,
                        [group.groupLabel]: !isCollapsed,
                      }))
                    }
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold tracking-[0.16em] text-(--text-primary) uppercase">{group.groupLabel}</p>
                      <p className="text-[11px] text-(--text-secondary)">
                        {visibleCount}/{group.items.length}
                      </p>
                    </div>
                    <ChevronDown
                      className={cx('h-4 w-4 shrink-0 text-(--text-secondary) transition-transform', !isCollapsed && 'rotate-180')}
                    />
                  </button>

                  <div className="flex shrink-0 gap-2 text-[10px] font-semibold tracking-[0.16em] text-(--text-secondary) uppercase">
                    <button type="button" onClick={() => group.items.forEach((item) => item.setVisible(true))}>
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => group.items.forEach((item) => item.setVisible(false))}>
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {!isCollapsed ? (
                  <div className="py-1">
                    {group.items.map((item) => (
                      <VisibilityRow
                        key={item.id}
                        name={item.name}
                        meta={item.meta}
                        visible={item.visible}
                        active={item.active}
                        onToggle={() => item.setVisible(!item.visible)}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div className={visibilityEmptyStateClassName[variant]}>{emptyMessage}</div>
      )}
    </div>
  )
}
