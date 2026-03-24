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

  return (
    <section className="border-b border-[var(--border-color)] last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 bg-[var(--bg-panel-muted)] px-3 py-2 text-left transition-colors hover:bg-[var(--bg-active)]"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2 text-[var(--text-secondary)]">
          {action}
          <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </span>
      </button>
      {open ? <div className="bg-[var(--bg-panel)]">{children}</div> : null}
    </section>
  )
}
