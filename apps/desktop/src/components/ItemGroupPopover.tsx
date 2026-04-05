import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useState } from 'react'
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'

type ItemGroupPopoverProps<T> = {
  groupIcon: ReactNode | ((isOpen: boolean) => ReactNode)
  items: T[]
  renderItem: (item: T, index: number) => ReactNode
  title?: string
  subtitle?: string
}

const VIEWPORT_PADDING = 12
const POPOVER_GAP = 10
const MAX_POPOVER_WIDTH = 560
const MAX_POPOVER_HEIGHT = 360
const ITEM_TILE_WIDTH = 88
const ITEM_TILE_GAP = 8

function getPopoverColumnCount(itemCount: number) {
  if (itemCount <= 1) {
    return 1
  }
  if (itemCount <= 3) {
    return itemCount
  }
  if (itemCount <= 4) {
    return 2
  }
  if (itemCount <= 9) {
    return 3
  }
  return 4
}

export function ItemGroupPopover<T>({
  groupIcon,
  items,
  renderItem,
  title,
  subtitle,
}: ItemGroupPopoverProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const hasItems = items.length > 0
  const columnCount = getPopoverColumnCount(items.length)
  const iconNode = typeof groupIcon === 'function' ? groupIcon(isOpen) : groupIcon

  const { refs, floatingStyles, context, placement, isPositioned } = useFloating({
    open: hasItems ? isOpen : false,
    onOpenChange: setIsOpen,
    placement: 'top',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(POPOVER_GAP),
      flip({
        padding: VIEWPORT_PADDING,
      }),
      shift({
        padding: VIEWPORT_PADDING,
      }),
    ],
  })

  const hover = useHover(context, {
    enabled: hasItems,
    handleClose: safePolygon({
      buffer: 1,
    }),
    restMs: 150,
  })
  const focus = useFocus(context, {
    enabled: hasItems,
  })
  const dismiss = useDismiss(context, {
    enabled: hasItems,
  })
  const role = useRole(context, { role: 'tooltip' })

  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role])
  const { setReference, setFloating, setPositionReference } = refs

  const handleReferenceRef = useCallback(
    (node: HTMLDivElement | null) => {
      setReference(node)
      if (!node) {
        setPositionReference(null)
        return
      }

      const anchor =
        node.querySelector<HTMLElement>('[data-gift-anchor="true"]') ??
        node.querySelector<HTMLElement>('[data-popover-anchor="true"]')

      setPositionReference(anchor ?? node)
    },
    [setPositionReference, setReference],
  )

  const gridStyle: CSSProperties = {
    ['--item-group-columns' as string]: `${columnCount}`,
    ['--item-group-gap' as string]: `${ITEM_TILE_GAP}px`,
    ['--item-group-tile-width' as string]: `${ITEM_TILE_WIDTH}px`,
  }

  return (
    <>
      <div
        ref={handleReferenceRef}
        className="item-group-trigger"
        aria-expanded={hasItems ? isOpen : undefined}
        tabIndex={hasItems ? 0 : undefined}
        {...getReferenceProps()}
      >
        {iconNode}
        <span className="item-group-badge">{items.length}</span>
      </div>

      {hasItems && isOpen ? (
        <FloatingPortal>
          <div
            ref={setFloating}
            className="item-group-popover"
            data-placement={placement}
            style={{
              ...floatingStyles,
              maxHeight: `min(${MAX_POPOVER_HEIGHT}px, calc(100vh - ${VIEWPORT_PADDING * 2}px))`,
              maxWidth: `min(${MAX_POPOVER_WIDTH}px, calc(100vw - ${VIEWPORT_PADDING * 2}px))`,
              visibility: isPositioned ? 'visible' : 'hidden',
            }}
            {...getFloatingProps()}
          >
            <div className="item-group-popover-inner">
              {title || subtitle ? (
                <div className="item-group-header">
                  {title ? <p className="item-group-title">{title}</p> : null}
                  {subtitle ? <p className="item-group-subtitle">{subtitle}</p> : null}
                </div>
              ) : null}

              <div className="item-group-grid" style={gridStyle}>
                {items.map((item, index) => (
                  <div key={index} className="item-group-cell">
                    {renderItem(item, index)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  )
}
