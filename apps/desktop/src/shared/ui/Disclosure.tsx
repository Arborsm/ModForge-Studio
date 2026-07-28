import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cx } from '@shared/lib/helper'

type DisclosureProps = {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}

/**
 * Collapsible section for progressive disclosure: advanced options stay one
 * click away without crowding the default form. Local open state only; the
 * parent owns the form values inside.
 */
export function Disclosure({ title, subtitle, defaultOpen = false, className, bodyClassName, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <div className={cx('rounded-md border border-(--border-color)', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-hover)"
      >
        <ChevronRight size={14} className={cx('shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="font-medium">{title}</span>
        {subtitle ? <span className="truncate text-xs text-(--text-secondary)">{subtitle}</span> : null}
      </button>
      {open ? (
        <div id={bodyId} className={cx('border-t border-(--border-color) px-3 py-3', bodyClassName)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
