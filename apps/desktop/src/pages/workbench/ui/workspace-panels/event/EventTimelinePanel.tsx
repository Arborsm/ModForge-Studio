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
import { useEffect, useRef } from 'react'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { buildEventTimelineEntries, EVENT_SETUP_ENTRY_ID } from '@entities/event'
import type { EventTimelineEntry } from '@entities/event'
import type { EventScript } from '@entities/event'
import { cx } from '@shared/lib/helper'
import { useEventStageCopy } from '@locales/provider'

type EventTimelinePanelProps = {
  locale: 'zh-CN' | 'en-US'
  selectedEvent: EventScript | null
  selectedTimelineEntryId: string
  currentCommandId: string | null
  onSelectTimelineEntry: (entryId: string) => void
  onActivateTimelineEntry: (entryId: string) => void
}

function getEntryAppearance(entry: EventTimelineEntry) {
  if (entry.id === EVENT_SETUP_ENTRY_ID) {
    return {
      icon: Settings2,
      iconClassName: 'text-(--accent)',
      accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_75%,white_25%)]',
    }
  }

  const command = entry.command
  switch (command?.command) {
    case 'move':
    case 'positionOffset':
    case 'warp':
      return {
        icon: ArrowRightLeft,
        iconClassName: 'text-(--warning)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--warning)_72%,white_28%)]',
      }
    case 'faceDirection':
      return {
        icon: Compass,
        iconClassName: 'text-(--warning)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--warning)_60%,white_40%)]',
      }
    case 'playSound':
    case 'stopSound':
    case 'playMusic':
    case 'stopMusic':
      return {
        icon: AudioLines,
        iconClassName: 'text-(--success)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--success)_72%,white_28%)]',
      }
    case 'viewport':
    case 'changeLocation':
    case 'changeToTemporaryMap':
      return {
        icon: Map,
        iconClassName: 'text-(--accent)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_68%,white_32%)]',
      }
    case 'animate':
    case 'stopAnimation':
    case 'showFrame':
      return {
        icon: PlayCircle,
        iconClassName: 'text-(--accent)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_58%,white_42%)]',
      }
    case 'question':
    case 'quickQuestion':
      return {
        icon: ListChecks,
        iconClassName: 'text-(--accent)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_68%,white_32%)]',
      }
    case 'fork':
    case 'switchEvent':
      return {
        icon: GitBranch,
        iconClassName: 'text-(--danger)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--danger)_60%,white_40%)]',
      }
    case 'pause':
      return {
        icon: TimerReset,
        iconClassName: 'text-(--text-secondary)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--text-secondary)_55%,white_45%)]',
      }
    default:
      if (entry.kind === 'dialogue' || entry.kind === 'message') {
        return {
          icon: MessageSquareText,
          iconClassName: 'text-(--warning)',
          accentClassName: 'bg-[color-mix(in_srgb,var(--warning)_74%,white_26%)]',
        }
      }
      if (entry.kind === 'choice') {
        return {
          icon: ListChecks,
          iconClassName: 'text-(--accent)',
          accentClassName: 'bg-[color-mix(in_srgb,var(--accent)_68%,white_32%)]',
        }
      }
      if (entry.kind === 'branch') {
        return {
          icon: GitBranch,
          iconClassName: 'text-(--danger)',
          accentClassName: 'bg-[color-mix(in_srgb,var(--danger)_60%,white_40%)]',
        }
      }
      if (entry.kind === 'timing') {
        return {
          icon: TimerReset,
          iconClassName: 'text-(--text-secondary)',
          accentClassName: 'bg-[color-mix(in_srgb,var(--text-secondary)_55%,white_45%)]',
        }
      }
      return {
        icon: CircleDot,
        iconClassName: 'text-(--text-secondary)',
        accentClassName: 'bg-[color-mix(in_srgb,var(--text-secondary)_42%,white_58%)]',
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

  if (entry.kind === 'dialogue' || entry.kind === 'message') {
    return entry.title
  }

  return entry.title
}

function getEntrySecondaryText(entry: EventTimelineEntry, noDetailLabel: string) {
  if (entry.id === EVENT_SETUP_ENTRY_ID) {
    return entry.detail
  }

  const detail = entry.detail.replace(/\s+/gu, ' ').trim()
  if (detail) {
    return detail
  }

  return noDetailLabel
}

export function EventTimelinePanel({
  selectedEvent,
  selectedTimelineEntryId,
  currentCommandId,
  onSelectTimelineEntry,
  onActivateTimelineEntry,
}: EventTimelinePanelProps) {
  const labels = useEventStageCopy().workflow.scriptTimeline

  const entries = buildEventTimelineEntries(selectedEvent, {
    setup: labels.sceneSetup,
    music: labels.music,
    camera: labels.camera,
    actors: labels.actors,
  })
  const entryRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const activeEntryId = currentCommandId ?? selectedTimelineEntryId

  useEffect(() => {
    if (!activeEntryId) {
      return
    }

    entryRefs.current[activeEntryId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeEntryId])

  return (
    <PanelFrame
      title={labels.title}
      subtitle={labels.subtitle}
      bodyClassName="p-0"
      headerAction={<span className="dock-chip">{selectedEvent?.commands.length ?? 0}</span>}
    >
      {entries.length ? (
        <div className="min-h-0">
          {entries.map((entry, index) => {
            const appearance = getEntryAppearance(entry)
            const Icon = appearance.icon
            const isSelected = entry.id === selectedTimelineEntryId
            const isCurrent = entry.id !== EVENT_SETUP_ENTRY_ID && currentCommandId === entry.command?.id

            return (
              <button
                key={entry.id}
                type="button"
                ref={(node) => {
                  entryRefs.current[entry.id] = node
                }}
                className={cx(
                  'grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-(--border-color) px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[color-mix(in_srgb,var(--bg-active)_65%,transparent)]',
                  isSelected && 'bg-[color-mix(in_srgb,var(--accent)_10%,var(--bg-panel))]',
                  isCurrent && 'bg-[color-mix(in_srgb,var(--accent)_14%,var(--bg-panel))]',
                )}
                onClick={() => {
                  onSelectTimelineEntry(entry.id)
                  onActivateTimelineEntry(entry.id)
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      'inline-flex h-7 min-w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white',
                      appearance.accentClassName,
                    )}
                  >
                    {entry.id === EVENT_SETUP_ENTRY_ID ? 'S' : index}
                  </span>
                  <Icon className={cx('h-4 w-4 shrink-0', appearance.iconClassName)} />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-(--text-primary)">{getEntryPrimaryText(entry)}</p>
                  <p className="truncate text-[11px] text-(--text-secondary)">{getEntrySecondaryText(entry, labels.noDetail)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold tracking-[0.14em] text-(--text-tertiary) uppercase">
                    {entry.id === EVENT_SETUP_ENTRY_ID ? labels.setupBadge : entry.kind}
                  </span>
                  {isCurrent ? <span className="dock-chip">{labels.current}</span> : null}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex min-h-33 items-center justify-center rounded-2xl border border-dashed border-(--border-color) px-4 py-5 text-sm text-(--text-secondary)">
          {labels.empty}
        </div>
      )}
    </PanelFrame>
  )
}
