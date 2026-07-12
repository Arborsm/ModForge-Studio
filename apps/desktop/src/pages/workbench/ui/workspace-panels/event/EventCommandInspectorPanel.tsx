import { PanelFrame } from '@shared/ui/PanelFrame'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID } from '@entities/event'
import type { EventScript } from '@entities/event'
import { useEventStageCopy } from '@locales/provider'

type EventCommandInspectorPanelProps = {
  locale: 'zh-CN' | 'en-US'
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
}

function renderValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim()
  return normalized ? normalized : fallback
}

export function EventCommandInspectorPanel({ selectedEvent, selectedTimelineEntryId }: EventCommandInspectorPanelProps) {
  const workflowCopy = useEventStageCopy().workflow
  const labels = workflowCopy.workspacePanels
  const selectedEntry =
    buildEventTimelineEntries(selectedEvent, {
      setup: workflowCopy.scriptTimeline.sceneSetup,
      music: workflowCopy.scriptTimeline.music,
      camera: workflowCopy.scriptTimeline.camera,
      actors: workflowCopy.scriptTimeline.actors,
    }).find((entry) => entry.id === selectedTimelineEntryId) ?? null
  const isSetupEntry = selectedEntry?.id === EVENT_SETUP_ENTRY_ID
  const command = selectedEntry?.command ?? null

  return (
    <PanelFrame flat title={labels.inspectorTitle} subtitle={selectedEvent?.eventId ?? labels.inspectorEmpty} bodyClassName="p-3">
      <div className="detail-sections-stack">
        <section>
          <p className="panel-section-title">{labels.inspectorSummary}</p>
          <p className="mt-2 text-sm font-semibold text-(--text-primary)">{selectedEntry?.title ?? labels.inspectorEmpty}</p>
          <p className="mt-2 text-xs leading-5 text-(--text-secondary)">{selectedEntry?.detail ?? labels.inspectorEmpty}</p>
        </section>

        {selectedEvent && isSetupEntry ? (
          <section>
            <p className="panel-section-title">{labels.inspectorParameters}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorMusic}</p>
                <p className="mt-1 text-sm text-(--text-primary)">{renderValue(selectedEvent.scene.musicCue, labels.inspectorNone)}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorCamera}</p>
                <p className="mt-1 text-sm text-(--text-primary)">
                  {renderValue(selectedEvent.scene.cameraInstruction, labels.inspectorNone)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorActors}</p>
                <p className="mt-1 text-sm text-(--text-primary)">{selectedEvent.scene.actors.length}</p>
              </div>
            </div>
          </section>
        ) : null}

        {!isSetupEntry && command ? (
          <section>
            <p className="panel-section-title">{labels.inspectorParameters}</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorCommand}</p>
                <p className="mt-1 text-sm text-(--text-primary)">{command.command}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorKind}</p>
                <p className="mt-1 text-sm text-(--text-primary)">{command.kind}</p>
              </div>

              {command.actorName ? (
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorActor}</p>
                  <p className="mt-1 text-sm text-(--text-primary)">{command.actorName}</p>
                </div>
              ) : null}

              {command.targetEventKey ? (
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorTarget}</p>
                  <p className="mt-1 text-sm text-(--text-primary)">{command.targetEventKey}</p>
                </div>
              ) : null}
            </div>

            {command.text ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorText}</p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-(--text-primary)">{command.text}</p>
              </div>
            ) : null}

            {command.prompt ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorQuestion}</p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-(--text-primary)">{command.prompt}</p>
              </div>
            ) : null}

            {command.choices?.length ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold tracking-[0.18em] text-(--text-secondary) uppercase">{labels.inspectorChoices}</p>
                <div className="mt-2 flex flex-col">
                  {command.choices.map((choice, index) => (
                    <div
                      key={choice.id}
                      className="flex items-start justify-between gap-3 border-b border-(--border-color)/50 py-2.5 last:border-b-0"
                    >
                      <span className="text-xs text-(--text-secondary)">{index + 1}</span>
                      <span className="min-w-0 flex-1 text-sm text-(--text-primary)">{choice.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {!isSetupEntry && command && command.args.length ? (
          <section>
            <p className="panel-section-title">{labels.inspectorArgs}</p>
            <div className="mt-2 flex flex-col">
              {command.args.map((arg, index) => (
                <div
                  key={`${command.id}:arg:${index}`}
                  className="flex items-start justify-between gap-3 border-b border-(--border-color)/50 py-2.5 last:border-b-0"
                >
                  <span className="text-[11px] font-semibold tracking-[0.14em] text-(--text-secondary) uppercase">arg {index}</span>
                  <span className="min-w-0 flex-1 text-sm break-all text-(--text-primary)">{arg || labels.inspectorNone}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {!isSetupEntry && selectedEntry?.command?.raw ? (
          <section>
            <p className="panel-section-title">{labels.inspectorRaw}</p>
            <pre className="mt-2 overflow-auto text-xs leading-5 break-all whitespace-pre-wrap text-(--text-primary)">
              {selectedEntry.command.raw}
            </pre>
          </section>
        ) : null}
      </div>
    </PanelFrame>
  )
}
