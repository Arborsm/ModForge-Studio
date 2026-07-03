import { PanelFrame } from '@shared/ui/PanelFrame'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID } from '@entities/event'
import type { EventScript } from '@entities/event'
import { PanelSection } from '@shared/ui/PanelSection'
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
    <PanelFrame title={labels.inspectorTitle} subtitle={selectedEvent?.eventId ?? labels.inspectorEmpty} bodyClassName="p-3">
      <div className="space-y-3">
        <PanelSection title={labels.inspectorSummary}>
          <p className="mt-2 text-sm font-semibold text-(--text-primary)">{selectedEntry?.title ?? labels.inspectorEmpty}</p>
          <p className="mt-2 text-xs leading-5 text-(--text-secondary)">{selectedEntry?.detail ?? labels.inspectorEmpty}</p>
        </PanelSection>

        {selectedEvent && isSetupEntry ? (
          <PanelSection>
            <div className="grid gap-3 md:grid-cols-2">
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
          </PanelSection>
        ) : null}

        {!isSetupEntry && command ? (
          <PanelSection>
            <div className="grid gap-3 md:grid-cols-2">
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
                <div className="mt-2 space-y-2">
                  {command.choices.map((choice, index) => (
                    <div key={choice.id} className="panel-list-card px-3 py-2 text-sm text-(--text-primary)">
                      {index + 1}. {choice.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </PanelSection>
        ) : null}

        {!isSetupEntry && command ? (
          <PanelSection title={labels.inspectorArgs} bodyClassName="space-y-2">
            {command.args.map((arg, index) => (
              <div key={`${command.id}:arg:${index}`} className="panel-list-card grid grid-cols-[56px_minmax(0,1fr)] gap-3 px-3 py-2">
                <span className="text-[11px] font-semibold tracking-[0.14em] text-(--text-secondary) uppercase">arg {index}</span>
                <span className="text-sm break-all text-(--text-primary)">{arg || labels.inspectorNone}</span>
              </div>
            ))}
          </PanelSection>
        ) : null}

        {!isSetupEntry && selectedEntry?.command?.raw ? (
          <PanelSection title={labels.inspectorRaw}>
            <pre className="mt-2 overflow-auto text-xs leading-5 break-all whitespace-pre-wrap text-(--text-primary)">
              {selectedEntry.command.raw}
            </pre>
          </PanelSection>
        ) : null}
      </div>
    </PanelFrame>
  )
}
