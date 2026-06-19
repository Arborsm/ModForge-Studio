import { X } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useId } from 'react'
import { cx } from '@shared/lib/cx'

export type DialogHeaderTone = 'default' | 'danger' | 'warning'

type DialogHeaderProps = {
  /** Title text, also used as the dialog's accessible name via aria-labelledby. */
  title: string
  /** Optional supporting copy rendered under the title. */
  subtitle?: ReactNode
  /** Optional leading icon (e.g. AlertTriangle for confirmations). */
  icon?: ReactNode
  /** Tints the icon; does not affect the title color. */
  tone?: DialogHeaderTone
  /** Invoked by the close button. */
  onClose: () => void
  /** Accessible label for the close button. */
  closeLabel: string
  /** Disables only the header close button; Escape/backdrop are controlled by Dialog props. */
  closeDisabled?: boolean
  /** id assigned to the title element; pass as `labelledBy` to `Dialog`. */
  id?: string
}

/** Standard dialog header: optional icon + title + subtitle on the left, close button on the right. */
export function DialogHeader({
  title,
  subtitle,
  icon,
  tone = 'default',
  onClose,
  closeLabel,
  closeDisabled = false,
  id,
}: DialogHeaderProps) {
  const generatedId = useId()
  const titleId = id ?? generatedId

  return (
    <header className="app-dialog-header">
      <div className="app-dialog-heading">
        <div className="app-dialog-title-row">
          {icon ? (
            <span className="app-dialog-icon" data-tone={tone} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <h2 className="app-dialog-title" id={titleId}>
            {title}
          </h2>
        </div>
        {subtitle ? <p className="app-dialog-subtitle">{subtitle}</p> : null}
      </div>
      <button
        type="button"
        className="icon-button app-dialog-close"
        aria-label={closeLabel}
        aria-disabled={closeDisabled || undefined}
        disabled={closeDisabled}
        onClick={onClose}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  )
}

export type DialogFooterAlign = 'end' | 'between'

type DialogFooterProps = {
  /** Action buttons (order: secondary, primary, danger — right-aligned by default). */
  children: ReactNode
  /** `end` (default) right-aligns actions; `between` splits them across the row. */
  align?: DialogFooterAlign
  className?: string
}

/** Standard dialog footer housing the action row. */
export function DialogFooter({ children, align = 'end', className }: DialogFooterProps) {
  return (
    <footer className={cx('app-dialog-footer', className)} data-align={align}>
      {children}
    </footer>
  )
}

type DialogBodyProps = {
  children: ReactNode
  className?: string
}

/** Scrollable content region of a dialog. */
export function DialogBody({ children, className }: DialogBodyProps) {
  return <div className={cx('app-dialog-body', className)}>{children}</div>
}

export type DialogActionTone = 'default' | 'primary' | 'danger' | 'warning'

type DialogActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: DialogActionTone
}

/** Convenience action button with tone-aware styling built on `control-button`. */
export function DialogAction({
  children,
  tone = 'default',
  type = 'button',
  disabled,
  onClick,
  className,
  form,
  ...rest
}: DialogActionProps) {
  return (
    <button
      type={type}
      form={form}
      className={cx(
        'control-button',
        tone === 'primary' && 'control-button-primary',
        tone === 'danger' && 'app-dialog-action-danger',
        tone === 'warning' && 'app-dialog-action-warning',
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  )
}
