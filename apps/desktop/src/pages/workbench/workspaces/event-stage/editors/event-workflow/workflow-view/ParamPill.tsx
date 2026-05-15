// 参数胶囊 — 嵌入自然语言句子中的可编辑参数

import { useState, useRef, useEffect } from 'react'
import { MapPin, User, Music, Volume2, Smile, Palette } from 'lucide-react'
import { cx } from '@shared/lib/cx'
import type { UIControlType, OptionItem } from '../workflow-model/commandSchema'

export type ParamPillProps = {
  control: UIControlType
  value: string
  label: string
  placeholder?: string
  options?: OptionItem[]
  onChange?: (value: string) => void
  onPickMode?: () => void
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

const DIRECTION_LABELS: Record<string, string> = {
  '0': '上', '1': '右', '2': '下', '3': '左',
  'up': '上', 'right': '右', 'down': '下', 'left': '左',
}

function directionLabel(value: string) {
  return DIRECTION_LABELS[value] ?? value
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

export function ParamPill({
  control,
  value,
  label,
  placeholder,
  options,
  onChange,
  onPickMode,
  disabled,
  size = 'md',
}: ParamPillProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLSpanElement>(null)

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
    if (options && options.length > 0) {
      const matched = options.find((opt) => resolveOptionValue(opt) === rawValue)
      if (matched) return resolveOptionLabel(matched)
    }
    return rawValue || placeholder || label
  }

  const displayValue = resolveDisplayValue(value)

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
    !disabled && 'hover:border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] hover:bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)]',
  )

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  function renderIcon() {
    switch (control) {
      case 'tile_picker':
        return <MapPin className={iconSize} />
      case 'npc_selector':
        return <User className={iconSize} />
      case 'music':
        return <Music className={iconSize} />
      case 'sound':
        return <Volume2 className={iconSize} />
      case 'emote':
        return <Smile className={iconSize} />
      case 'color_rgb':
        return <Palette className={iconSize} />
      default:
        return null
    }
  }

  if (editing) {
    if (control === 'toggle') {
      return (
        <span ref={containerRef} className="inline-flex items-center gap-1">
          <button
            type="button"
            className={cx(baseClasses, 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_40%,var(--border-color))]')}
            onClick={() => { onChange?.('true'); setEditing(false) }}
          >
            是
          </button>
          <button
            type="button"
            className={cx(baseClasses, 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] border-[color-mix(in_srgb,var(--danger)_40%,var(--border-color))]')}
            onClick={() => { onChange?.('false'); setEditing(false) }}
          >
            否
          </button>
        </span>
      )
    }

    if (control === 'direction') {
      return (
        <span ref={containerRef} className="inline-flex items-center gap-0.5">
          {(['0', '1', '2', '3'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              className={cx(
                'inline-flex items-center justify-center rounded-md border text-[11px] font-medium transition-all h-6 min-h-[24px] px-1.5',
                value === dir
                  ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--text-primary)]'
                  : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
              )}
              onClick={() => { onChange?.(dir); setEditing(false) }}
            >
              {directionLabel(dir)}
            </button>
          ))}
        </span>
      )
    }

    if (control === 'textarea') {
      return (
        <span ref={containerRef} className="inline-block">
          <textarea
            ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            className={cx(
              'w-64 resize-y rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none shadow-sm',
              'focus:ring-1 focus:ring-[var(--accent)]',
            )}
            rows={2}
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
        </span>
      )
    }

    if (control === 'choice' && options && options.length > 0) {
      return (
        <span ref={containerRef} className="inline-flex items-center gap-0.5">
          {options.map((opt) => {
            const optValue = resolveOptionValue(opt)
            const optLabel = resolveOptionLabel(opt)
            return (
              <button
                key={optValue}
                type="button"
                className={cx(
                  'inline-flex items-center justify-center rounded-md border text-[11px] font-medium transition-all h-6 min-h-[24px] px-2',
                  value === optValue
                    ? 'border-[color-mix(in_srgb,var(--accent)_60%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent-soft)_90%,transparent)] text-[var(--text-primary)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]',
                )}
                onClick={() => { onChange?.(optValue); setEditing(false) }}
              >
                {optLabel}
              </button>
            )
          })}
        </span>
      )
    }

    // 带选项列表的可过滤输入（用于 npc_selector / music / sound / text 等）
    const hasOptions = options && options.length > 0
    const filteredOptions = hasOptions
      ? options.filter((opt) => optionMatchesFilter(opt, draft)).slice(0, 20)
      : []

    return (
      <span ref={containerRef} className="inline-flex flex-col">
        <span className="inline-flex items-center">
          <input
            ref={inputRef}
            type={control === 'number' ? 'number' : 'text'}
            className={cx(
              'inline-flex rounded-md border border-[var(--accent)] bg-[var(--bg-panel)] px-2 outline-none text-xs text-[var(--text-primary)] shadow-sm',
              heightClass,
              control === 'number' ? 'w-16' : 'w-28',
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
          {(control === 'tile_picker' || control === 'npc_selector') && onPickMode && (
            <button
              type="button"
              className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-panel-muted)] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              onClick={() => { setEditing(false); onPickMode() }}
              title="从地图拾取"
            >
              <MapPin className="h-3 w-3" />
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
                      ? 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[var(--accent)] font-medium'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)] hover:text-[var(--text-primary)]',
                  )}
                  onClick={() => {
                    setEditing(false)
                    onChange?.(optValue)
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
    <span
      ref={containerRef}
      className={baseClasses}
      onClick={() => {
        if (!disabled) {
          setDraft(value)
          setEditing(true)
        }
      }}
      title={`${label}${isEmpty ? '' : `: ${value}`}`}
    >
      {renderIcon()}
      <span className="truncate max-w-[140px]">{displayValue}</span>
    </span>
  )
}
