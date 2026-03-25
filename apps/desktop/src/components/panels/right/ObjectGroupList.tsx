import { ChevronDown, Eye, EyeOff, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FocusedMapObjectTarget } from '../../MapViewport'
import { cx } from '../../../lib/cx'
import type { EditorCopy } from '../../../lib/editor-shell'
import { formatObjectPreviewMeta, getObjectDisplayName, getObjectInteractionTag, type ObjectGroupListItem } from './shared'

function ObjectGroupCard({
  item,
  copy,
  focusedObjectTarget,
  onFocusObject,
}: {
  item: ObjectGroupListItem
  copy: EditorCopy
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]">
      <div className="flex items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{item.name}</p>
          <p className="mt-1 text-[11px] text-[var(--text-secondary)]">
            {item.objectCount} {copy.rightDock.objectCount} / {item.interactionCount} Action / {item.pointCount} Point
          </p>
          {item.propertyKeys.length ? (
            <p className="mt-1 truncate text-[11px] text-[var(--text-tertiary)]">{item.propertyKeys.join(' / ')}</p>
          ) : null}
        </div>
        <button type="button" className="shrink-0" onClick={() => item.setVisible(!item.visible)}>
          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-60" />}
        </button>
      </div>

      {item.previewObjects.length ? (
        <div className="border-t border-[var(--border-color)] px-2 py-2">
          <div className="space-y-2">
            {item.previewObjects.map((object) => {
              const interactionTag = getObjectInteractionTag(object)
              const isFocused =
                focusedObjectTarget?.groupId === item.group.id && focusedObjectTarget?.objectId === object.id
              return (
                <button
                  key={object.id}
                  type="button"
                  className={cx(
                    'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    isFocused
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,var(--bg-panel))]'
                      : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-active)]',
                  )}
                  onClick={() => onFocusObject(item.group.id, object.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                        {getObjectDisplayName(object, copy)}
                      </p>
                      <p className="mt-1 truncate text-[11px] text-[var(--text-secondary)]">
                        {formatObjectPreviewMeta(object, copy)}
                      </p>
                    </div>
                    <span className="dock-chip shrink-0">{interactionTag ?? object.type ?? `#${object.id}`}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {item.group.objects.length > item.previewObjects.length ? (
            <p className="px-1 pt-2 text-[11px] text-[var(--text-tertiary)]">
              +{item.group.objects.length - item.previewObjects.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function GroupedObjectGroupList({
  items,
  filterPlaceholder,
  emptyMessage,
  copy,
  focusedObjectTarget,
  onFocusObject,
}: {
  items: ObjectGroupListItem[]
  filterPlaceholder: string
  emptyMessage: string
  copy: EditorCopy
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
}) {
  const [filterValue, setFilterValue] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const normalizedFilter = filterValue.trim().toLowerCase()
  const entries = useMemo(() => {
    const grouped = new Map<string, ObjectGroupListItem[]>()

    for (const item of items) {
      const objectSearch = item.group.objects
        .slice(0, 24)
        .map((object) => `${object.name} ${object.type} ${Object.keys(object.properties).join(' ')}`)
        .join(' ')
      const haystack = `${item.groupLabel} ${item.name} ${item.propertyKeys.join(' ')} ${objectSearch}`.toLowerCase()
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
            right.interactionCount - left.interactionCount ||
            right.objectCount - left.objectCount ||
            left.name.localeCompare(right.name),
        ),
        objectCount: groupItems.reduce((total, item) => total + item.objectCount, 0),
        interactionCount: groupItems.reduce((total, item) => total + item.interactionCount, 0),
        pointCount: groupItems.reduce((total, item) => total + item.pointCount, 0),
        grouped: groupItems.length > 1,
      }))
      .sort((left, right) => Number(right.grouped) - Number(left.grouped) || left.groupLabel.localeCompare(right.groupLabel))
  }, [items, normalizedFilter])

  return (
    <div className="space-y-3 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
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
          {entries.map((entry) => {
            const isCollapsed = collapsedGroups[entry.groupLabel] ?? true

            if (!entry.grouped) {
              return (
                <ObjectGroupCard
                  key={entry.items[0].id}
                  item={entry.items[0]}
                  copy={copy}
                  focusedObjectTarget={focusedObjectTarget}
                  onFocusObject={onFocusObject}
                />
              )
            }

            return (
              <section
                key={entry.groupLabel}
                className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)]"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-active)]"
                  onClick={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [entry.groupLabel]: !isCollapsed,
                    }))
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">
                      {entry.groupLabel}
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {entry.items.length} / {entry.objectCount} {copy.rightDock.objectCount} / {entry.interactionCount} Action / {entry.pointCount} Point
                    </p>
                  </div>
                  <ChevronDown
                    className={cx(
                      'h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform',
                      !isCollapsed && 'rotate-180',
                    )}
                  />
                </button>

                {!isCollapsed ? (
                  <div className="space-y-2 border-t border-[var(--border-color)] p-2">
                    {entry.items.map((item) => (
                      <ObjectGroupCard
                        key={item.id}
                        item={item}
                        copy={copy}
                        focusedObjectTarget={focusedObjectTarget}
                        onFocusObject={onFocusObject}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
          {emptyMessage}
        </div>
      )}
    </div>
  )
}
