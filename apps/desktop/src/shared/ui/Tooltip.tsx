import type { ReactNode } from 'react'
import { useCallback, useId, useState } from 'react'
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'

type TooltipProps = {
  label: ReactNode
  children: ReactNode
  disabled?: boolean
  className?: string
  placement?: 'top' | 'right' | 'bottom' | 'left'
}

const TOOLTIP_OFFSET = 8
const TOOLTIP_VIEWPORT_PADDING = 10
const TOOLTIP_OPEN_DELAY_MS = 260

/**
 * Small app-styled tooltip for replacing native browser title popups on selected UI.
 * It owns hover/focus positioning only and does not mutate child behavior.
 */
export function Tooltip({ label, children, disabled = false, className, placement = 'top' }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()
  const enabled = !disabled && Boolean(label)

  const {
    refs: floatingRefs,
    floatingStyles,
    context,
    isPositioned,
  } = useFloating({
    open: enabled ? open : false,
    onOpenChange: setOpen,
    placement,
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(TOOLTIP_OFFSET), flip({ padding: TOOLTIP_VIEWPORT_PADDING }), shift({ padding: TOOLTIP_VIEWPORT_PADDING })],
  })

  const hover = useHover(context, {
    enabled,
    delay: { open: TOOLTIP_OPEN_DELAY_MS, close: 60 },
    move: false,
  })
  const focus = useFocus(context, { enabled })
  const role = useRole(context, { role: 'tooltip' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, role])
  const setReference = useCallback(
    (node: HTMLSpanElement | null) => {
      floatingRefs.setReference(node)
    },
    [floatingRefs],
  )
  const setFloating = useCallback(
    (node: HTMLDivElement | null) => {
      floatingRefs.setFloating(node)
    },
    [floatingRefs],
  )

  return (
    <>
      <span ref={setReference} className={className} aria-describedby={enabled && open ? tooltipId : undefined} {...getReferenceProps()}>
        {children}
      </span>

      {enabled && open ? (
        <FloatingPortal>
          <div
            ref={setFloating}
            id={tooltipId}
            className="app-tooltip"
            style={{
              ...floatingStyles,
              visibility: isPositioned ? 'visible' : 'hidden',
            }}
            {...getFloatingProps()}
          >
            {label}
          </div>
        </FloatingPortal>
      ) : null}
    </>
  )
}
