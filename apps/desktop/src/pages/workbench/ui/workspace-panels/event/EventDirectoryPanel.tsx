import { PanelFrame } from '@shared/ui/PanelFrame'
import { cx } from '@shared/lib/helper'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import type { EventScript } from '@entities/event'
import { ModSourceList } from '@shared/ui/ModSourceList'
import { useEventStageCopy } from '@locales/provider'

type EventDirectoryPanelProps = {
  locale: 'zh-CN' | 'en-US'
  events: EventScript[]
  selectedEventKey: string | null
  subtitle: string
  modSources?: ModSourceEntry[]
  onSelectEvent: (eventKey: string) => void
}

export function EventDirectoryPanel({ events, selectedEventKey, subtitle, modSources = [], onSelectEvent }: EventDirectoryPanelProps) {
  const labels = useEventStageCopy().workflow.workspacePanels

  return (
    <PanelFrame flat title={labels.directoryTitle} subtitle={subtitle} bodyClassName="p-3">
      <div className="space-y-3">
        {modSources.length ? (
          <div className="rounded-xl bg-(--bg-panel-muted) px-3 py-3">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.modSourcesTitle}</p>
            <div className="mt-3">
              <ModSourceList sources={modSources} variant="flat" />
            </div>
          </div>
        ) : null}
        <div className="max-h-[42vh] overflow-auto">
          {events.length ? (
            <div className="space-y-2">
              {events.map((event) => {
                const isActive = event.key === selectedEventKey

                return (
                  <button
                    key={event.key}
                    type="button"
                    className={cx('asset-row w-full text-left', isActive && 'asset-row-active')}
                    onClick={() => onSelectEvent(event.key)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-(--text-primary)">{event.eventId}</p>
                        <p className="mt-1 truncate text-xs text-(--text-secondary)">
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
            <div className="panel-empty-state">{labels.directoryEmpty}</div>
          )}
        </div>
      </div>
    </PanelFrame>
  )
}
