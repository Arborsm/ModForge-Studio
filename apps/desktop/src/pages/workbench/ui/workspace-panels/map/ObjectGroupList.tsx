import { ChevronDown, Eye, EyeOff, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FocusedMapObjectTarget } from '@entities/map'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { formatObjectPreviewMeta, getObjectDisplayName, getObjectInteractionTag, type ObjectGroupListItem } from '../common/rightShared'

type ObjectGroupListVariant = 'panel' | 'dock'

const objectGroupCardClassName = {
  panel: 'overflow-hidden rounded-xl bg-surface-panel-muted',
  dock: 'panel-section-muted panel-section overflow-hidden',
} satisfies Record<ObjectGroupListVariant, string>

const objectGroupSectionClassName = {
  panel: 'overflow-hidden rounded-xl bg-surface-panel-muted',
  dock: 'panel-section-muted panel-section overflow-hidden',
} satisfies Record<ObjectGroupListVariant, string>

const objectGroupEmptyStateClassName = {
  panel: 'rounded-xl border border-dashed border-border-subtle px-4 py-5 text-sm text-text-secondary',
  dock: 'panel-empty-state',
} satisfies Record<ObjectGroupListVariant, string>

function ObjectGroupCard({
  item,
  focusedObjectTarget,
  onFocusObject,
  variant,
}: {
  item: ObjectGroupListItem
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
  variant: ObjectGroupListVariant
}) {
  const copy = useEditorCopy()
  return (
    <div className={objectGroupCardClassName[variant]}>
      <div className="flex items-start justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="text-text-primary truncate text-sm font-semibold">{item.name}</p>
          <p className="text-text-secondary text-meta-px mt-1">
            {copy.rightDock.objectGroupSummary(item.objectCount, item.interactionCount, item.pointCount)}
          </p>
          {item.propertyKeys.length ? (
            <p className="text-text-tertiary text-meta-px mt-1 truncate">{item.propertyKeys.join(' / ')}</p>
          ) : null}
        </div>
        <button type="button" className="shrink-0" onClick={() => item.setVisible(!item.visible)}>
          {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 opacity-60" />}
        </button>
      </div>

      {item.previewObjects.length ? (
        <div className="border-border-subtle border-t px-2 py-2">
          <div className="space-y-2">
            {item.previewObjects.map((object) => {
              const interactionTag = getObjectInteractionTag(object)
              const isFocused = focusedObjectTarget?.groupId === item.group.id && focusedObjectTarget?.objectId === object.id
              return (
                <button
                  key={object.id}
                  type="button"
                  className={cx(
                    variant === 'dock'
                      ? 'panel-list-card panel-list-card-interactive w-full rounded-lg px-3 py-2 text-left'
                      : 'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                    isFocused
                      ? variant === 'dock'
                        ? 'panel-list-card-active'
                        : 'border-accent bg-[color-mix(in_srgb,var(--accent)_16%,var(--bg-panel))]'
                      : variant === 'dock'
                        ? 'hover:bg-[color-mix(in_srgb,var(--bg-active)_66%,transparent)]'
                        : 'border-border-subtle bg-surface-panel hover:bg-surface-active',
                  )}
                  onClick={() => onFocusObject(item.group.id, object.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-text-primary truncate text-xs font-semibold">{getObjectDisplayName(object, copy)}</p>
                      <p className="text-text-secondary text-meta-px mt-1 truncate">{formatObjectPreviewMeta(object, copy)}</p>
                    </div>
                    <span className="dock-chip shrink-0">{interactionTag ?? object.type ?? `#${object.id}`}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {item.group.objects.length > item.previewObjects.length ? (
            <p className="text-text-tertiary text-meta-px px-1 pt-2">+{item.group.objects.length - item.previewObjects.length}</p>
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
  focusedObjectTarget,
  onFocusObject,
  variant = 'panel',
}: {
  items: ObjectGroupListItem[]
  filterPlaceholder: string
  emptyMessage: string
  focusedObjectTarget: FocusedMapObjectTarget | null
  onFocusObject: (groupId: number, objectId: number) => void
  variant?: ObjectGroupListVariant
}) {
  const copy = useEditorCopy()
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
        <Search className="text-text-tertiary pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
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
                  focusedObjectTarget={focusedObjectTarget}
                  onFocusObject={onFocusObject}
                  variant={variant}
                />
              )
            }

            return (
              <section key={entry.groupLabel} className={objectGroupSectionClassName[variant]}>
                <button
                  type="button"
                  className="hover:bg-surface-active flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                  onClick={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [entry.groupLabel]: !isCollapsed,
                    }))
                  }
                >
                  <div className="min-w-0">
                    <p className="text-text-primary tracking-ui-wider truncate text-xs font-semibold uppercase">{entry.groupLabel}</p>
                    <p className="text-text-secondary text-meta-px">
                      {copy.rightDock.objectGroupCollectionSummary(
                        entry.items.length,
                        entry.objectCount,
                        entry.interactionCount,
                        entry.pointCount,
                      )}
                    </p>
                  </div>
                  <ChevronDown className={cx('h-4 w-4 shrink-0 text-text-secondary transition-transform', !isCollapsed && 'rotate-180')} />
                </button>

                {!isCollapsed ? (
                  <div className="border-border-subtle space-y-2 border-t p-2">
                    {entry.items.map((item) => (
                      <ObjectGroupCard
                        key={item.id}
                        item={item}
                        focusedObjectTarget={focusedObjectTarget}
                        onFocusObject={onFocusObject}
                        variant={variant}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      ) : (
        <div className={objectGroupEmptyStateClassName[variant]}>{emptyMessage}</div>
      )}
    </div>
  )
}
