import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@shared/lib/cx'

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

type DialogProps = {
  /** When false, renders nothing. */
  open: boolean
  /** Invoked on Escape (unless disabled) and on backdrop click (unless disabled). */
  onClose: () => void
  /** id of the element labeling the dialog (usually a DialogHeader title id). */
  labelledBy?: string
  /** Accessible name when there is no visible title. */
  ariaLabel?: string
  /** id of an element describing the dialog. */
  describedBy?: string
  /** Whether clicking the backdrop calls onClose. Defaults to true. */
  closeOnBackdrop?: boolean
  /** Whether pressing Escape calls onClose. Defaults to true. */
  closeOnEscape?: boolean
  /** Card width preset. Defaults to `md`. */
  size?: DialogSize
  /**
   * Mark this dialog as nested (opened from within another dialog) so it stacks
   * above its parent via `--z-dialog-stack`.
   */
  stack?: boolean
  /**
   * Skip the fixed header/body/footer grid card chrome. Use when the content
   * owns its own full layout (e.g. the event condition builder with external
   * docks). The overlay, portal, focus trap, and a11y still apply; only the
   * card's grid/max-height/overflow constraints are dropped.
   */
  bare?: boolean
  /** Dialog content. Use DialogHeader / DialogBody / DialogFooter for the chrome. */
  children: ReactNode
  className?: string
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const openDialogStack: string[] = []
let bodyScrollLockDepth = 0
let previousBodyOverflow: string | null = null

function isTopDialog(dialogId: string) {
  return openDialogStack[openDialogStack.length - 1] === dialogId
}

function removeDialogFromStack(dialogId: string) {
  const index = openDialogStack.lastIndexOf(dialogId)
  if (index >= 0) {
    openDialogStack.splice(index, 1)
  }
}

function lockBodyScroll(ownerDocument: Document) {
  if (bodyScrollLockDepth === 0) {
    previousBodyOverflow = ownerDocument.body.style.overflow
    ownerDocument.body.style.overflow = 'hidden'
  }
  bodyScrollLockDepth += 1

  return () => {
    bodyScrollLockDepth = Math.max(0, bodyScrollLockDepth - 1)
    if (bodyScrollLockDepth === 0) {
      ownerDocument.body.style.overflow = previousBodyOverflow ?? ''
      previousBodyOverflow = null
    }
  }
}

function isFocusableElement(element: HTMLElement) {
  return !element.hasAttribute('disabled') && !element.hidden && element.getAttribute('aria-hidden') !== 'true'
}

/**
 * The single modal container for the app.
 *
 * Portals to `document.body`, clips the overlay to below the titlebar via
 * `--app-titlebar-height`, traps focus, restores focus on close, locks body
 * scroll, and handles Escape + backdrop dismiss. Every modal goes through here
 * so stacking, titlebar avoidance, and a11y are uniform.
 */
export function Dialog({
  open,
  onClose,
  labelledBy,
  ariaLabel,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  size = 'md',
  stack = false,
  bare = false,
  children,
  className,
}: DialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const fallbackTitleId = useId()
  const dialogInstanceId = useId()
  const onCloseRef = useRef(onClose)
  const closeOnEscapeRef = useRef(closeOnEscape)
  // Prefer an explicit labelledBy (from a DialogHeader title); else an aria-label;
  // else a hidden fallback label so the dialog is always announced.
  const hasExplicitLabel = Boolean(labelledBy || ariaLabel)

  useEffect(() => {
    onCloseRef.current = onClose
    closeOnEscapeRef.current = closeOnEscape
  })

  useEffect(() => {
    if (!open) {
      return
    }

    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null
    const ownerDocument = document
    openDialogStack.push(dialogInstanceId)
    const unlockBodyScroll = lockBodyScroll(ownerDocument)

    const node = cardRef.current
    if (node) {
      const alreadyInside = ownerDocument.activeElement && node.contains(ownerDocument.activeElement)
      if (!alreadyInside) {
        const autofocus = node.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
        const firstFocusable = autofocus ?? node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        ;(firstFocusable ?? node).focus()
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopDialog(dialogInstanceId)) {
        return
      }

      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        if (closeOnEscapeRef.current) {
          onCloseRef.current()
        }
        return
      }

      // Focus trap: keep Tab cycling within the dialog.
      if (event.key === 'Tab' && node) {
        const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusableElement)
        if (!focusables.length) {
          event.preventDefault()
          node.focus()
          return
        }

        const first = focusables[0]!
        const last = focusables[focusables.length - 1]!
        const active = ownerDocument.activeElement

        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    ownerDocument.addEventListener('keydown', handleKeyDown, true)

    return () => {
      const wasTopDialog = isTopDialog(dialogInstanceId)
      ownerDocument.removeEventListener('keydown', handleKeyDown, true)
      removeDialogFromStack(dialogInstanceId)
      unlockBodyScroll()
      const previous = previouslyFocusedRef.current
      if (wasTopDialog && previous && typeof previous.focus === 'function') {
        previous.focus()
      }
    }
  }, [open, dialogInstanceId])

  if (!open) {
    return null
  }

  const handleBackdropPointerDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isTopDialog(dialogInstanceId)) {
      return
    }
    if (!closeOnBackdrop) {
      return
    }
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return createPortal(
    <div
      className="app-dialog-overlay"
      data-dialog-stacked={stack ? 'true' : undefined}
      data-dialog-bare={bare ? 'true' : undefined}
      role="presentation"
      onMouseDown={handleBackdropPointerDown}
    >
      <div
        ref={cardRef}
        className={cx('app-dialog', `app-dialog-size-${size}`, bare && 'app-dialog-bare', className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? (ariaLabel ? undefined : fallbackTitleId)}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {hasExplicitLabel ? null : (
          <span id={fallbackTitleId} className="sr-only">
            Dialog
          </span>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
