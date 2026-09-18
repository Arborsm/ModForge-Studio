/**
 * @file Generic mobile overlays on the Android host: a bottom sheet (dimmed
 * backdrop + rounded panel sliding up) and a centered dialog variant. Used by
 * the launcher filter, launch preflight, and jump-to-page flows.
 *
 * The root portals to document.body: overlays render inside page markup whose
 * animated ancestors carry transforms, which would otherwise become the
 * containing block for the fixed positioning and trap the overlay inside the
 * page container (the same reason the mod detail drawer portals).
 */
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@shared/lib/helper'

type MobileSheetProps = {
  open: boolean
  onClose: () => void
  /** Accessible title rendered as the overlay heading. */
  title: string
  children: ReactNode
  /** Extra class for the panel (e.g. sheet variant sizing). */
  className?: string
  /** 'sheet' slides up from the bottom with a drag handle; 'dialog' is a centered card. */
  presentation?: 'sheet' | 'dialog'
}

/** Bottom sheet / centered dialog that closes on backdrop tap and on Escape. */
export function MobileSheet({ open, onClose, title, children, className, presentation = 'sheet' }: MobileSheetProps) {
  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || typeof document === 'undefined') {
    return null
  }

  if (presentation === 'dialog') {
    return createPortal(
      <div className="mobile-sheet-root">
        <button type="button" className="mobile-sheet-dim" aria-label={title} onClick={onClose} tabIndex={-1} />
        <section className={cx('mobile-dialog', className)} role="dialog" aria-modal="true" aria-label={title}>
          <h3 className="mobile-dialog-title">{title}</h3>
          {children}
        </section>
      </div>,
      document.body,
    )
  }

  return createPortal(
    <div className="mobile-sheet-root">
      <button type="button" className="mobile-sheet-dim" aria-label={title} onClick={onClose} tabIndex={-1} />
      <section className={cx('mobile-sheet', className)} role="dialog" aria-modal="true" aria-label={title}>
        <span className="mobile-sheet-handle" aria-hidden="true" />
        <h3 className="mobile-sheet-title">{title}</h3>
        {children}
      </section>
    </div>,
    document.body,
  )
}
