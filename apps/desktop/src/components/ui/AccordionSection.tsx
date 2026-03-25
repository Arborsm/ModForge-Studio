import { ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'

type AccordionSectionProps = {
  title: string
  icon: ReactNode
  defaultOpen?: boolean
  action?: ReactNode
  children: ReactNode
}

export function AccordionSection({
  title,
  icon,
  defaultOpen = true,
  action,
  children,
}: AccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const toggleOpen = () => setOpen((current) => !current)

  return (
    <section className="border-b border-[var(--border-color)] last:border-b-0">
      <div className="flex items-center gap-3 bg-[var(--bg-panel-muted)] px-3 py-2 transition-colors hover:bg-[var(--bg-active)]">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
          onClick={toggleOpen}
        >
          <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
            {icon}
            <span className="truncate">{title}</span>
          </span>
          <ChevronDown className={cx('h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform', open && 'rotate-180')} />
        </button>
        <span
          className="flex shrink-0 items-center gap-2 text-[var(--text-secondary)]"
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {action}
        </span>
      </div>
      {open ? <div className="bg-[var(--bg-panel)]">{children}</div> : null}
    </section>
  )
}
