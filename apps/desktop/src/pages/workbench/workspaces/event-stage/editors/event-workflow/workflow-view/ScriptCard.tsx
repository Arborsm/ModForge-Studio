// 剧本卡片 — 按 beat_card_lucide.html 草图组织的 4 列剧本行

import { useMemo, useState, type ComponentType, type MouseEvent } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpCircle,
  Box,
  ChefHat,
  CircleDot,
  Clapperboard,
  Coins,
  Compass,
  Copy,
  Eye,
  EyeOff,
  FastForward,
  Footprints,
  Gamepad2,
  Gift,
  GitBranch,
  GitFork,
  GripVertical,
  Hammer,
  Heart,
  Image as ImageIcon,
  Lamp,
  Layers,
  ListChecks,
  Mail,
  MailCheck,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Moon,
  MousePointerClick,
  Move as MoveIcon,
  Music,
  Octagon,
  Package,
  Play,
  PlayCircle,
  Route,
  Scan,
  Scroll,
  Smile,
  Square,
  Sun,
  TimerReset,
  Trash2,
  TreePine,
  Type as TypeIcon,
  User,
  UserPlus,
  UserX,
  Vibrate,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
} from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { EventCommand } from '@entities/event'
import { getSchema } from '../workflow-model/commandSchemaRegistry'
import { renderTemplate, type RenderedNode } from '../workflow-model/templateRenderer'
import { ParamPill } from './ParamPill'
import type { ScriptEditorCopy } from './ScriptEditor'
import type { UIControlType } from '../workflow-model/commandSchema'
import type { EventResourceRegistry } from './eventResourceRegistry'
import { formatInlineDelay, type InlineDelayCandidate } from '../workflow-model/commandInlineDelay'

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

const BEAT_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpCircle,
  Box,
  ChefHat,
  CircleDot,
  Clapperboard,
  Coins,
  Compass,
  Eye,
  EyeOff,
  FastForward,
  Footprints,
  Gamepad2,
  Gift,
  GitBranch,
  GitFork,
  Hammer,
  Heart,
  Image: ImageIcon,
  Lamp,
  Layers,
  ListChecks,
  Mail,
  MailCheck,
  Map: MapIcon,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Moon,
  MousePointerClick,
  Move: MoveIcon,
  Music,
  MusicOff: Music,
  Octagon,
  Package,
  PlayCircle,
  Route,
  Scan,
  Scroll,
  Smile,
  Square,
  Sun,
  Timer: TimerReset,
  TimerReset,
  TreePine,
  Type: TypeIcon,
  User,
  UserPlus,
  UserX,
  Vibrate,
  Volume2,
  VolumeX,
  Waves,
  Zap,
}

const CATEGORY_FALLBACK_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  dialogue: MessageSquareText,
  movement: MoveIcon,
  visual: Eye,
  audio: Music,
  logic: GitBranch,
  scene: MapIcon,
  item: Gift,
  animation: User,
  other: CircleDot,
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
  copy: ScriptEditorCopy
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

type ParamNode = Extract<RenderedNode, { type: 'param' }>

function isParamNode(node: RenderedNode): node is ParamNode {
  return node.type === 'param'
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
  copy,
  resourceRegistry,
  inlineDelay = null,
  onSelect,
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
  const schema = useMemo(() => getSchema(command.command), [command.command])
  const nodes = useMemo(() => {
    if (!schema) return null
    return renderTemplate(schema, command.args, locale)
  }, [schema, command.args, locale])

  const categoryLabel = schema ? (CATEGORY_LABELS[schema.category] ?? schema.category) : command.kind
  const Icon = schema ? (BEAT_ICONS[schema.icon] ?? CATEGORY_FALLBACK_ICONS[schema.category] ?? CircleDot) : CircleDot
  const dialogueTextNode = nodes?.find((node): node is ParamNode => isParamNode(node) && node.control === 'textarea') ?? null
  const actorNode = nodes?.find((node): node is ParamNode => isParamNode(node) && node.control === 'npc_selector') ?? null
  const isDialogueCard = schema?.category === 'dialogue' && dialogueTextNode != null

  const handleInteractiveContentClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) {
      return
    }
    if (target.closest('button,input,textarea,select,[role="button"],[contenteditable="true"]')) {
      event.stopPropagation()
    }
  }

  function resolveCoordinatePair(nodeIndex: number) {
    if (!nodes) return null
    const node = nodes[nodeIndex]
    if (node?.type !== 'param' || node.control !== 'tile_picker') {
      return null
    }
    const immediateNext = nodes[nodeIndex + 1]
    if (immediateNext?.type === 'param' && immediateNext.control === 'tile_picker' && immediateNext.index === node.index + 1) {
      return { xNode: node, yNode: immediateNext, delimiterIndex: null }
    }
    const afterDelimiter = nodes[nodeIndex + 2]
    if (
      immediateNext?.type === 'static' &&
      immediateNext.text.trim() === ',' &&
      afterDelimiter?.type === 'param' &&
      afterDelimiter.control === 'tile_picker' &&
      afterDelimiter.index === node.index + 1
    ) {
      return { xNode: node, yNode: afterDelimiter, delimiterIndex: nodeIndex + 1 }
    }
    return null
  }

  function isCoordinatePairContinuation(nodeIndex: number) {
    if (!nodes) return false
    const previousPair = resolveCoordinatePair(nodeIndex - 1)
    if (previousPair?.yNode === nodes[nodeIndex]) {
      return true
    }
    const pairBeforeDelimiter = resolveCoordinatePair(nodeIndex - 2)
    return pairBeforeDelimiter?.delimiterIndex === nodeIndex - 1 && pairBeforeDelimiter.yNode === nodes[nodeIndex]
  }

  function isCoordinatePairDelimiter(nodeIndex: number) {
    if (!nodes) return false
    const previousPair = resolveCoordinatePair(nodeIndex - 1)
    return previousPair?.delimiterIndex === nodeIndex
  }

  function renderParamNode(node: ParamNode, nodeIndex: number) {
    const pickControl = isPickControl(node.control) ? node.control : null
    return (
      <ParamPill
        key={nodeIndex}
        control={node.control}
        value={node.value}
        label={node.label}
        placeholder={node.placeholder}
        options={node.options}
        resourceRegistry={resourceRegistry}
        size={cardView === 'compact' ? 'sm' : 'md'}
        variant="script"
        onChange={(value) => {
          if (node.control === 'animation_frames') {
            onUpdateArgs?.(node.index, value.trim().split(/\s+/u).filter(Boolean))
            return
          }
          if (node.control === 'quick_question') {
            onUpdateArgs?.(node.index, [value])
            return
          }
          onUpdateArg?.(node.index, value)
        }}
        onPickMode={pickControl ? () => onEnterPickMode?.(node.index, pickControl) : undefined}
      />
    )
  }

  function renderTemplateNodes(skipParamIndexes = new Set<number>()) {
    if (!nodes) {
      return <span className="font-mono text-xs text-(--text-secondary)">{command.raw}</span>
    }

    return nodes.map((node, nodeIndex) => {
      if (node.type === 'static') {
        if (isCoordinatePairDelimiter(nodeIndex)) {
          return null
        }
        return (
          <span key={nodeIndex} className="text-(--text-secondary)">
            {node.text}
          </span>
        )
      }

      if (skipParamIndexes.has(node.index) || isCoordinatePairContinuation(nodeIndex)) {
        return null
      }
      const coordinatePair = resolveCoordinatePair(nodeIndex)
      if (coordinatePair) {
        return (
          <CoordinateParamPill
            key={nodeIndex}
            x={coordinatePair.xNode.value}
            y={coordinatePair.yNode.value}
            xLabel={coordinatePair.xNode.label}
            yLabel={coordinatePair.yNode.label}
            onChange={(axis, value) => onUpdateArg?.(axis === 'x' ? coordinatePair.xNode.index : coordinatePair.yNode.index, value)}
            onPickMode={() => onEnterPickMode?.(coordinatePair.xNode.index, 'tile_picker')}
          />
        )
      }
      return renderParamNode(node, nodeIndex)
    })
  }

  function renderDialogueHeader() {
    if (actorNode) {
      return renderParamNode(actorNode, nodes?.indexOf(actorNode) ?? 0)
    }
    return (
      <>
        <span className="mr-0.5 text-xs font-medium text-(--text-tertiary)">[{schema?.labelZh ?? categoryLabel}]</span>
        {renderTemplateNodes(new Set([dialogueTextNode?.index ?? -1]))}
      </>
    )
  }

  const beatTone = playing ? 'playing' : selected ? 'selected' : 'default'
  const isCompact = cardView === 'compact'
  const categoryClass = schema ? `cat-${schema.category}` : 'cat-other'

  return (
    <div className={cx('relative', isCompact ? 'mb-1' : 'mb-1.5')}>
      <div
        className={cx(
          'cmd',
          isDialogueCard && 'dialogue',
          beatTone === 'selected' && 'script-card-selected',
          beatTone === 'playing' && 'script-card-playing',
        )}
        onClick={onSelect}
      >
        {dragHandleProps ? (
          <button
            type="button"
            className="cmd-grip"
            onClick={(event) => event.stopPropagation()}
            title="拖动排序"
            {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="cmd-grip" aria-hidden />
        )}
        <span className="cmd-num">{showLineNumber ? index + 1 : null}</span>
        <span className={cx('cmd-icon', categoryClass)}>
          <Icon className="h-4 w-4 stroke-[1.5]" />
        </span>
        <span className="cmd-body" onClick={handleInteractiveContentClick}>
          {schema?.key === 'viewport' ? <span className="cmd-label">[视角]</span> : null}
          {isDialogueCard ? renderDialogueHeader() : renderTemplateNodes()}
        </span>
        <span className="cmd-tail">
          {inlineDelay ? (
            <InlineDelayControl
              delay={inlineDelay}
              copy={copy}
              locale={locale}
              onSetDelay={onSetInlineDelay}
              onRemoveDelay={onRemoveInlineDelay}
            />
          ) : null}
          <span className="cmd-actions">
            {onPlayFromHere && (
              <button
                type="button"
                className="play"
                onClick={(event) => {
                  event.stopPropagation()
                  onPlayFromHere()
                }}
                title={copy.playFromHere}
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDuplicate()
                }}
                title={copy.duplicate}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="del"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete()
                }}
                title={copy.delete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        </span>

        {isDialogueCard && dialogueTextNode ? (
          <div className="cmd-quote" onClick={handleInteractiveContentClick}>
            <span>"</span>
            {renderParamNode(dialogueTextNode, nodes?.indexOf(dialogueTextNode) ?? 0)}
            <span>"</span>
          </div>
        ) : null}

        {expanded ? (
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2.5 py-2 pr-1 pl-17">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-[0.06em] text-(--text-tertiary) uppercase">{copy.rawCommand}</span>
                <code className="block rounded-lg border border-(--border-color) bg-[color-mix(in_srgb,var(--bg-panel-muted)_76%,transparent)] px-3 py-2 font-mono text-xs leading-[1.55] text-(--text-secondary)">
                  {command.raw}
                </code>
              </div>
              {command.args.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {command.args.map((arg, argIndex) => (
                    <div key={argIndex} className="flex min-w-0 items-center gap-1.5">
                      <span className="font-mono text-[10px] text-(--text-tertiary)">[{argIndex}]</span>
                      <span className="truncate text-[11px] text-(--text-primary)">
                        {arg || <span className="text-(--text-tertiary) italic">{copy.emptyArg}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function isPickControl(control: UIControlType): control is 'tile_picker' | 'npc_selector' | 'path_picker' {
  return control === 'tile_picker' || control === 'npc_selector' || control === 'path_picker'
}

function InlineDelayControl({
  delay,
  copy,
  locale,
  onSetDelay,
  onRemoveDelay,
}: {
  delay: InlineDelayCandidate
  copy: ScriptEditorCopy
  locale: 'zh-CN' | 'en-US'
  onSetDelay?: (pauseCommandIndex: number | null, valueMs: number) => void
  onRemoveDelay?: (pauseCommandIndex: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const hasPause = delay.pauseCommandIndex != null
  const label = delay.kind === 'step' ? copy.delayStep : delay.kind === 'hold' ? copy.delayHold : copy.delayGeneric
  const addLabel =
    locale === 'zh-CN'
      ? `+ ${label} ${formatInlineDelay(delay.defaultMs)}`
      : `+ ${label.toLowerCase()} ${formatInlineDelay(delay.defaultMs)}`

  if (!hasPause) {
    return (
      <button
        type="button"
        className="delay"
        title={addLabel}
        onClick={(event) => {
          event.stopPropagation()
          onSetDelay?.(null, delay.defaultMs)
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        ◦ {formatInlineDelay(delay.defaultMs)}
      </button>
    )
  }

  const pauseCommandIndex = delay.pauseCommandIndex
  if (pauseCommandIndex == null) {
    return null
  }

  if (editing) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-0.5"
        title={`${label}: ${formatInlineDelay(delay.valueMs)}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <input
          type="number"
          min={0}
          step={delay.stepMs}
          className="h-5 w-10 rounded border border-(--border-color) bg-(--bg-panel) px-1 font-mono text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
          value={delay.valueMs}
          aria-label={label}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10)
            onSetDelay?.(pauseCommandIndex, Number.isFinite(parsed) ? Math.max(0, parsed) : 0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              setEditing(false)
            }
          }}
        />
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-(--text-tertiary) hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-(--danger)"
          title={copy.removeDelay}
          aria-label={copy.removeDelay}
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

  return (
    <button
      type="button"
      className="delay"
      title={`${label}: ${formatInlineDelay(delay.valueMs)}`}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      ◦ {formatInlineDelay(delay.valueMs)}
    </button>
  )
}

function CoordinateParamPill({
  x,
  y,
  xLabel,
  yLabel,
  onChange,
  onPickMode,
}: {
  x: string
  y: string
  xLabel: string
  yLabel: string
  onChange: (axis: 'x' | 'y', value: string) => void
  onPickMode: () => void
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <span
        className="pill accent"
        title={`${xLabel}: ${x}, ${yLabel}: ${y}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis} className="inline-flex items-center gap-1 text-[10px] font-semibold text-(--text-tertiary) uppercase">
            {axis === 'x' ? xLabel : yLabel}
            <input
              type="number"
              className="h-5 w-9 rounded border border-(--border-color) bg-(--bg-panel) px-1 font-mono text-[11px] font-medium text-(--text-primary) outline-none focus:border-(--accent)"
              value={axis === 'x' ? x : y}
              onChange={(event) => onChange(axis, event.target.value)}
            />
          </label>
        ))}
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded text-(--text-tertiary) transition-colors hover:bg-(--bg-panel-muted) hover:text-(--accent)"
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

  return (
    <button
      type="button"
      className="pill accent"
      title={`${xLabel}: ${x}, ${yLabel}: ${y}`}
      onClick={(event) => {
        event.stopPropagation()
        setEditing(true)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {x}, {y}
    </button>
  )
}
