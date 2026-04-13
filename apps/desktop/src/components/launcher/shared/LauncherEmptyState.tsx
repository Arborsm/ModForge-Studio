import type { ReactNode } from 'react'

type LauncherEmptyStateProps = {
  title: string
  detail?: string
  action?: ReactNode
}

export function LauncherEmptyState({ title, detail, action }: LauncherEmptyStateProps) {
  return (
    <div className="panel-empty-state launcher-empty-state">
      <p className="launcher-empty-state-title">{title}</p>
      {detail ? <p className="launcher-empty-state-detail">{detail}</p> : null}
      {action ? <div className="launcher-empty-state-action">{action}</div> : null}
    </div>
  )
}
