// 剧本卡片 — 标签+编号+自然语言句子

import { useMemo, useState } from 'react'
import { GripVertical, Trash2, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { EventCommand } from '@entities/event'
import { getSchema } from '../workflow-model/commandSchemaRegistry'
import { renderTemplate } from '../workflow-model/templateRenderer'
import { ParamPill } from './ParamPill'

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
  expanded?: boolean
  showLineNumber?: boolean
  cardView?: 'compact' | 'comfortable'
  locale?: 'zh-CN' | 'en-US'
  onSelect?: () => void
  onToggleExpand?: () => void
  onUpdateArg?: (argIndex: number, value: string) => void
  onEnterPickMode?: (paramIndex: number, controlType: 'tile_picker' | 'npc_selector') => void
  onDuplicate?: () => void
  onDelete?: () => void
  dragHandleProps?: Record<string, unknown>
}

export function ScriptCard({
  command,
  index,
  selected,
  expanded,
  showLineNumber = true,
  cardView = 'comfortable',
  locale = 'zh-CN',
  onSelect,
  onToggleExpand,
  onUpdateArg,
  onEnterPickMode,
  onDuplicate,
  onDelete,
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

  return (
    <div
      className={cx(
        'group relative rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] transition-all',
        'border-l-[3px]',
        colors.border,
        selected && 'shadow-sm ring-1 ring-[var(--accent)]',
        hovered && !selected && 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border-color))]',
        'hover:shadow-sm',
      )}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card Header */}
      <div className={cx('flex items-center gap-2', cardView === 'compact' ? 'px-2.5 py-1.5' : 'px-3 py-2')}>
        {dragHandleProps && (
          <button
            type="button"
            className="cursor-grab text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
            {...(dragHandleProps as React.ButtonHTMLAttributes<HTMLButtonElement>)}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}

        {showLineNumber && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded bg-[var(--bg-panel-muted)] px-1 font-mono text-[10px] font-medium text-[var(--text-tertiary)]">
            {index + 1}
          </span>
        )}

        <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase', colors.tag)}>{categoryLabel}</span>

        <span className="ml-auto font-mono text-[10px] text-[var(--text-tertiary)] opacity-60">{command.command}</span>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
      <div className={cx(cardView === 'compact' ? 'px-2.5 pb-2' : 'px-3 pb-2.5')}>
        {schema && nodes ? (
          <p className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm leading-relaxed text-[var(--text-primary)]">
            {nodes.map((node, i) => {
              if (node.type === 'static') {
                return (
                  <span key={i} className="text-[var(--text-secondary)]">
                    {node.text}
                  </span>
                )
              }
              return (
                <ParamPill
                  key={i}
                  control={node.control}
                  value={node.value}
                  label={node.label}
                  placeholder={node.placeholder}
                  options={node.options}
                  size={cardView === 'compact' ? 'sm' : 'md'}
                  onChange={(v) => onUpdateArg?.(node.index, v)}
                  onPickMode={
                    node.control === 'tile_picker' || node.control === 'npc_selector'
                      ? () => onEnterPickMode?.(node.index, node.control as 'tile_picker' | 'npc_selector')
                      : undefined
                  }
                />
              )
            })}
          </p>
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
