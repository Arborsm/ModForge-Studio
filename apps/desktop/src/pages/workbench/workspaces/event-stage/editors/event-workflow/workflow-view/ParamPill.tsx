// 参数胶囊 — 嵌入自然语言句子中的可编辑参数

import { useState, useRef, useEffect, type SyntheticEvent } from 'react'
import { Film, MapPin, Minus, Package, Plus, Route, User, Music, Volume2, Smile, Palette } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { UIControlType, OptionItem } from '../workflow-model/commandSchema'
import { EventResourcePicker, type EventResourceKind, type EventResourceOption } from './EventResourcePicker'
import type { EventResourceRegistry } from './eventResourceRegistry'

export type ParamPillProps = {
  control: UIControlType
  value: string
  label: string
  placeholder?: string
  options?: OptionItem[]
  onChange?: (value: string) => void
  onPickMode?: () => void
  resourceRegistry?: EventResourceRegistry
  disabled?: boolean
  size?: 'sm' | 'md'
}

function resolveOptionValue(item: OptionItem): string {
  return typeof item === 'string' ? item : item.value
}

function resolveOptionLabel(item: OptionItem): string {
  return typeof item === 'string' ? item : item.label
}

function optionMatchesFilter(item: OptionItem, filter: string): boolean {
  const label = resolveOptionLabel(item).toLowerCase()
  const value = resolveOptionValue(item).toLowerCase()
  const f = filter.toLowerCase()
  return label.includes(f) || value.includes(f)
}

function resourceKindForControl(control: UIControlType, placeholder?: string): EventResourceKind | null {
  if (control === 'npc_selector') return 'actor'
  if (control === 'item') return 'item'
  if (control === 'music') return 'music'
  if (control === 'sound') return 'sound'
  if (control === 'choice' && placeholder === 'MapName') return 'location'
  return null
}

function optionToResource(kind: EventResourceKind, option: OptionItem): EventResourceOption {
  const value = resolveOptionValue(option)
  return {
    id: `${kind}:inline:${value}`,
    value,
    label: resolveOptionLabel(option),
    kind,
    subtitle: 'Schema',
  }
}

const DIRECTION_LABELS: Record<string, string> = {
  '0': '上',
  '1': '右',
  '2': '下',
  '3': '左',
  up: '上',
  right: '右',
  down: '下',
  left: '左',
}

const FRAME_SEQUENCE_PRESETS = [
  { value: '0 1 2 3', label: 'Walk 0-3' },
  { value: '16 17 18 19', label: 'Gesture 16-19' },
  { value: '24 25 26 27', label: 'React 24-27' },
  { value: '32 33 34 35', label: 'Loop 32-35' },
]

const ITEM_SWATCH_COLORS = ['#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#eab308', '#a16207', '#64748b']

const EMOTE_ICONS: Record<string, string> = {
  '0': '...',
  '1': '?',
  '2': '!',
  '3': '!!',
  '4': 'Zz',
  '5': '<3',
  '6': 'X',
  '7': ':)',
  '8': '</3',
  '9': ":'",
  '10': '...',
  '11': '!!',
  '12': '*',
  '13': '♪',
  '14': '#',
  '15': ':D',
  '16': '$',
  '17': '[]',
  '18': 'B',
  '19': '?',
  '20': '@',
  '21': '*',
  '22': '^',
  '23': '~',
  '24': '☁',
  '25': 'L',
  '26': 'C',
  '27': 'O',
  '28': '!',
  '29': 'R',
  '30': 'T',
  '31': 'K',
}

type QuickQuestionParts = {
  question: string
  optionA: string
  optionB: string
  yesCommand: string
  noCommand: string
}

function stripOuterQuotes(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\"/gu, '"')
  }
  return trimmed
}

function directionLabel(value: string) {
  return DIRECTION_LABELS[value] ?? value
}

function swatchColorForValue(value: string, index: number) {
  let hash = index
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) % ITEM_SWATCH_COLORS.length
  }
  return ITEM_SWATCH_COLORS[hash] ?? ITEM_SWATCH_COLORS[0]
}

function optionSummary(item: OptionItem) {
  const label = resolveOptionLabel(item)
  const value = resolveOptionValue(item)
  const valueIndex = label.lastIndexOf(value)
  if (valueIndex <= 0) {
    return { name: label, code: value }
  }
  return {
    name: label.slice(0, valueIndex).trim(),
    code: value,
  }
}

function parseAnimationFrames(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean)
}

function serializeAnimationFrames(frames: string[]) {
  return frames.join(' ')
}

function toggleAnimationFrame(value: string, frame: string) {
  const frames = parseAnimationFrames(value)
  return frames.includes(frame) ? frames.filter((candidate) => candidate !== frame) : [...frames, frame]
}

function parseQuickQuestion(value: string): QuickQuestionParts {
  const normalized = stripOuterQuotes(value)
  const [promptPart = '', yesBranch = '', noBranch = ''] = normalized.includes('(break)')
    ? normalized.split('(break)').map((part) => part.trim())
    : normalized.split('\\')
  const promptParts = stripOuterQuotes(promptPart).split('#')
  return {
    question: stripOuterQuotes(promptParts[0] ?? ''),
    optionA: promptParts[1] ?? 'Yes',
    optionB: promptParts[2] ?? 'No',
    yesCommand: stripOuterQuotes(yesBranch),
    noCommand: stripOuterQuotes(noBranch),
  }
}

function serializeQuickQuestion(parts: QuickQuestionParts) {
  const prompt = [parts.question, parts.optionA, parts.optionB].join('#')
  const branches = [parts.yesCommand, parts.noCommand].filter(Boolean)
  return branches.length > 0 ? `${prompt}(break)${branches.join('(break)')}` : prompt
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handlerRef.current()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [ref])
}

function stopInteractivePropagation(event: SyntheticEvent) {
  event.stopPropagation()
}

function parseNumberDraft(value: string, fallback: string) {
  const parsed = Number.parseInt(value || fallback || '0', 10)
  return Number.isFinite(parsed) ? parsed : 0
}

export function ParamPill({
  control,
  value,
  label,
  placeholder,
  options,
  onChange,
  onPickMode,
  resourceRegistry,
  disabled,
  size = 'md',
}: ParamPillProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  useClickOutside(containerRef, () => {
    if (editing) {
      setEditing(false)
      if (draft !== value) onChange?.(draft)
    }
  })

  const isEmpty = !value

  function resolveDisplayValue(rawValue: string): string {
    if (control === 'direction') return directionLabel(rawValue)
    if (control === 'toggle') {
      return rawValue === 'true' ? '是' : rawValue === 'false' ? '否' : rawValue
    }
    if (control === 'path_picker') {
      const stepCount = Math.floor(rawValue.trim().split(/\s+/u).filter(Boolean).length / 3)
      return stepCount > 0 ? `${stepCount} 个路径点` : placeholder || label
    }
    if (control === 'animation_frames') {
      const frameCount = rawValue.trim().split(/\s+/u).filter(Boolean).length
      return frameCount > 0 ? `${frameCount} frames · ${rawValue}` : placeholder || label
    }
    if (control === 'quick_question') {
      const parts = parseQuickQuestion(rawValue)
      const optionLabel = [parts.optionA, parts.optionB].filter(Boolean).join(' / ')
      return parts.question ? `${parts.question}${optionLabel ? ` · ${optionLabel}` : ''}` : placeholder || label
    }
    if (options && options.length > 0) {
      const matched = options.find((opt) => resolveOptionValue(opt) === rawValue)
      if (matched) return resolveOptionLabel(matched)
    }
    return rawValue || placeholder || label
  }

  const displayValue = resolveDisplayValue(value)
  const resourceKind = resourceKindForControl(control, placeholder)
  const resourceOptions =
    resourceKind == null
      ? []
      : resourceRegistry?.[resourceKind]?.length
        ? resourceRegistry[resourceKind]
        : (options ?? []).map((option) => optionToResource(resourceKind, option))

  const heightClass = size === 'sm' ? 'h-5 min-h-[20px]' : 'h-6 min-h-[24px]'
  const textClass = size === 'sm' ? 'text-[11px]' : 'text-xs'
  const pxClass = size === 'sm' ? 'px-1.5' : 'px-2'

  const baseClasses = cx(
    'inline-flex items-center gap-1 rounded-md border font-medium transition-all cursor-pointer select-none',
    heightClass,
    textClass,
    pxClass,
    isEmpty
      ? 'border-dashed border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] italic'
      : 'border-[color-mix(in_srgb,var(--accent)_35%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_60%,transparent)] text-[var(--text-primary)]',
    disabled && 'opacity-50 cursor-not-allowed',
    !disabled &&
      'hover:border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] hover:bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)]',
  )

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  function renderIcon() {
    switch (control) {
      case 'tile_picker':
        return <MapPin className={iconSize} />
      case 'path_picker':
        return <Route className={iconSize} />
      case 'npc_selector':
        return <User className={iconSize} />
      case 'music':
        return <Music className={iconSize} />
      case 'sound':
        return <Volume2 className={iconSize} />
      case 'emote':
        return <Smile className={iconSize} />
      case 'item':
        return <Package className={iconSize} />
      case 'animation_frames':
        return <Film className={iconSize} />
      case 'quick_question':
        return <Route className={iconSize} />
      case 'color_rgb':
        return <Palette className={iconSize} />
      default:
        return null
    }
  }

  if (resourceKind && resourceOptions.length > 0) {
    return (
      <span
        ref={containerRef}
        className={cx(baseClasses, 'relative p-0 pr-1')}
        onPointerDown={stopInteractivePropagation}
        onClick={stopInteractivePropagation}
        title={`${label}${isEmpty ? '' : `: ${value}`}`}
      >
        <span className={cx('inline-flex items-center justify-center pl-1.5', iconSize)}>{renderIcon()}</span>
        <EventResourcePicker
          value={value}
          label={label}
          placeholder={placeholder ?? label}
          options={resourceOptions}
          onSelect={(nextValue) => onChange?.(nextValue)}
          triggerClassName={cx('h-5 border-0 bg-transparent px-1', size === 'sm' ? 'max-w-28' : 'max-w-36')}
        />
      </span>
    )
  }

  if (editing) {
    if (control === 'toggle') {
      return (
        <span
          ref={containerRef}
          className="inline-flex items-center gap-1"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          <button
            type="button"
            className={cx(
              baseClasses,
              'border-[color-mix(in_srgb,var(--success)_40%,var(--border-color))] bg-[color-mix(in_srgb,var(--success)_15%,transparent)]',
            )}
            onClick={() => {
              onChange?.('true')
              setEditing(false)
            }}
          >
            是
          </button>
          <button
            type="button"
            className={cx(
              baseClasses,
              'border-[color-mix(in_srgb,var(--danger)_40%,var(--border-color))] bg-[color-mix(in_srgb,var(--danger)_15%,transparent)]',
            )}
            onClick={() => {
              onChange?.('false')
              setEditing(false)
            }}
          >
            否
          </button>
        </span>
      )
    }

    if (control === 'direction') {
      return (
        <span
          ref={containerRef}
          className="inline-flex items-center gap-0.5"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          {(['0', '1', '2', '3'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className={cx(
                'inline-flex h-6 min-h-[24px] items-center justify-center rounded-md border px-1.5 text-[11px] font-medium transition-all',
                value === dir
                  ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--text-primary)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
              onClick={() => {
                onChange?.(dir)
                setEditing(false)
              }}
            >
              {directionLabel(dir)}
            </button>
          ))}
        </span>
      )
    }

    if (control === 'number') {
      const commitNumber = (nextValue: string) => {
        setDraft(nextValue)
        onChange?.(nextValue)
      }
      const stepNumber = (delta: number) => {
        commitNumber(String(parseNumberDraft(draft, value) + delta))
      }

      return (
        <span
          ref={containerRef}
          className="inline-flex h-7 items-center overflow-hidden rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] shadow-sm"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          <button
            type="button"
            className="inline-flex h-full w-6 items-center justify-center border-r border-[var(--border-color)] text-[var(--text-tertiary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
            onClick={() => stepNumber(-1)}
            title="Decrease"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className="h-full w-14 bg-transparent px-1 text-center font-mono text-xs font-semibold text-[var(--text-primary)] outline-none"
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setEditing(false)
                onChange?.(draft)
              }
              if (event.key === 'Escape') {
                setEditing(false)
                setDraft(value)
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                stepNumber(1)
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                stepNumber(-1)
              }
            }}
          />
          <button
            type="button"
            className="inline-flex h-full w-6 items-center justify-center border-l border-[var(--border-color)] text-[var(--text-tertiary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]"
            onClick={() => stepNumber(1)}
            title="Increase"
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      )
    }

    if (control === 'textarea') {
      return (
        <span
          ref={containerRef}
          className="inline-grid w-[340px] gap-1 rounded-md border border-[var(--accent)] bg-[var(--bg-elevated)] p-2 shadow-[var(--shadow-float)]"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          <span className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-[10px] font-semibold tracking-wide text-[var(--text-tertiary)] uppercase">{label}</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">Enter apply · Shift+Enter newline</span>
          </span>
          <textarea
            ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            className={cx(
              'min-h-20 resize-y rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs leading-relaxed text-[var(--text-primary)] outline-none',
              'focus:ring-1 focus:ring-[var(--accent)]',
            )}
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                setEditing(false)
                onChange?.(draft)
              }
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(value)
              }
            }}
          />
          <span className="flex justify-end gap-1">
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              onClick={() => {
                setEditing(false)
                setDraft(value)
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md border border-[color-mix(in_srgb,var(--accent)_45%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_75%,transparent)] px-2 text-[11px] font-semibold text-[var(--accent)]"
              onClick={() => {
                setEditing(false)
                onChange?.(draft)
              }}
            >
              Apply
            </button>
          </span>
        </span>
      )
    }

    if (control === 'choice' && options && options.length > 0) {
      return (
        <span
          ref={containerRef}
          className="inline-flex items-center gap-0.5"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          {options.map((opt) => {
            const optValue = resolveOptionValue(opt)
            const optLabel = resolveOptionLabel(opt)
            return (
              <button
                key={optValue}
                type="button"
                className={cx(
                  'inline-flex h-6 min-h-[24px] items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-all',
                  value === optValue
                    ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--text-primary)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                )}
                onClick={() => {
                  onChange?.(optValue)
                  setEditing(false)
                }}
              >
                {optLabel}
              </button>
            )
          })}
        </span>
      )
    }

    if (control === 'item' && options && options.length > 0) {
      const filteredItems = options.filter((opt) => optionMatchesFilter(opt, draft)).slice(0, 12)
      return (
        <span
          ref={containerRef}
          className="inline-grid w-[300px] gap-2 rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] p-2 shadow-sm"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          <input
            ref={inputRef}
            type="text"
            className="control-input h-7 text-xs"
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setEditing(false)
                onChange?.(draft)
              }
              if (event.key === 'Escape') {
                setEditing(false)
                setDraft(value)
              }
            }}
          />
          <span className="grid max-h-48 grid-cols-3 gap-1 overflow-auto">
            {filteredItems.map((opt, itemIndex) => {
              const optValue = resolveOptionValue(opt)
              const selected = optValue === value
              const { name, code } = optionSummary(opt)
              const color = swatchColorForValue(optValue, itemIndex)
              return (
                <button
                  key={optValue}
                  type="button"
                  aria-label={resolveOptionLabel(opt)}
                  className={cx(
                    'flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-center transition-all',
                    selected
                      ? 'border-[color-mix(in_srgb,var(--accent)_70%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_85%,transparent)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-app)] hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--border-color))]',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onChange?.(optValue)
                    setEditing(false)
                  }}
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded border border-white/30 font-mono text-[10px] font-bold text-white shadow-sm"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  >
                    {code.replace(/\D/gu, '').slice(-2) || '??'}
                  </span>
                  <span className="w-full truncate text-[10px] font-medium text-[var(--text-primary)]">{name}</span>
                  <span className="font-mono text-[9px] text-[var(--text-tertiary)]">{code}</span>
                </button>
              )
            })}
          </span>
        </span>
      )
    }

    if (control === 'emote' && options && options.length > 0) {
      return (
        <span
          ref={containerRef}
          className="inline-grid w-[264px] grid-cols-8 gap-1 rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] p-2 shadow-sm"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          {options.map((opt) => {
            const optValue = resolveOptionValue(opt)
            const selected = optValue === value
            return (
              <button
                key={optValue}
                type="button"
                className={cx(
                  'flex h-8 min-w-0 items-center justify-center rounded-md border font-mono text-[10px] font-semibold transition-all',
                  selected
                    ? 'border-[color-mix(in_srgb,var(--accent)_70%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--accent)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-app)] text-[var(--text-secondary)] hover:border-[color-mix(in_srgb,var(--accent)_50%,var(--border-color))] hover:text-[var(--text-primary)]',
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange?.(optValue)
                  setEditing(false)
                }}
                title={resolveOptionLabel(opt)}
              >
                {EMOTE_ICONS[optValue] ?? optValue}
              </button>
            )
          })}
        </span>
      )
    }

    if (control === 'animation_frames') {
      const activeFrames = new Set(parseAnimationFrames(draft))
      return (
        <span
          ref={containerRef}
          className="inline-flex flex-col gap-1"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          <span className="inline-flex flex-wrap items-center gap-0.5">
            {FRAME_SEQUENCE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={cx(
                  'inline-flex h-6 min-h-[24px] items-center justify-center rounded-md border px-2 text-[11px] font-medium transition-all',
                  value === preset.value
                    ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--text-primary)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                )}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange?.(preset.value)
                  setEditing(false)
                }}
              >
                {preset.label}
              </button>
            ))}
          </span>
          <span className="grid w-56 grid-cols-8 gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] p-1">
            {Array.from({ length: 32 }, (_, frame) => String(frame)).map((frame) => {
              const selected = activeFrames.has(frame)
              return (
                <button
                  key={frame}
                  type="button"
                  className={cx(
                    'flex h-6 min-w-0 items-center justify-center rounded border font-mono text-[10px] transition-all',
                    selected
                      ? 'border-[color-mix(in_srgb,var(--accent)_70%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--accent)]'
                      : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setDraft(serializeAnimationFrames(toggleAnimationFrame(draft, frame)))
                  }}
                >
                  {frame}
                </button>
              )
            })}
          </span>
          <input
            ref={inputRef}
            type="text"
            className={cx(
              'inline-flex h-6 min-h-[24px] w-44 rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] px-2 text-xs text-[var(--text-primary)] shadow-sm outline-none',
              'focus:ring-1 focus:ring-[var(--accent)]',
            )}
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditing(false)
                onChange?.(draft)
              }
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(value)
              }
            }}
          />
        </span>
      )
    }

    if (control === 'quick_question') {
      const parts = parseQuickQuestion(draft)
      const updatePart = (patch: Partial<QuickQuestionParts>) => {
        setDraft(serializeQuickQuestion({ ...parts, ...patch }))
      }

      return (
        <span
          ref={containerRef}
          className="inline-grid w-[360px] gap-1 rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] p-2 shadow-sm"
          onPointerDown={stopInteractivePropagation}
          onClick={stopInteractivePropagation}
        >
          <input
            ref={inputRef}
            type="text"
            className="control-input h-7 text-xs"
            value={parts.question}
            placeholder="Question"
            onChange={(event) => updatePart({ question: event.target.value })}
          />
          <span className="grid grid-cols-2 gap-1">
            <input
              type="text"
              className="control-input h-7 text-xs"
              value={parts.optionA}
              placeholder="Option A"
              onChange={(event) => updatePart({ optionA: event.target.value })}
            />
            <input
              type="text"
              className="control-input h-7 text-xs"
              value={parts.optionB}
              placeholder="Option B"
              onChange={(event) => updatePart({ optionB: event.target.value })}
            />
          </span>
          <span className="grid grid-cols-2 gap-1">
            <input
              type="text"
              className="control-input h-7 text-xs"
              value={parts.yesCommand}
              placeholder="Yes branch command"
              onChange={(event) => updatePart({ yesCommand: event.target.value })}
            />
            <input
              type="text"
              className="control-input h-7 text-xs"
              value={parts.noCommand}
              placeholder="No branch command"
              onChange={(event) => updatePart({ noCommand: event.target.value })}
            />
          </span>
          <span className="flex justify-end gap-1">
            <button
              type="button"
              className="control-button h-7 text-xs"
              onClick={() => {
                onChange?.(draft)
                setEditing(false)
              }}
            >
              Apply
            </button>
          </span>
        </span>
      )
    }

    // 带选项列表的可过滤输入（用于 npc_selector / music / sound / text 等）
    const hasOptions = options && options.length > 0
    const filteredOptions = hasOptions ? options.filter((opt) => optionMatchesFilter(opt, draft)).slice(0, 20) : []

    return (
      <span
        ref={containerRef}
        className="inline-flex flex-col"
        onPointerDown={stopInteractivePropagation}
        onClick={stopInteractivePropagation}
      >
        <span className="inline-flex items-center">
          <input
            ref={inputRef}
            type="text"
            className={cx(
              'inline-flex rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] px-2 text-xs text-[var(--text-primary)] shadow-sm outline-none',
              heightClass,
              'w-28',
              'focus:ring-1 focus:ring-[var(--accent)]',
            )}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setEditing(false)
                onChange?.(draft)
              }
              if (e.key === 'Escape') {
                setEditing(false)
                setDraft(value)
              }
            }}
          />
          {(control === 'tile_picker' || control === 'npc_selector' || control === 'path_picker') && onPickMode && (
            <button
              type="button"
              className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              onClick={() => {
                setEditing(false)
                onPickMode()
              }}
              title={control === 'path_picker' ? '从地图选择路径' : '从地图拾取'}
            >
              {control === 'path_picker' ? <Route className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
            </button>
          )}
        </span>
        {hasOptions && filteredOptions.length > 0 && (
          <div className="mt-1 max-h-32 w-40 overflow-auto rounded-md border border-[var(--border-color)] bg-[var(--bg-panel)] p-1 shadow-sm">
            {filteredOptions.map((opt) => {
              const optValue = resolveOptionValue(opt)
              const optLabel = resolveOptionLabel(opt)
              return (
                <button
                  key={optValue}
                  type="button"
                  className={cx(
                    'block w-full rounded px-1.5 py-0.5 text-left text-[11px] transition-colors',
                    value === optValue
                      ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] font-medium text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]',
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onChange?.(optValue)
                    setEditing(false)
                  }}
                >
                  {optLabel}
                </button>
              )
            })}
          </div>
        )}
      </span>
    )
  }

  return (
    <button
      type="button"
      ref={containerRef as React.RefObject<HTMLButtonElement>}
      className={baseClasses}
      onPointerDown={stopInteractivePropagation}
      onClick={(event) => {
        event.stopPropagation()
        if (!disabled) {
          if (control === 'path_picker' && onPickMode) {
            onPickMode()
            return
          }
          setDraft(value)
          setEditing(true)
        }
      }}
      title={`${label}${isEmpty ? '' : `: ${value}`}`}
    >
      {renderIcon()}
      <span className="max-w-[140px] truncate">{displayValue}</span>
    </button>
  )
}
