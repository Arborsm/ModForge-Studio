/**
 * @file Generic mobile bottom sheet: dimmed backdrop + rounded panel sliding up
 * from the bottom of the screen. Used by the launcher filter and launch
 * preflight sheets on the Android host.
 */
import { useEffect, type ReactNode } from 'react'
import { cx } from '@shared/lib/helper'

type MobileSheetProps = {
  open: boolean
  onClose: () => void
  /** Accessible title rendered as the sheet heading. */
  title: string
  children: ReactNode
  /** Extra class for the panel (e.g. sheet variant sizing). */
  className?: string
}

/** Bottom sheet that closes on backdrop tap and on Escape. */
export function MobileSheet({ open, onClose, title, children, className }: MobileSheetProps) {
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

  if (!open) {
    return null
  }

  return (
    <div className="mobile-sheet-root">
      <button type="button" className="mobile-sheet-dim" aria-label={title} onClick={onClose} tabIndex={-1} />
      <section className={cx('mobile-sheet', className)} role="dialog" aria-modal="true" aria-label={title}>
        <span className="mobile-sheet-handle" aria-hidden="true" />
        <h3 className="mobile-sheet-title">{title}</h3>
        {children}
      </section>
    </div>
  )
}
