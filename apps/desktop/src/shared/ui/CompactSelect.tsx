import {
  useEffect,
  useCallback,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react'
import { cx } from '@shared/lib/helper'

export type CompactSelectOption<TValue extends string | number> = {
  value: TValue
  label: string
  description?: string
  disabled?: boolean
}

type CompactSelectProps<TValue extends string | number> = {
  value: TValue
  options: readonly CompactSelectOption<TValue>[]
  onChange: (value: TValue) => void
  ariaLabel: string
  /** Shown on the trigger when the value matches no option; without it the first option is displayed instead. */
  placeholder?: string
  className?: string
  triggerClassName?: string
  menuClassName?: string
  disabled?: boolean
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'
}

const SELECT_OFFSET = 6
const VIEWPORT_PADDING = 10

/**
 * Compact app-styled select for small toolbars and footers.
 * It owns popover positioning and basic keyboard/open-state behavior without leaking platform-specific UI.
 */
export function CompactSelect<TValue extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder,
  className,
  triggerClassName,
  menuClassName,
  disabled = false,
  placement = 'bottom-end',
}: CompactSelectProps<TValue>) {
  const [open, setOpen] = useState(false)
  const listboxId = useId()
  const selectedOption = options.find((option) => Object.is(option.value, value)) ?? (placeholder == null ? options[0] : null) ?? null
  const enabled = !disabled && options.length > 0
  const triggerLabel = selectedOption ? `${ariaLabel}: ${selectedOption.label}` : placeholder ? `${ariaLabel}: ${placeholder}` : ariaLabel
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: enabled ? open : false,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(SELECT_OFFSET), flip({ padding: VIEWPORT_PADDING }), shift({ padding: VIEWPORT_PADDING })],
  })
  const setFloatingReference = refs.setReference
  const setFloatingElement = refs.setFloating

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: globalThis.MouseEvent) {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return
      }

      setOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const setTriggerNode = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node
      setFloatingReference(node)
    },
    [setFloatingReference],
  )

  const setMenuNode = useCallback(
    (node: HTMLDivElement | null) => {
      menuRef.current = node
      setFloatingElement(node)
    },
    [setFloatingElement],
  )

  function focusOption(offsetIndex: number) {
    const activeOptions = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled)
    if (activeOptions.length === 0) {
      return
    }

    const currentIndex = activeOptions.findIndex(({ option }) => Object.is(option.value, value))
    const nextIndex = (Math.max(0, currentIndex) + offsetIndex + activeOptions.length) % activeOptions.length
    const nextOption = activeOptions[nextIndex]
    if (nextOption) {
      optionRefs.current[nextOption.index]?.focus()
    }
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
      window.requestAnimationFrame(() => focusOption(0))
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(-1)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  function selectOption(option: CompactSelectOption<TValue>) {
    if (option.disabled) {
      return
    }

    onChange(option.value)
    setOpen(false)
  }

  function stopPointerPropagation(event: ReactPointerEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) {
    event.stopPropagation()
  }

  return (
    <span className={cx('compact-select', className)}>
      <button
        ref={setTriggerNode}
        type="button"
        className={cx('compact-select__trigger', triggerClassName)}
        disabled={!enabled}
        aria-label={triggerLabel}
        aria-haspopup="listbox"
        aria-expanded={enabled ? open : undefined}
        aria-controls={open ? listboxId : undefined}
        onPointerDown={stopPointerPropagation}
        onMouseDown={stopPointerPropagation}
        onClick={() => setOpen((current) => (enabled ? !current : false))}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={cx('compact-select__value', !selectedOption && placeholder != null && 'is-placeholder')}>
          {selectedOption?.label ?? placeholder ?? ''}
        </span>
        <span className="compact-select__chevron" aria-hidden />
      </button>

      {enabled && open ? (
        <FloatingPortal>
          <div
            ref={setMenuNode}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className={cx('compact-select__menu', menuClassName)}
            style={{
              ...floatingStyles,
              opacity: isPositioned ? 1 : 0,
              pointerEvents: isPositioned ? undefined : 'none',
            }}
            onPointerDown={stopPointerPropagation}
            onMouseDown={stopPointerPropagation}
            onClick={stopPointerPropagation}
          >
            {options.map((option, index) => {
              const selected = Object.is(option.value, value)
              return (
                <button
                  key={String(option.value)}
                  ref={(node) => {
                    optionRefs.current[index] = node
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cx('compact-select__option', selected && 'is-selected')}
                  disabled={option.disabled}
                  onPointerDown={stopPointerPropagation}
                  onMouseDown={stopPointerPropagation}
                  onClick={() => selectOption(option)}
                  onKeyDown={handleOptionKeyDown}
                >
                  <span className="compact-select__option-label">{option.label}</span>
                  {option.description ? <span className="compact-select__option-description">{option.description}</span> : null}
                </button>
              )
            })}
          </div>
        </FloatingPortal>
      ) : null}
    </span>
  )
}
