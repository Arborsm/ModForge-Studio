// 剧本卡片 — 标签+编号+自然语言句子

import { useMemo, useState, type MouseEvent } from 'react'
import { GripVertical, Trash2, Copy, ChevronDown, ChevronUp, Play, MapPin, TimerReset, X } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { EventCommand } from '@entities/event'
import { getSchema } from '../workflow-model/commandSchemaRegistry'
import { renderTemplate } from '../workflow-model/templateRenderer'
import { ParamPill } from './ParamPill'
import type { UIControlType } from '../workflow-model/commandSchema'
import type { EventResourceRegistry } from './eventResourceRegistry'
import { formatInlineDelay, type InlineDelayCandidate } from '../workflow-model/commandInlineDelay'

const COLOR_MAP: Record<string, { bg: string; border: string; tag: string; text: string }> = {
  blue: {
    bg: 'bg-[color-mix(in_srgb,#3b82f6_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#3b82f6_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#3b82f6_15%,transparent)] text-[#2563eb]',
    text: 'text-[#2563eb]',
  },
  purple: {
    bg: 'bg-[color-mix(in_srgb,#8b5cf6_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#8b5cf6_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#8b5cf6_15%,transparent)] text-[#7c3aed]',
    text: 'text-[#7c3aed]',
  },
  orange: {
    bg: 'bg-[color-mix(in_srgb,#f97316_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#f97316_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#f97316_15%,transparent)] text-[#ea580c]',
    text: 'text-[#ea580c]',
  },
  pink: {
    bg: 'bg-[color-mix(in_srgb,#ec4899_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#ec4899_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#ec4899_15%,transparent)] text-[#db2777]',
    text: 'text-[#db2777]',
  },
  green: {
    bg: 'bg-[color-mix(in_srgb,#22c55e_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#22c55e_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#22c55e_15%,transparent)] text-[#16a34a]',
    text: 'text-[#16a34a]',
  },
  cyan: {
    bg: 'bg-[color-mix(in_srgb,#06b6d4_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#06b6d4_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#06b6d4_15%,transparent)] text-[#0891b2]',
    text: 'text-[#0891b2]',
  },
  yellow: {
    bg: 'bg-[color-mix(in_srgb,#eab308_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#eab308_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#eab308_15%,transparent)] text-[#ca8a04]',
    text: 'text-[#ca8a04]',
  },
  red: {
    bg: 'bg-[color-mix(in_srgb,#ef4444_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#ef4444_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#ef4444_15%,transparent)] text-[#dc2626]',
    text: 'text-[#dc2626]',
  },
  gray: {
    bg: 'bg-[color-mix(in_srgb,#6b7280_8%,transparent)]',
    border: 'border-l-[color-mix(in_srgb,#6b7280_70%,transparent)]',
    tag: 'bg-[color-mix(in_srgb,#6b7280_15%,transparent)] text-[#4b5563]',
    text: 'text-[#4b5563]',
  },
}

const CATEGORY_LABELS: Record<string, string> = {
  dialogue: '对话',
  movement: '移动',
  visual: '视觉',
  audio: '音频',
  logic: '逻辑',
  scene: '场景',
  item: '物品',
  animation: '动画',
  other: '其他',
}

export type ScriptCardProps = {
  command: EventCommand
  index: number
  selected?: boolean
  playing?: boolean
  expanded?: boolean
  showLineNumber?: boolean
  cardView?: 'compact' | 'comfortable'
  locale?: 'zh-CN' | 'en-US'
  resourceRegistry?: EventResourceRegistry
  inlineDelay?: InlineDelayCandidate | null
  onSelect?: () => void
  onToggleExpand?: () => void
  onUpdateArg?: (argIndex: number, value: string) => void
  onEnterPickMode?: (paramIndex: number, controlType: 'tile_picker' | 'npc_selector' | 'path_picker') => void
  onUpdateArgs?: (argIndex: number, values: string[]) => void
  onSetInlineDelay?: (pauseCommandIndex: number | null, valueMs: number) => void
  onRemoveInlineDelay?: (pauseCommandIndex: number) => void
  onDuplicate?: () => void
  onDelete?: () => void
  onPlayFromHere?: () => void
  dragHandleProps?: Record<string, unknown>
}

export function ScriptCard({
  command,
  index,
  selected,
  playing,
  expanded,
  showLineNumber = true,
  cardView = 'comfortable',
  locale = 'zh-CN',
  resourceRegistry,
  inlineDelay = null,
  onSelect,
  onToggleExpand,
  onUpdateArg,
  onEnterPickMode,
  onUpdateArgs,
  onSetInlineDelay,
  onRemoveInlineDelay,
  onDuplicate,
  onDelete,
  onPlayFromHere,
  dragHandleProps,
}: ScriptCardProps) {
  const [hovered, setHovered] = useState(false)
  const schema = useMemo(() => getSchema(command.command), [command.command])
  const nodes = useMemo(() => {
    if (!schema) return null
    return renderTemplate(schema, command.args, locale)
  }, [schema, command.args, locale])

  const colors = schema ? (COLOR_MAP[schema.color] ?? COLOR_MAP.gray) : COLOR_MAP.gray
  const categoryLabel = schema ? (CATEGORY_LABELS[schema.category] ?? schema.category) : command.kind
  const handleInteractiveContentClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    if (target.closest('button,input,textarea,select,[role="button"],[contenteditable="true"]')) {
      event.stopPropagation()
    }
  }

  function resolveCoordinatePair(index: number) {
    if (!nodes) return null
    const node = nodes[index]
    if (node?.type !== 'param' || node.control !== 'tile_picker') {
      return null
    }
    const immediateNext = nodes[index + 1]
    if (immediateNext?.type === 'param' && immediateNext.control === 'tile_picker' && immediateNext.index === node.index + 1) {
      return { xNode: node, yNode: immediateNext, delimiterIndex: null }
    }
    const afterDelimiter = nodes[index + 2]
    if (
      immediateNext?.type === 'static' &&
      immediateNext.text.trim() === ',' &&
      afterDelimiter?.type === 'param' &&
      afterDelimiter.control === 'tile_picker' &&
      afterDelimiter.index === node.index + 1
    ) {
      return { xNode: node, yNode: afterDelimiter, delimiterIndex: index + 1 }
    }
    return null
  }

  function isCoordinatePairContinuation(index: number) {
    if (!nodes) return false
    const previousPair = resolveCoordinatePair(index - 1)
    if (previousPair?.yNode === nodes[index]) {
      return true
    }
    const pairBeforeDelimiter = resolveCoordinatePair(index - 2)
    return pairBeforeDelimiter?.delimiterIndex === index - 1 && pairBeforeDelimiter.yNode === nodes[index]
  }

  function isCoordinatePairDelimiter(index: number) {
    if (!nodes) return false
    const previousPair = resolveCoordinatePair(index - 1)
    return previousPair?.delimiterIndex === index
  }

  return (
    <div
      className={cx(
        'group relative rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] transition-all',
        'border-l-[3px]',
        colors.border,
        selected && 'shadow-sm ring-1 ring-[var(--accent)]',
        playing &&
          'bg-[color-mix(in_srgb,var(--accent-soft)_38%,var(--bg-panel))] ring-1 ring-[color-mix(in_srgb,var(--accent)_42%,transparent)]',
        hovered && !selected && 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
        'hover:shadow-sm',
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cx('flex min-h-9 items-center gap-2', cardView === 'compact' ? 'px-2 py-1' : 'px-2.5 py-1.5')}>
        {dragHandleProps && (
          <button
            type="button"
            className={cx(
              'cursor-grab rounded p-1 text-[var(--text-tertiary)] opacity-0 transition-all hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-secondary)] active:cursor-grabbing',
              (hovered || selected) && 'opacity-100',
            )}
            onClick={(e) => e.stopPropagation()}
            {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {showLineNumber && (
          <span className="flex h-6 min-w-[24px] items-center justify-center rounded bg-[var(--bg-panel-muted)] px-1 font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
            {index + 1}
          </span>
        )}

        <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase', colors.tag)}>{categoryLabel}</span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-xs font-semibold text-[var(--text-primary)]">{command.title || command.command}</span>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)] opacity-70">{command.command}</span>
          </div>
          {command.detail ? <p className="truncate text-[10px] text-[var(--text-tertiary)]">{command.detail}</p> : null}
        </div>

        {playing ? (
          <span className="inline-flex h-6 shrink-0 items-center rounded border border-[color-mix(in_srgb,var(--accent)_34%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-1.5 text-[10px] font-semibold text-[var(--accent)]">
            {locale === 'zh-CN' ? '播放中' : 'Playing'}
          </span>
        ) : null}
        {inlineDelay ? (
          <InlineDelayControl delay={inlineDelay} locale={locale} onSetDelay={onSetInlineDelay} onRemoveDelay={onRemoveInlineDelay} />
        ) : null}
        <div className={cx('flex items-center gap-0.5 opacity-0 transition-opacity', (hovered || selected) && 'opacity-100')}>
          {onPlayFromHere && (
            <button
              type="button"
              className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-muted)] hover:text-[var(--accent)]"
              onClick={(e) => {
                e.stopPropagation()
                onPlayFromHere()
              }}
              title={locale === 'zh-CN' ? '从这里播放' : 'Play from here'}
            >
              <Play className="h-3 w-3" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
              title="复制"
            >
              <Copy className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)]"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="删除"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          {onToggleExpand && (
            <button
              type="button"
              className="rounded p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {/* Sentence Body */}
      <div className={cx(cardView === 'compact' ? 'px-2 pb-1.5' : 'px-2.5 pb-2')} onClick={handleInteractiveContentClick}>
        {schema && nodes ? (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm leading-relaxed text-[var(--text-primary)]">
            {nodes.map((node, i) => {
              if (node.type === 'static') {
                if (isCoordinatePairDelimiter(i)) {
                  return null
                }
                return (
                  <span key={i} className="text-[var(--text-secondary)]">
                    {node.text}
                  </span>
                )
              }
              if (isCoordinatePairContinuation(i)) {
                return null
              }
              const coordinatePair = resolveCoordinatePair(i)
              if (coordinatePair) {
                return (
                  <CoordinateParamPill
                    key={i}
                    x={coordinatePair.xNode.value}
                    y={coordinatePair.yNode.value}
                    xLabel={coordinatePair.xNode.label}
                    yLabel={coordinatePair.yNode.label}
                    size={cardView === 'compact' ? 'sm' : 'md'}
                    onChange={(axis, value) => onUpdateArg?.(axis === 'x' ? coordinatePair.xNode.index : coordinatePair.yNode.index, value)}
                    onPickMode={() => onEnterPickMode?.(coordinatePair.xNode.index, 'tile_picker')}
                  />
                )
              }
              const pickControl = isPickControl(node.control) ? node.control : null
              return (
                <ParamPill
                  key={i}
                  control={node.control}
                  value={node.value}
                  label={node.label}
                  placeholder={node.placeholder}
                  options={node.options}
                  resourceRegistry={resourceRegistry}
                  size={cardView === 'compact' ? 'sm' : 'md'}
                  onChange={(v) => {
                    if (node.control === 'animation_frames') {
                      onUpdateArgs?.(node.index, v.trim().split(/\s+/u).filter(Boolean))
                      return
                    }
                    if (node.control === 'quick_question') {
                      onUpdateArgs?.(node.index, [v])
                      return
                    }
                    onUpdateArg?.(node.index, v)
                  }}
                  onPickMode={pickControl ? () => onEnterPickMode?.(node.index, pickControl) : undefined}
                />
              )
            })}
          </div>
        ) : (
          <p className="font-mono text-xs text-[var(--text-secondary)]">{command.raw}</p>
        )}
      </div>

      {/* Raw expansion */}
      {expanded && (
        <div className="border-t border-[var(--border-color)] px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">原始命令</p>
          <code className="block rounded bg-[var(--bg-app)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-secondary)]">
            {command.raw}
          </code>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {command.args.map((arg, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-[var(--text-tertiary)]">[{i}]</span>
                <span className="truncate text-[11px] text-[var(--text-primary)]">
                  {arg || <span className="text-[var(--text-tertiary)] italic">空</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function isPickControl(control: UIControlType): control is 'tile_picker' | 'npc_selector' | 'path_picker' {
  return control === 'tile_picker' || control === 'npc_selector' || control === 'path_picker'
}

function InlineDelayControl({
  delay,
  locale,
  onSetDelay,
  onRemoveDelay,
}: {
  delay: InlineDelayCandidate
  locale: 'zh-CN' | 'en-US'
  onSetDelay?: (pauseCommandIndex: number | null, valueMs: number) => void
  onRemoveDelay?: (pauseCommandIndex: number) => void
}) {
  const hasPause = delay.pauseCommandIndex != null
  const label =
    delay.kind === 'step'
      ? locale === 'zh-CN'
        ? '帧延迟'
        : 'Step delay'
      : delay.kind === 'hold'
        ? locale === 'zh-CN'
          ? '停留'
          : 'Hold'
        : locale === 'zh-CN'
          ? '延迟'
          : 'Delay'
  const addLabel =
    locale === 'zh-CN'
      ? `+ ${label} ${formatInlineDelay(delay.defaultMs)}`
      : `+ ${label.toLowerCase()} ${formatInlineDelay(delay.defaultMs)}`
  const removeLabel = locale === 'zh-CN' ? '移除延迟' : 'Remove delay'

  if (!hasPause) {
    return (
      <button
        type="button"
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded border border-dashed border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-panel-muted)_48%,transparent)] px-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
        title={addLabel}
        onClick={(event) => {
          event.stopPropagation()
          onSetDelay?.(null, delay.defaultMs)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <TimerReset className="h-3 w-3" />
        {formatInlineDelay(delay.defaultMs)}
      </button>
    )
  }

  const pauseCommandIndex = delay.pauseCommandIndex
  if (pauseCommandIndex == null) {
    return null
  }

  return (
    <span
      className="inline-flex h-7 shrink-0 items-center overflow-hidden rounded border border-[color-mix(in_srgb,var(--accent)_34%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_44%,transparent)] text-[var(--text-primary)]"
      title={`${label}: ${formatInlineDelay(delay.valueMs)}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="inline-flex h-full items-center gap-1 border-r border-[color-mix(in_srgb,var(--accent)_18%,var(--border-color))] px-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase">
        <TimerReset className="h-3 w-3" />
        {delay.kind === 'step' ? 'STEP' : delay.kind === 'hold' ? 'HOLD' : 'WAIT'}
      </span>
      <input
        type="number"
        min={0}
        step={delay.stepMs}
        className="h-full w-14 bg-transparent px-1.5 font-mono text-[11px] font-semibold text-[var(--text-primary)] outline-none"
        value={delay.valueMs}
        aria-label={label}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10)
          onSetDelay?.(pauseCommandIndex, Number.isFinite(parsed) ? Math.max(0, parsed) : 0)
        }}
      />
      <span className="pr-1.5 text-[10px] font-semibold text-[var(--text-tertiary)]">ms</span>
      <span className="hidden h-full items-center border-l border-[color-mix(in_srgb,var(--accent)_18%,var(--border-color))] px-1 sm:inline-flex">
        <select
          className="h-full max-w-20 bg-transparent text-[10px] font-semibold text-[var(--text-tertiary)] outline-none"
          aria-label={locale === 'zh-CN' ? '常用延迟' : 'Common delay'}
          value={delay.quickValues.includes(delay.valueMs) ? delay.valueMs : ''}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10)
            if (Number.isFinite(parsed)) {
              onSetDelay?.(pauseCommandIndex, parsed)
            }
          }}
        >
          <option value="">{locale === 'zh-CN' ? '常用' : 'Preset'}</option>
          {delay.quickValues.map((value) => (
            <option key={value} value={value}>
              {formatInlineDelay(value)}
            </option>
          ))}
        </select>
      </span>
      <button
        type="button"
        className="inline-flex h-full w-6 items-center justify-center border-l border-[color-mix(in_srgb,var(--accent)_18%,var(--border-color))] text-[var(--text-tertiary)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)]"
        title={removeLabel}
        aria-label={removeLabel}
        onClick={(event) => {
          event.stopPropagation()
          onRemoveDelay?.(pauseCommandIndex)
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

function CoordinateParamPill({
  x,
  y,
  xLabel,
  yLabel,
  size,
  onChange,
  onPickMode,
}: {
  x: string
  y: string
  xLabel: string
  yLabel: string
  size: 'sm' | 'md'
  onChange: (axis: 'x' | 'y', value: string) => void
  onPickMode: () => void
}) {
  const height = size === 'sm' ? 'h-6' : 'h-7'
  const inputWidth = size === 'sm' ? 'w-8' : 'w-10'

  return (
    <span
      className={cx(
        'inline-flex items-center overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--accent)_35%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_52%,transparent)] text-[var(--text-primary)]',
        height,
      )}
      title={`${xLabel}: ${x}, ${yLabel}: ${y}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {(['x', 'y'] as const).map((axis) => (
        <label
          key={axis}
          className="inline-flex h-full items-center gap-1 border-r border-[color-mix(in_srgb,var(--accent)_18%,var(--border-color))] px-1.5 text-[10px] font-semibold text-[var(--text-tertiary)] uppercase last:border-r-0"
        >
          {axis === 'x' ? xLabel : yLabel}
          <input
            type="number"
            className={cx('h-full bg-transparent font-mono text-[11px] font-semibold text-[var(--text-primary)] outline-none', inputWidth)}
            value={axis === 'x' ? x : y}
            onChange={(event) => onChange(axis, event.target.value)}
          />
        </label>
      ))}
      <button
        type="button"
        className="inline-flex h-full w-7 items-center justify-center border-l border-[color-mix(in_srgb,var(--accent)_18%,var(--border-color))] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-panel-muted)] hover:text-[var(--accent)]"
        title="Pick from map"
        onClick={(event) => {
          event.stopPropagation()
          onPickMode()
        }}
      >
        <MapPin className="h-3 w-3" />
      </button>
    </span>
  )
}
