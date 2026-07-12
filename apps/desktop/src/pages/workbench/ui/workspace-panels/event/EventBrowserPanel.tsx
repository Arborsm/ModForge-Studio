import { ChevronRight, Search } from 'lucide-react'
import type { EventAssetSummary } from '@entities/game/api'
import type { EventScript } from '@entities/event'
import type { BrowserSourceMode, ModBrowserEntry, ModBrowserGroup } from '@pages/workbench/workspaces/mod'
import { useEventStageCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { getLoadingMotionChildRevealProps } from '@shared/ui/loading-motion'

type EventBrowserPanelProps = {
  eventAssets: EventAssetSummary[]
  filteredEventAssets: EventAssetSummary[]
  browserSourceMode: BrowserSourceMode
  onBrowserSourceModeChange: (mode: BrowserSourceMode) => void
  modEventGroups: ModBrowserGroup<EventAssetSummary>[]
  activeModEventSelectionId: string | null
  activeEventAssetId: string | null
  events: EventScript[]
  selectedEventKey: string | null
  assetFilter: string
  onAssetFilterChange: (value: string) => void
  onOpenAsset: (asset: EventAssetSummary) => void
  onOpenModAsset: (entry: ModBrowserEntry<EventAssetSummary>) => void
  onSelectEvent: (eventKey: string) => void
}

function SourceSwitch({
  value,
  onChange,
  originalLabel,
  modLabel,
}: {
  value: BrowserSourceMode
  onChange: (mode: BrowserSourceMode) => void
  originalLabel: string
  modLabel: string
}) {
  return (
    <div className="flex gap-px rounded-[0.625rem] border border-(--border-color) bg-(--bg-panel-muted) p-px">
      {(
        [
          ['original', originalLabel],
          ['mod', modLabel],
        ] as const
      ).map(([mode, label]) => {
        const isActive = value === mode
        return (
          <button
            key={mode}
            type="button"
            className={cx(
              'flex-1 rounded-[0.5rem] py-1.5 text-xs font-semibold transition-colors',
              isActive
                ? 'bg-(--bg-panel) text-(--text-primary) shadow-[inset_0_-1.5px_0_0_var(--accent)]'
                : 'text-(--text-secondary) hover:bg-(--bg-hover) hover:text-(--text-primary)',
            )}
            onClick={() => onChange(mode)}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function locationDotClass(name: string) {
  const key = name.toLowerCase()
  if (key.includes('saloon')) {
    return 'bg-[#c47a3a]'
  }
  if (key.includes('beach')) {
    return 'bg-(--info)'
  }
  if (key.includes('farm')) {
    return 'bg-(--success)'
  }
  if (key.includes('mountain') || key.includes('mine')) {
    return 'bg-[#a78bfa]'
  }
  return 'bg-(--accent)'
}

function LocationDot({ name }: { name: string }) {
  return (
    <span
      className={cx(
        'h-2 w-2 shrink-0 rounded-full shadow-[0_0_0_1px_color-mix(in_srgb,var(--border-color)_50%,transparent)]',
        locationDotClass(name),
      )}
      aria-hidden="true"
    />
  )
}

function eventHint(event: EventScript) {
  const preconditions = event.preconditions.slice(1).join(' / ').trim()
  return preconditions || event.key
}

function filterEvents(events: EventScript[], filterText: string) {
  const needle = filterText.trim().toLowerCase()
  if (!needle) {
    return events
  }
  return events.filter((event) => {
    const haystack = `${event.eventId} ${event.key} ${event.preconditions.join(' ')}`.toLowerCase()
    return haystack.includes(needle)
  })
}

/**
 * Event catalog rail: source switch + hierarchical file → event rows.
 * Events under a file appear only after that file is active/loaded.
 */
export function EventBrowserPanel({
  eventAssets,
  filteredEventAssets,
  browserSourceMode,
  onBrowserSourceModeChange,
  modEventGroups,
  activeModEventSelectionId,
  activeEventAssetId,
  events,
  selectedEventKey,
  assetFilter,
  onAssetFilterChange,
  onOpenAsset,
  onOpenModAsset,
  onSelectEvent,
}: EventBrowserPanelProps) {
  const labels = useEventStageCopy().workflow.workspacePanels
  const emptyLabel = eventAssets.length ? labels.browserEmptyFiltered : labels.browserEmptyMissing
  const nestedEvents = filterEvents(events, assetFilter)

  return (
    <aside className="item-workspace-pane h-full">
      <div className="custom-scrollbar flex h-full min-h-0 flex-col overflow-auto p-4">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-(--text-tertiary)" />
          <input
            className="control-input bg-(--bg-panel-muted) pl-9"
            value={assetFilter}
            onChange={(event) => onAssetFilterChange(event.target.value)}
            placeholder={labels.browserPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mb-4">
          <SourceSwitch
            value={browserSourceMode}
            onChange={onBrowserSourceModeChange}
            originalLabel={labels.sourceOriginalLabel}
            modLabel={labels.sourceModLabel}
          />
        </div>

        <div className="min-h-0 flex-1" role="tree" aria-label={labels.browserTitle}>
          {browserSourceMode === 'mod' ? (
            modEventGroups.length ? (
              <div className="flex flex-col gap-3">
                {modEventGroups.map((group, groupIndex) => (
                  <section key={group.modPath}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 px-2">
                      <p className="truncate text-xs font-semibold text-(--text-secondary)">{group.modName}</p>
                      <span className="font-mono text-[11px] text-(--text-tertiary) tabular-nums">{group.items.length}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {group.items.map((entry, itemIndex) => {
                        const { value: asset } = entry
                        const isActive = entry.selectionId === activeModEventSelectionId
                        return (
                          <FileEventGroup
                            key={`${group.modId}:${asset.id}:${entry.selectionId}`}
                            asset={asset}
                            isActive={isActive}
                            eventCount={isActive ? nestedEvents.length : null}
                            events={isActive ? nestedEvents : []}
                            selectedEventKey={selectedEventKey}
                            revealIndex={groupIndex + itemIndex + 1}
                            onOpenFile={() => onOpenModAsset(entry)}
                            onSelectEvent={onSelectEvent}
                          />
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
                {labels.browserModEmpty}
              </div>
            )
          ) : filteredEventAssets.length ? (
            <div className="flex flex-col gap-0.5">
              {filteredEventAssets.map((asset, index) => {
                const isActive = asset.id === activeEventAssetId
                return (
                  <FileEventGroup
                    key={asset.id}
                    asset={asset}
                    isActive={isActive}
                    eventCount={isActive ? nestedEvents.length : null}
                    events={isActive ? nestedEvents : []}
                    selectedEventKey={selectedEventKey}
                    revealIndex={index}
                    onOpenFile={() => onOpenAsset(asset)}
                    onSelectEvent={onSelectEvent}
                  />
                )
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
              {emptyLabel}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function FileEventGroup({
  asset,
  isActive,
  eventCount,
  events,
  selectedEventKey,
  revealIndex,
  onOpenFile,
  onSelectEvent,
}: {
  asset: EventAssetSummary
  isActive: boolean
  eventCount: number | null
  events: EventScript[]
  selectedEventKey: string | null
  revealIndex: number
  onOpenFile: () => void
  onSelectEvent: (eventKey: string) => void
}) {
  const revealProps = getLoadingMotionChildRevealProps({
    index: revealIndex,
    className: 'mb-0.5',
  })

  return (
    <div {...revealProps} role="treeitem" aria-expanded={isActive}>
      <button
        type="button"
        className={cx(
          'grid w-full grid-cols-[1rem_0.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[0.625rem] border border-transparent px-2 py-1.5 text-left transition-colors',
          isActive ? 'bg-(--bg-panel-muted)' : 'hover:bg-(--bg-hover)',
        )}
        onClick={onOpenFile}
      >
        <ChevronRight
          className={cx('h-3.5 w-3.5 text-(--text-tertiary) transition-transform', isActive && 'rotate-90')}
          aria-hidden="true"
        />
        <LocationDot name={asset.name} />
        <span className="truncate text-[13px] font-semibold tracking-tight text-(--text-primary)">{asset.name}</span>
        <span className="font-mono text-[11px] font-semibold text-(--text-tertiary) tabular-nums">
          {eventCount != null ? eventCount : '·'}
        </span>
      </button>

      {isActive && events.length ? (
        <div className="mt-0.5 ml-2 flex flex-col gap-0.5" role="group">
          {events.map((event) => {
            const selected = event.key === selectedEventKey
            return (
              <button
                key={event.key}
                type="button"
                aria-pressed={selected}
                className={cx(
                  'grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[0.625rem] border border-transparent py-1.5 pr-2 pl-3 text-left transition-colors',
                  selected
                    ? 'border-[color-mix(in_srgb,var(--accent)_16%,transparent)] bg-(--accent-soft) shadow-[inset_2px_0_0_0_var(--accent)]'
                    : 'hover:bg-(--bg-hover)',
                )}
                onClick={() => onSelectEvent(event.key)}
              >
                <LocationDot name={asset.name} />
                <span className="min-w-0">
                  <span
                    className={cx(
                      'block truncate text-[12.5px] font-semibold leading-tight',
                      selected ? 'text-[color-mix(in_srgb,var(--accent)_72%,var(--text-primary))]' : 'text-(--text-primary)',
                    )}
                  >
                    {event.eventId}
                  </span>
                  <span className="mt-px block truncate font-mono text-[11px] leading-tight text-(--text-tertiary)">
                    {eventHint(event)}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-(--text-tertiary) tabular-nums">{event.commands.length}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
