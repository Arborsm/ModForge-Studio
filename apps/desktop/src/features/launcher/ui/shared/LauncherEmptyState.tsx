import { type ReactNode } from 'react'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'

type LauncherEmptyStateProps = {
  eyebrow: string
  title: string
  detail: string
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  illustrationAccent?: ReactNode
  className?: string
}

/** Launcher-facing empty-results card that keeps the legacy launcher class namespace while using the shared card. */
export function LauncherEmptyState({
  eyebrow,
  title,
  detail,
  primaryAction,
  secondaryAction,
  illustrationAccent,
  className,
}: LauncherEmptyStateProps) {
  return (
    <EmptyStateCard
      eyebrow={eyebrow}
      title={title}
      detail={detail}
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
      illustrationAccent={illustrationAccent}
      legacyClassName="launcher-empty-card"
      className={className}
    />
  )
}
