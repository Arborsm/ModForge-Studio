import { PanelFrame } from '../../ui/PanelFrame'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID } from '../../../lib/events/timeline'
import type { EventScript } from '../../../lib/events/types'

type EventCommandInspectorPanelProps = {
  locale: 'zh-CN' | 'en-US'
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
}

export function EventCommandInspectorPanel({
  locale,
  selectedEvent,
  selectedTimelineEntryId,
}: EventCommandInspectorPanelProps) {
  const labels =
    locale === 'zh-CN'
      ? {
          title: '命令检查器',
          empty: '选择时间轴命令后在这里查看参数和原始脚本。',
          raw: '原始脚本',
          music: '音乐',
          camera: '镜头',
          actors: '角色',
        }
      : {
          title: 'Command Inspector',
          empty: 'Select a timeline step to inspect its arguments and raw script.',
          raw: 'Raw Script',
          music: 'Music',
          camera: 'Camera',
          actors: 'Actors',
        }

  const selectedEntry =
    buildEventTimelineEntries(selectedEvent, locale).find((entry) => entry.id === selectedTimelineEntryId) ?? null
  const isSetupEntry = selectedEntry?.id === EVENT_SETUP_ENTRY_ID

  return (
    <PanelFrame title={labels.title} subtitle={selectedEvent?.eventId ?? labels.empty} bodyClassName="p-3">
      <div className="space-y-3">
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{selectedEntry?.title ?? labels.empty}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{selectedEntry?.detail ?? labels.empty}</p>
        </div>

        {selectedEvent && isSetupEntry ? (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.music}</p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedEvent.scene.musicCue ?? 'none'}</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.camera}</p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedEvent.scene.cameraInstruction ?? 'follow'}</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.actors}</p>
            <p className="mt-2 text-sm text-[var(--text-primary)]">{selectedEvent.scene.actors.length}</p>
          </div>
        ) : null}

        {!isSetupEntry && selectedEntry?.command?.raw ? (
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.raw}</p>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-[var(--text-primary)]">
              {selectedEntry.command.raw}
            </pre>
          </div>
        ) : null}
      </div>
    </PanelFrame>
  )
}
