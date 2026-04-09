import type { ReactNode } from 'react'

type LauncherSectionHeaderProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}

export function LauncherSectionHeader({ eyebrow, title, subtitle, action }: LauncherSectionHeaderProps) {
  return (
    <div className="launcher-section-header">
      <div className="min-w-0">
        {eyebrow ? <p className="launcher-section-eyebrow">{eyebrow}</p> : null}
        <h2 className="launcher-section-title">{title}</h2>
        {subtitle ? <p className="launcher-section-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
