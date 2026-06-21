import { useMemo, useRef, useCallback } from 'react'
import {
  ArrowRightLeft,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Coins,
  Compass,
  GitBranch,
  Heart,
  Layers,
  ListChecks,
  Map,
  MapPin,
  MessageSquareText,
  Move,
  Music,
  Octagon,
  Package,
  PlayCircle,
  Plus,
  Smile,
  Sun,
  TimerReset,
  Trash2,
  UserPlus,
  Vibrate,
  Volume2,
  Zap,
} from 'lucide-react'
import type { EventCommand, EventCommandKind } from '@entities/event'
import { getCommandSummary } from '../workflow-model/commandSummary'
import { cx } from '@shared/lib/helper'
import { useEventStageCopy } from '@locales/provider'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ArrowRightLeft,
  ArrowUp,
  CircleDot,
  Coins,
  Compass,
  GitBranch,
  Heart,
  Layers,
  ListChecks,
  Map,
  MapPin,
  MessageSquareText,
  Move,
  Music,
  Octagon,
  Package,
  PlayCircle,
  Smile,
  Sun,
  TimerReset,
  Trash2,
  UserPlus,
  Vibrate,
  Volume2,
  Zap,
}

const kindColors: Record<EventCommandKind, string> = {
  dialogue: 'border-l-[color-mix(in_srgb,var(--warning)_65%,transparent)]',
  message: 'border-l-[color-mix(in_srgb,var(--success)_55%,transparent)]',
  choice: 'border-l-[color-mix(in_srgb,var(--accent)_65%,transparent)]',
  branch: 'border-l-[color-mix(in_srgb,var(--danger)_55%,transparent)]',
  timing: 'border-l-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)]',
  flow: 'border-l-[color-mix(in_srgb,var(--text-secondary)_50%,transparent)]',
  action: 'border-l-(--border-color)',
}

const kindBg: Record<EventCommandKind, string> = {
  dialogue: 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)]',
  message: 'bg-[color-mix(in_srgb,var(--success)_10%,transparent)]',
  choice: 'bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]',
  branch: 'bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]',
  timing: 'bg-[color-mix(in_srgb,var(--text-secondary)_8%,transparent)]',
  flow: 'bg-[color-mix(in_srgb,var(--text-secondary)_8%,transparent)]',
  action: 'bg-[color-mix(in_srgb,var(--border-color)_30%,transparent)]',
}

const kindIconColor: Record<EventCommandKind, string> = {
  dialogue: 'text-(--warning)',
  message: 'text-(--success)',
  choice: 'text-(--accent)',
  branch: 'text-(--danger)',
  timing: 'text-(--text-secondary)',
  flow: 'text-(--text-secondary)',
  action: 'text-(--text-secondary)',
}

type EventCommandPipelineProps = {
  commands: EventCommand[]
  selectedId: string | null
  expandedId: string | null
  onSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onChange: (index: number, newRaw: string) => void
  onDelete: (index: number) => void
  onInsertAfter: (index: number, raw: string) => void
  locale?: 'zh-CN' | 'en-US'
}

function stripQuotes(value: string): string {
  const t = value.trim()
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1)
  }
  return t
}

export function CommandEditor({
  command,
  onChange,
  onDelete,
}: {
  command: EventCommand
  onChange: (newRaw: string) => void
  onDelete: () => void
}) {
  const argFields = useMemo(() => {
    const fields: Array<{ label: string; value: string; index: number }> = []
    const args = command.args
    switch (command.command) {
      case 'speak':
      case 'splitSpeak':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Text', value: args[2] ?? '', index: 2 })
        break
      case 'message':
        fields.push({ label: 'Text', value: args[1] ?? '', index: 1 })
        break
      case 'pause':
        fields.push({ label: 'Delay (ms)', value: args[1] ?? '0', index: 1 })
        break
      case 'move':
        for (let i = 1; i < args.length; i++) {
          fields.push({ label: `Arg ${i}`, value: args[i] ?? '', index: i })
        }
        break
      case 'warp':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'X', value: args[2] ?? '', index: 2 })
        fields.push({ label: 'Y', value: args[3] ?? '', index: 3 })
        break
      case 'faceDirection':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Direction', value: args[2] ?? '', index: 2 })
        break
      case 'emote':
        fields.push({ label: 'Actor', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Emote', value: args[2] ?? '', index: 2 })
        break
      case 'playMusic':
      case 'playSound':
        fields.push({ label: 'Name', value: args[1] ?? '', index: 1 })
        break
      case 'viewport':
        fields.push({ label: 'X', value: args[1] ?? '', index: 1 })
        fields.push({ label: 'Y', value: args[2] ?? '', index: 2 })
        break
      case 'question':
      case 'quickQuestion':
        fields.push({ label: 'Prompt', value: args[1] ?? '', index: 1 })
        break
      default:
        for (let i = 1; i < args.length; i++) {
          fields.push({ label: `Arg ${i}`, value: args[i] ?? '', index: i })
        }
    }
    return fields
  }, [command])

  function updateArg(index: number, newValue: string) {
    const newArgs = [...command.args]
    newArgs[index] = newValue
    const newRaw = newArgs.map((arg) => (arg.includes(' ') || arg.includes('/') ? `"${arg}"` : arg)).join(' ')
    onChange(newRaw)
  }

  return (
    <div className="space-y-2 px-3 py-2">
      {argFields.map((field) => (
        <div key={field.index}>
          <label className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{field.label}</label>
          {field.label === 'Text' || field.value.length > 40 ? (
            <textarea
              className="h-16 w-full resize-none rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
              value={stripQuotes(field.value)}
              onChange={(e) => {
                const text = e.target.value
                const quoted = text.includes(' ') || text.includes('/') ? `"${text}"` : text
                updateArg(field.index, quoted)
              }}
              spellCheck={false}
            />
          ) : (
            <input
              type="text"
              className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
              value={stripQuotes(field.value)}
              onChange={(e) => {
                const text = e.target.value
                const quoted = text.includes(' ') || text.includes('/') ? `"${text}"` : text
                updateArg(field.index, quoted)
              }}
            />
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[9px] text-(--text-secondary)">Raw: {command.raw}</span>
        <button type="button" className="icon-button h-5 w-5 text-red-400" onClick={onDelete} title="Delete">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

const QUICK_TEMPLATES: { label: string; raw: string }[] = [
  { label: 'speak', raw: 'speak Abigail "Hello!"' },
  { label: 'pause', raw: 'pause 1000' },
  { label: 'move', raw: 'move Abigail 10 15 2 12 15 1' },
  { label: 'emote', raw: 'emote Abigail 8' },
  { label: 'warp', raw: 'warp Abigail 10 15 2' },
  { label: 'message', raw: 'message "A message appears..."' },
  { label: 'skippable', raw: 'skippable' },
  { label: 'faceDirection', raw: 'faceDirection Abigail 2' },
]

export function EventCommandPipeline({
  commands,
  selectedId,
  expandedId,
  onSelect,
  onToggleExpand,
  onChange,
  onDelete,
  onInsertAfter,
}: EventCommandPipelineProps) {
  const labels = useEventStageCopy().workflow.commandPipeline

  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (commands.length === 0) return
      const currentIndex = commands.findIndex((c) => c.id === selectedId)
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next = commands[Math.min(currentIndex + 1, commands.length - 1)]
        if (next) onSelect(next.id)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prev = commands[Math.max(currentIndex - 1, 0)]
        if (prev) onSelect(prev.id)
      }
    },
    [commands, selectedId, onSelect],
  )

  if (commands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-(--border-color) px-4 py-8">
        <p className="text-sm text-(--text-secondary)">{labels.empty}</p>
        <p className="text-[10px] text-(--text-tertiary)">{labels.addHint}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              className="flex items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-2.5 py-1 text-[10px] text-(--text-primary) transition-colors hover:border-(--accent) hover:text-(--accent)"
              onClick={() => onInsertAfter(-1, t.raw)}
            >
              <Plus className="h-3 w-3" /> {t.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col" onKeyDown={handleKeyDown} tabIndex={-1}>
      {commands.map((cmd, index) => {
        const summary = getCommandSummary(cmd)
        const Icon = ICON_MAP[summary.icon] ?? CircleDot
        const isSelected = selectedId === cmd.id
        const isExpanded = expandedId === cmd.id
        const hasTiming = summary.timing && cmd.kind === 'timing'
        const isLast = index === commands.length - 1

        return (
          <div key={cmd.id} className="flex flex-col items-center">
            {/* Connector + timing label (before card, skip first) */}
            {index > 0 && (
              <div className="flex flex-col items-center py-1">
                <div className="h-3 w-px bg-(--border-color)" />
                {hasTiming ? (
                  <span className="rounded-full bg-(--bg-panel-muted) px-1.5 py-0.5 text-[9px] text-(--text-secondary)">
                    {summary.timing}
                  </span>
                ) : null}
                <div className="h-3 w-px bg-(--border-color)" />
                <div className="h-0 w-0 border-t-4 border-r-[3px] border-l-[3px] border-t-(--border-color) border-r-transparent border-l-transparent" />
              </div>
            )}

            {/* Card */}
            <div
              className={cx(
                'group relative w-full cursor-pointer rounded-lg border border-(--border-color) bg-(--bg-panel-muted) transition-all',
                'border-l-[3px]',
                kindColors[cmd.kind],
                isSelected && 'ring-1 ring-(--accent)',
                isExpanded && 'bg-(--bg-panel)',
              )}
              onClick={() => onSelect(cmd.id)}
            >
              {/* Card header */}
              <div className="flex items-center gap-2.5 px-3 py-2">
                {/* Icon bubble */}
                <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', kindBg[cmd.kind])}>
                  <Icon className={cx('h-4 w-4', kindIconColor[cmd.kind])} />
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-(--text-primary)">{summary.title}</span>
                    <span className="shrink-0 text-[9px] tracking-wider text-(--text-tertiary) uppercase">{cmd.command}</span>
                  </div>
                  {summary.subtitle && <p className="truncate text-[11px] text-(--text-secondary)">{summary.subtitle}</p>}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="icon-button h-6 w-6 text-(--text-secondary)"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpand(cmd.id)
                    }}
                    title="Expand"
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    className="icon-button h-6 w-6 text-red-400"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(cmd.index)
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-(--border-color)">
                  <CommandEditor command={cmd} onChange={(newRaw) => onChange(cmd.index, newRaw)} onDelete={() => onDelete(cmd.index)} />
                </div>
              )}

              {/* Insert after hover button */}
              <div className="absolute -bottom-2 left-1/2 z-10 hidden -translate-x-1/2 group-hover:block">
                <button
                  type="button"
                  className="flex h-5 items-center gap-0.5 rounded-full bg-(--accent) px-1.5 text-[9px] font-medium text-white shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    // Show a small menu? For now just insert pause
                    onInsertAfter(cmd.index, 'pause 1000')
                  }}
                >
                  <Plus className="h-2.5 w-2.5" /> insert
                </button>
              </div>
            </div>

            {/* End of pipeline marker */}
            {isLast && (
              <div className="flex flex-col items-center pt-2">
                <div className="h-3 w-px bg-(--border-color)" />
                <div className="h-0 w-0 border-t-4 border-r-[3px] border-l-[3px] border-t-(--border-color) border-r-transparent border-l-transparent" />
                <div className="mt-1 flex flex-wrap justify-center gap-2 pb-2">
                  {QUICK_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      className="flex items-center gap-1 rounded-md border border-(--border-color) bg-(--bg-panel-muted) px-2 py-0.5 text-[9px] text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--accent)"
                      onClick={() => onInsertAfter(cmd.index, t.raw)}
                    >
                      <Plus className="h-2.5 w-2.5" /> {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
