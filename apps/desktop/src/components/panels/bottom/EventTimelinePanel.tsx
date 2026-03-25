import { useEffect, useMemo, useRef } from 'react'
import { PanelFrame } from '../../ui/PanelFrame'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID } from '../../../lib/events/timeline'
import type { EventScript } from '../../../lib/events/types'
import { cx } from '../../../lib/cx'

type EventTimelinePanelProps = {
  locale: 'zh-CN' | 'en-US'
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
  currentCommandId: string | null
  onSelectTimelineEntry: (entryId: string) => void
  onActivateTimelineEntry: (entryId: string) => void
}

function getToneClass(kind: ReturnType<typeof buildEventTimelineEntries>[number]['kind']) {
  switch (kind) {
    case 'dialogue':
      return 'border-[color-mix(in_srgb,var(--warning)_45%,transparent)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--bg-panel))]'
    case 'message':
      return 'border-[color-mix(in_srgb,var(--success)_40%,transparent)] bg-[color-mix(in_srgb,var(--success)_10%,var(--bg-panel))]'
    case 'choice':
      return 'border-[color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-panel))]'
    case 'branch':
      return 'border-[color-mix(in_srgb,var(--danger)_36%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,var(--bg-panel))]'
    case 'timing':
      return 'border-[color-mix(in_srgb,var(--text-secondary)_28%,transparent)] bg-[var(--bg-panel)]'
    case 'setup':
      return 'border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,var(--bg-panel))]'
    default:
      return 'border-[var(--border-color)] bg-[var(--bg-panel)]'
  }
}

export function EventTimelinePanel({
  locale,
  selectedEvent,
  selectedTimelineEntryId,
  currentCommandId,
  onSelectTimelineEntry,
  onActivateTimelineEntry,
}: EventTimelinePanelProps) {
  const labels =
    locale === 'zh-CN'
      ? {
          title: '事件脚本时间轴',
          subtitle: '线性脚本按顺序排布，点击任意命令查看细节。',
          current: '当前',
          empty: '这个事件没有后续脚本命令。',
          setup: '场景初始化',
        }
      : {
          title: 'Script Timeline',
          subtitle: 'Commands stay linear. Click any step to inspect it.',
          current: 'Current',
          empty: 'This event has no playable commands.',
          setup: 'Scene Setup',
        }

  const entries = buildEventTimelineEntries(selectedEvent, locale)
  const entryRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const activeEntryId = currentCommandId ?? selectedTimelineEntryId
  const activeIndex = useMemo(
    () => entries.findIndex((entry) => entry.id === activeEntryId),
    [activeEntryId, entries],
  )

  useEffect(() => {
    if (!activeEntryId) {
      return
    }

    entryRefs.current[activeEntryId]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    })
  }, [activeEntryId])

  return (
    <PanelFrame
      title={labels.title}
      subtitle={labels.subtitle}
      bodyClassName="p-3"
      headerAction={<span className="dock-chip">{selectedEvent?.commands.length ?? 0}</span>}
    >
      {entries.length ? (
        <div className="relative">
          <div className="pointer-events-none absolute left-0 right-0 top-[46px] h-px bg-[linear-gradient(90deg,transparent,var(--border-color),transparent)]" />
          <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-2 pt-1">
            {entries.map((entry, index) => {
              const isSelected = entry.id === selectedTimelineEntryId
              const isCurrent = entry.command != null && currentCommandId === entry.command.id
              const isComplete = activeIndex >= 0 && index <= activeIndex
              const rawLabel = entry.id === EVENT_SETUP_ENTRY_ID ? labels.setup : entry.kind

              return (
                <button
                  key={entry.id}
                  type="button"
                  ref={(node) => {
                    entryRefs.current[entry.id] = node
                  }}
                  className={cx(
                    'group relative flex h-[118px] min-w-[184px] max-w-[220px] flex-col justify-between rounded-[24px] border px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-panel)]',
                    getToneClass(entry.kind),
                    isSelected && 'ring-2 ring-[color-mix(in_srgb,var(--accent)_72%,transparent)]',
                    isCurrent && 'border-[color-mix(in_srgb,var(--accent)_72%,transparent)] shadow-[var(--shadow-panel)]',
                  )}
                  onClick={() => {
                    onSelectTimelineEntry(entry.id)
                    onActivateTimelineEntry(entry.id)
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            'flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.14em]',
                            isComplete
                              ? 'border-[color-mix(in_srgb,var(--accent)_55%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--text-primary)]'
                              : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-secondary)]',
                          )}
                        >
                          {entry.id === EVENT_SETUP_ENTRY_ID ? 'S' : index}
                        </span>
                        <span className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                          {rawLabel}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-1 text-sm font-semibold text-[var(--text-primary)]">{entry.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{entry.detail}</p>
                    </div>
                    {isCurrent ? <span className="dock-chip shrink-0">{labels.current}</span> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={cx(
                        'h-2 flex-1 rounded-full transition-colors',
                        isCurrent
                          ? 'bg-[linear-gradient(90deg,var(--accent),color-mix(in_srgb,var(--accent)_32%,transparent))]'
                          : isComplete
                            ? 'bg-[color-mix(in_srgb,var(--accent)_26%,transparent)]'
                            : 'bg-[var(--bg-panel-muted)]',
                      )}
                    />
                    <span className="text-[10px] font-medium text-[var(--text-tertiary)]">{index + 1}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[132px] items-center justify-center rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
          {labels.empty}
        </div>
      )}
    </PanelFrame>
  )
}
