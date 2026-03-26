import { PanelFrame } from '../../ui/PanelFrame'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID } from '../../../lib/events/timeline'
import type { EventScript } from '../../../lib/events/types'

type EventCommandInspectorPanelProps = {
  locale: 'zh-CN' | 'en-US'
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
}

function buildInspectorLabels(locale: 'zh-CN' | 'en-US') {
  return locale === 'zh-CN'
    ? {
        title: '属性面板',
        empty: '从左侧脚本列表选择一条指令后，这里显示详细参数。',
        summary: '摘要',
        raw: '原始脚本',
        command: '命令',
        kind: '类型',
        actor: '角色',
        text: '文本',
        question: '问题',
        choices: '选项',
        target: '目标',
        args: '参数',
        music: '音乐',
        camera: '镜头',
        actors: '角色数',
        none: '无',
      }
    : {
        title: 'Inspector',
        empty: 'Select a command from the script list to inspect its parameters.',
        summary: 'Summary',
        raw: 'Raw Script',
        command: 'Command',
        kind: 'Kind',
        actor: 'Actor',
        text: 'Text',
        question: 'Question',
        choices: 'Choices',
        target: 'Target',
        args: 'Arguments',
        music: 'Music',
        camera: 'Camera',
        actors: 'Actors',
        none: 'None',
      }
}

function renderValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim()
  return normalized ? normalized : fallback
}

export function EventCommandInspectorPanel({
  locale,
  selectedEvent,
  selectedTimelineEntryId,
}: EventCommandInspectorPanelProps) {
  const labels = buildInspectorLabels(locale)
  const selectedEntry =
    buildEventTimelineEntries(selectedEvent, locale).find((entry) => entry.id === selectedTimelineEntryId) ?? null
  const isSetupEntry = selectedEntry?.id === EVENT_SETUP_ENTRY_ID
  const command = selectedEntry?.command ?? null

  return (
    <PanelFrame title={labels.title} subtitle={selectedEvent?.eventId ?? labels.empty} bodyClassName="p-3">
      <div className="space-y-3">
        <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.summary}</p>
          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">{selectedEntry?.title ?? labels.empty}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">{selectedEntry?.detail ?? labels.empty}</p>
        </section>

        {selectedEvent && isSetupEntry ? (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.music}</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{renderValue(selectedEvent.scene.musicCue, labels.none)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.camera}</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{renderValue(selectedEvent.scene.cameraInstruction, labels.none)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.actors}</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{selectedEvent.scene.actors.length}</p>
              </div>
            </div>
          </section>
        ) : null}

        {!isSetupEntry && command ? (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.command}</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{command.command}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.kind}</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{command.kind}</p>
              </div>

              {command.actorName ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.actor}</p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">{command.actorName}</p>
                </div>
              ) : null}

              {command.targetEventKey ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.target}</p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">{command.targetEventKey}</p>
                </div>
              ) : null}
            </div>

            {command.text ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.text}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{command.text}</p>
              </div>
            ) : null}

            {command.prompt ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.question}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{command.prompt}</p>
              </div>
            ) : null}

            {command.choices?.length ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.choices}</p>
                <div className="mt-2 space-y-2">
                  {command.choices.map((choice, index) => (
                    <div key={choice.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-2 text-sm text-[var(--text-primary)]">
                      {index + 1}. {choice.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isSetupEntry && command ? (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.args}</p>
            <div className="mt-2 space-y-2">
              {command.args.map((arg, index) => (
                <div key={`${command.id}:arg:${index}`} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">arg {index}</span>
                  <span className="break-all text-sm text-[var(--text-primary)]">{arg || labels.none}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!isSetupEntry && selectedEntry?.command?.raw ? (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{labels.raw}</p>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all text-xs leading-5 text-[var(--text-primary)]">
              {selectedEntry.command.raw}
            </pre>
          </section>
        ) : null}
      </div>
    </PanelFrame>
  )
}
