import { PanelFrame } from '@shared/ui/PanelFrame'
import { cx } from '@shared/lib/cx'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import type { EventScript } from '@entities/event'
import { ModSourceList } from '@shared/ui/ModSourceList'

type EventDirectoryPanelProps = {
  locale: 'zh-CN' | 'en-US'
  events: EventScript[]
  selectedEventKey: string | null
  subtitle: string
  modSources?: ModSourceEntry[]
  onSelectEvent: (eventKey: string) => void
}

export function EventDirectoryPanel({ locale, events, selectedEventKey, subtitle, modSources = [], onSelectEvent }: EventDirectoryPanelProps) {
  const labels =
    locale === 'zh-CN'
      ? {
          title: '事件目录',
          empty: '当前事件文件没有可解析的事件。',
        }
      : {
          title: 'Event Directory',
          empty: 'No events were parsed from this file.',
        }

  return (
    <PanelFrame title={labels.title} subtitle={subtitle} bodyClassName="p-3">
      <div className="space-y-3">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">Mod Sources</p>
          <div className="mt-3">
            <ModSourceList sources={modSources} />
          </div>
        </div>
        <div className="max-h-[42vh] overflow-auto">
        {events.length ? (
          <div className="space-y-2">
            {events.map((event) => {
              const isActive = event.key === selectedEventKey

              return (
                <button
                  key={event.key}
                  type="button"
                  className={cx(
                    'w-full rounded-2xl border px-3 py-3 text-left transition-colors',
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--bg-active)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-panel)] hover:bg-[var(--bg-elevated)]',
                  )}
                  onClick={() => onSelectEvent(event.key)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{event.eventId}</p>
                      <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
                        {event.preconditions.slice(1).join(' / ') || event.key}
                      </p>
                    </div>
                    <span className="dock-chip shrink-0">{event.commands.length}</span>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-5 text-sm text-[var(--text-secondary)]">
            {labels.empty}
          </div>
        )}
        </div>
      </div>
    </PanelFrame>
  )
}

