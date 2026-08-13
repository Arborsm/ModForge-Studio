import {
  ArrowRightLeft,
  AudioLines,
  CircleDot,
  Compass,
  GitBranch,
  ListChecks,
  Map,
  MessageSquareText,
  PlayCircle,
  Settings2,
  TimerReset,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID, type EventScript, type EventTimelineEntry } from '@entities/event'
import { useEventStageCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import type { ModSourceEntry } from '@pages/workbench/workspaces/mod'
import { ModSourceList } from '@shared/ui/ModSourceList'

type DetailTab = 'timeline' | 'command' | 'scene'

type EventDetailPanelProps = {
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
  currentCommandId: string | null
  assetName?: string | null
  assetPath?: string | null
  modSources?: ModSourceEntry[]
  onSelectTimelineEntry: (entryId: string) => void
  onActivateTimelineEntry: (entryId: string) => void
}

function getEntryAppearance(entry: EventTimelineEntry) {
  if (entry.id === EVENT_SETUP_ENTRY_ID) {
    return {
      icon: Settings2,
      iconClassName: 'text-accent',
      accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_75%,white_25%)]',
      tone: 'setup' as const,
    }
  }

  const command = entry.command
  switch (command?.command) {
    case 'move':
    case 'positionOffset':
    case 'warp':
      return {
        icon: ArrowRightLeft,
        iconClassName: 'text-warning',
        accentClassName: 'bg-[color-mix(in_srgb,var(--warning)_72%,white_28%)]',
        tone: 'move' as const,
      }
    case 'faceDirection':
      return {
        icon: Compass,
        iconClassName: 'text-warning',
        accentClassName: 'bg-[color-mix(in_srgb,var(--warning)_60%,white_40%)]',
        tone: 'move' as const,
      }
    case 'playSound':
    case 'stopSound':
    case 'playMusic':
    case 'stopMusic':
      return {
        icon: AudioLines,
        iconClassName: 'text-success',
        accentClassName: 'bg-[color-mix(in_srgb,var(--success)_72%,white_28%)]',
        tone: 'audio' as const,
      }
    case 'viewport':
    case 'changeLocation':
    case 'changeToTemporaryMap':
      return {
        icon: Map,
        iconClassName: 'text-accent',
        accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_68%,white_32%)]',
        tone: 'action' as const,
      }
    case 'animate':
    case 'stopAnimation':
    case 'showFrame':
      return {
        icon: PlayCircle,
        iconClassName: 'text-accent',
        accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_58%,white_42%)]',
        tone: 'action' as const,
      }
    case 'question':
    case 'quickQuestion':
      return {
        icon: ListChecks,
        iconClassName: 'text-accent',
        accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_68%,white_32%)]',
        tone: 'dialogue' as const,
      }
    case 'fork':
    case 'switchEvent':
      return {
        icon: GitBranch,
        iconClassName: 'text-danger',
        accentClassName: 'bg-[color-mix(in_srgb,var(--danger)_60%,white_40%)]',
        tone: 'logic' as const,
      }
    case 'pause':
      return {
        icon: TimerReset,
        iconClassName: 'text-text-secondary',
        accentClassName: 'bg-[color-mix(in_srgb,var(--text-secondary)_55%,white_45%)]',
        tone: 'timing' as const,
      }
    default:
      if (entry.kind === 'dialogue' || entry.kind === 'message') {
        return {
          icon: MessageSquareText,
          iconClassName: 'text-warning',
          accentClassName: 'bg-[color-mix(in_srgb,var(--warning)_74%,white_26%)]',
          tone: 'dialogue' as const,
        }
      }
      if (entry.kind === 'choice') {
        return {
          icon: ListChecks,
          iconClassName: 'text-accent',
          accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_68%,white_32%)]',
          tone: 'dialogue' as const,
        }
      }
      if (entry.kind === 'branch') {
        return {
          icon: GitBranch,
          iconClassName: 'text-danger',
          accentClassName: 'bg-[color-mix(in_srgb,var(--danger)_60%,white_40%)]',
          tone: 'logic' as const,
        }
      }
      if (entry.kind === 'timing') {
        return {
          icon: TimerReset,
          iconClassName: 'text-text-secondary',
          accentClassName: 'bg-[color-mix(in_srgb,var(--text-secondary)_55%,white_45%)]',
          tone: 'timing' as const,
        }
      }
      return {
        icon: CircleDot,
        iconClassName: 'text-text-secondary',
        accentClassName: 'bg-[color-mix(in_srgb,var(--text-secondary)_42%,white_58%)]',
        tone: 'action' as const,
      }
  }
}

function getEntryPrimaryText(entry: EventTimelineEntry) {
  if (entry.id === EVENT_SETUP_ENTRY_ID) {
    return entry.title
  }
  const command = entry.command
  if (!command) {
    return entry.title
  }
  if (command.actorName) {
    return `${command.actorName} | ${entry.title.replace(/\s*\|\s*.+$/u, '')}`
  }
  return entry.title
}

function getEntrySecondaryText(entry: EventTimelineEntry, noDetailLabel: string) {
  if (entry.id === EVENT_SETUP_ENTRY_ID) {
    return entry.detail
  }
  const detail = entry.detail.replace(/\s+/gu, ' ').trim()
  return detail || noDetailLabel
}

function renderValue(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim()
  return normalized ? normalized : fallback
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pb-1">
      <p className="panel-section-title mb-1">{title}</p>
      {children}
    </section>
  )
}

function KvRow({ label, value, mono = false, block = false }: { label: string; value: string; mono?: boolean; block?: boolean }) {
  if (block) {
    return (
      <div className="border-border-subtle/50 flex flex-col gap-1.5 border-b py-2.5 last:border-b-0">
        <span className="text-text-secondary text-meta-px font-semibold tracking-wide uppercase">{label}</span>
        <span className="text-text-primary text-sm leading-6 whitespace-pre-wrap">{value}</span>
      </div>
    )
  }

  return (
    <div className="border-border-subtle/50 flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0">
      <span className="text-text-secondary text-meta-px shrink-0 font-semibold tracking-wide uppercase">{label}</span>
      <span
        className={cx(
          'max-w-[68%] text-right text-xs font-semibold wrap-break-word text-text-primary',
          mono && 'font-mono font-medium text-text-secondary',
        )}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Right-rail event detail: hero identity + timeline / command / scene tabs.
 * Merges former directory header, timeline, and command inspector into one pane.
 */
export function EventDetailPanel({
  selectedEvent,
  selectedTimelineEntryId,
  currentCommandId,
  assetName,
  assetPath,
  modSources = [],
  onSelectTimelineEntry,
  onActivateTimelineEntry,
}: EventDetailPanelProps) {
  const workflowCopy = useEventStageCopy().workflow
  const labels = workflowCopy.workspacePanels
  const timelineLabels = workflowCopy.scriptTimeline
  const [activeTab, setActiveTab] = useState<DetailTab>('timeline')

  const entries = buildEventTimelineEntries(selectedEvent, {
    setup: timelineLabels.sceneSetup,
    music: timelineLabels.music,
    camera: timelineLabels.camera,
    actors: timelineLabels.actors,
  })
  const selectedEntry = entries.find((entry) => entry.id === selectedTimelineEntryId) ?? null
  const isSetupEntry = selectedEntry?.id === EVENT_SETUP_ENTRY_ID
  const command = selectedEntry?.command ?? null
  const entryRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const activeEntryId = currentCommandId ?? selectedTimelineEntryId

  useEffect(() => {
    if (!activeEntryId || activeTab !== 'timeline') {
      return
    }
    entryRefs.current[activeEntryId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeEntryId, activeTab])

  if (!selectedEvent) {
    return (
      <section className="item-workspace-pane h-full">
        <div className="panel-body flex h-full min-h-0 items-center justify-center p-6 text-center">
          <p className="text-text-secondary max-w-md text-sm">{labels.detailEmpty}</p>
        </div>
      </section>
    )
  }

  const preconditions = selectedEvent.preconditions.slice(1).join(' · ').trim()
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'timeline', label: labels.detailTimelineTab },
    { id: 'command', label: labels.detailCommandTab },
    { id: 'scene', label: labels.detailSceneTab },
  ]

  return (
    <section className="item-workspace-pane h-full">
      <div className="border-border-subtle/65 shrink-0 border-b px-3.5 py-3.5">
        <h2 className="text-text-primary text-[1.35rem] leading-tight font-extrabold tracking-tight text-balance">
          {selectedEvent.eventId}
        </h2>
        <p className="text-text-tertiary mt-1.5 truncate font-mono text-xs">
          {selectedEvent.key}
          {assetName ? ` · ${assetName}` : ''}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {assetName ? (
            <span className="bg-accent-soft text-accent inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold">
              {assetName}
            </span>
          ) : null}
          <span className="bg-surface-panel-muted text-text-secondary inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold">
            {labels.detailCommandCount(selectedEvent.commands.length)}
          </span>
        </div>
        {preconditions ? (
          <p className="text-text-secondary mt-2.5 text-xs leading-relaxed">
            <span className="text-text-tertiary mr-1.5">{labels.detailPreconditions}</span>
            <span className="text-text-tertiary text-meta-px font-mono">{preconditions}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 px-3 pt-2.5" role="tablist" aria-label={labels.inspectorTitle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              tab.id === activeTab ? 'bg-accent-soft text-accent' : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="custom-scrollbar panel-body min-h-0 flex-1 overflow-auto">
        {activeTab === 'timeline' ? (
          entries.length ? (
            <div className="min-h-0">
              {entries.map((entry, index) => {
                const appearance = getEntryAppearance(entry)
                const isSelected = entry.id === selectedTimelineEntryId
                const isCurrent = entry.id !== EVENT_SETUP_ENTRY_ID && currentCommandId === entry.command?.id

                return (
                  <button
                    key={entry.id}
                    type="button"
                    ref={(node) => {
                      entryRefs.current[entry.id] = node
                    }}
                    aria-pressed={isSelected}
                    className={cx(
                      'grid w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-border-subtle/50 px-3 py-2.5 text-left transition-colors last:border-b-0',
                      isSelected && 'bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-panel))]',
                      isCurrent && 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg-panel))] shadow-[inset_2px_0_0_0_var(--accent)]',
                      !isSelected && !isCurrent && 'hover:bg-surface-hover',
                    )}
                    onClick={() => {
                      onSelectTimelineEntry(entry.id)
                      onActivateTimelineEntry(entry.id)
                    }}
                  >
                    <span
                      className={cx(
                        'inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full text-caption-px font-bold text-white tabular-nums',
                        appearance.accentClassName,
                      )}
                    >
                      {entry.id === EVENT_SETUP_ENTRY_ID ? 'S' : index}
                    </span>
                    <span className="min-w-0">
                      <span className="text-text-primary text-body-px block truncate font-semibold">{getEntryPrimaryText(entry)}</span>
                      <span className="text-text-secondary text-meta-px mt-0.5 block truncate">
                        {getEntrySecondaryText(entry, timelineLabels.noDetail)}
                      </span>
                    </span>
                    <span className="text-text-tertiary text-caption-px font-bold tracking-wider uppercase">
                      {entry.id === EVENT_SETUP_ENTRY_ID ? timelineLabels.setupBadge : entry.kind}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="text-text-secondary flex min-h-32 items-center justify-center px-4 py-5 text-sm">{timelineLabels.empty}</div>
          )
        ) : null}

        {activeTab === 'command' ? (
          <div className="detail-sections-stack px-3.5 py-3">
            <DetailSection title={labels.inspectorSummary}>
              <p className="text-text-primary mt-1 text-sm font-semibold">{selectedEntry?.title ?? labels.inspectorEmpty}</p>
              <p className="text-text-secondary mt-1.5 text-xs leading-5">{selectedEntry?.detail ?? labels.inspectorEmpty}</p>
            </DetailSection>

            {isSetupEntry ? (
              <DetailSection title={labels.inspectorParameters}>
                <div className="flex flex-col">
                  <KvRow label={labels.inspectorMusic} value={renderValue(selectedEvent.scene.musicCue, labels.inspectorNone)} mono />
                  <KvRow
                    label={labels.inspectorCamera}
                    value={renderValue(selectedEvent.scene.cameraInstruction, labels.inspectorNone)}
                    mono
                  />
                  <KvRow label={labels.inspectorActors} value={String(selectedEvent.scene.actors.length)} mono />
                </div>
              </DetailSection>
            ) : null}

            {!isSetupEntry && command ? (
              <DetailSection title={labels.inspectorParameters}>
                <div className="flex flex-col">
                  <KvRow label={labels.inspectorCommand} value={command.command} mono />
                  <KvRow label={labels.inspectorKind} value={command.kind} />
                  {command.actorName ? <KvRow label={labels.inspectorActor} value={command.actorName} /> : null}
                  {command.targetEventKey ? <KvRow label={labels.inspectorTarget} value={command.targetEventKey} mono /> : null}
                  {command.text ? <KvRow label={labels.inspectorText} value={command.text} block /> : null}
                  {command.prompt ? <KvRow label={labels.inspectorQuestion} value={command.prompt} block /> : null}
                </div>
                {command.choices?.length ? (
                  <div className="mt-3">
                    <p className="text-text-secondary text-meta-px font-semibold tracking-wide uppercase">{labels.inspectorChoices}</p>
                    <div className="mt-1 flex flex-col">
                      {command.choices.map((choice, index) => (
                        <div
                          key={choice.id}
                          className="border-border-subtle/50 flex items-start justify-between gap-3 border-b py-2.5 last:border-b-0"
                        >
                          <span className="text-text-secondary text-xs">{index + 1}</span>
                          <span className="text-text-primary min-w-0 flex-1 text-sm">{choice.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </DetailSection>
            ) : null}

            {!isSetupEntry && command && command.args.length ? (
              <DetailSection title={labels.inspectorArgs}>
                <div className="flex flex-col">
                  {command.args.map((arg, index) => (
                    <KvRow key={`${command.id}:arg:${index}`} label={`arg ${index}`} value={arg || labels.inspectorNone} mono />
                  ))}
                </div>
              </DetailSection>
            ) : null}

            {!isSetupEntry && selectedEntry?.command?.raw ? (
              <DetailSection title={labels.inspectorRaw}>
                <pre className="bg-surface-panel-muted text-text-secondary rounded-field text-meta-px mt-1 overflow-auto px-3 py-2.5 font-mono leading-5 break-all whitespace-pre-wrap">
                  {selectedEntry.command.raw}
                </pre>
              </DetailSection>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'scene' ? (
          <div className="detail-sections-stack px-3.5 py-3">
            <DetailSection title={timelineLabels.sceneSetup}>
              <div className="flex flex-col">
                <KvRow label={labels.inspectorMusic} value={renderValue(selectedEvent.scene.musicCue, labels.inspectorNone)} mono />
                <KvRow
                  label={labels.inspectorCamera}
                  value={renderValue(selectedEvent.scene.cameraInstruction, labels.inspectorNone)}
                  mono
                />
                {assetName ? <KvRow label={labels.detailMapLabel} value={assetName} mono /> : null}
              </div>
            </DetailSection>

            {selectedEvent.scene.actors.length ? (
              <DetailSection title={labels.inspectorActors}>
                <div className="flex flex-col">
                  {selectedEvent.scene.actors.map((actor) => (
                    <KvRow key={actor.id} label={actor.actorName} value={`${actor.tileX} ${actor.tileY} ${actor.facingDirection}`} mono />
                  ))}
                </div>
              </DetailSection>
            ) : null}

            {assetPath ? (
              <DetailSection title={labels.detailFileLabel}>
                <div className="flex flex-col">
                  <KvRow label={labels.detailPathLabel} value={assetPath} mono />
                </div>
              </DetailSection>
            ) : null}

            {modSources.length ? (
              <DetailSection title={labels.modSourcesTitle}>
                <div className="mt-1">
                  <ModSourceList sources={modSources} variant="flat" />
                </div>
              </DetailSection>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
