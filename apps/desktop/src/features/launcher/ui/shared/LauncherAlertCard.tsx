import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from 'lucide-react'
import { cx } from '@shared/lib/cx'

export type LauncherAlertTone = 'info' | 'warning' | 'success' | 'error'

export type LauncherAlertChip = {
  label: string
  tone?: LauncherAlertTone
}

type LauncherAlertCardProps = {
  title: string
  detail: string
  tone?: LauncherAlertTone
  eyebrow?: string
  subtitle?: string
  note?: ReactNode
  action?: ReactNode
  chips?: LauncherAlertChip[]
  className?: string
}

function getAlertIcon(tone: LauncherAlertTone) {
  if (tone === 'warning') {
    return <AlertTriangle className="h-4 w-4" />
  }

  if (tone === 'success') {
    return <CheckCircle2 className="h-4 w-4" />
  }

  if (tone === 'error') {
    return <OctagonAlert className="h-4 w-4" />
  }

  return <Info className="h-4 w-4" />
}

export function LauncherAlertCard({
  title,
  detail,
  tone = 'info',
  eyebrow,
  subtitle,
  note,
  action,
  chips = [],
  className,
}: LauncherAlertCardProps) {
  return (
    <section className={cx('launcher-alert-card', `launcher-alert-card-${tone}`, className)}>
      <div className="launcher-alert-card-head">
        <div className="launcher-alert-card-title-row">
          <span className="launcher-alert-card-icon" aria-hidden="true">
            {getAlertIcon(tone)}
          </span>
          <div className="launcher-alert-card-copy">
            {eyebrow ? <p className="launcher-alert-card-eyebrow">{eyebrow}</p> : null}
            <h2 className="launcher-alert-card-title">{title}</h2>
            {subtitle ? <p className="launcher-alert-card-subtitle">{subtitle}</p> : null}
          </div>
        </div>
      </div>

      <div className="launcher-alert-card-body">
        <p className="launcher-alert-card-detail">{detail}</p>

        {chips.length ? (
          <div className="launcher-alert-card-chip-row">
            {chips.map((chip) => (
              <span
                key={`${chip.label}:${chip.tone ?? 'info'}`}
                className={cx(
                  'launcher-alert-card-chip',
                  `launcher-alert-card-chip-${chip.tone ?? 'info'}`,
                )}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        {note ? <div className="launcher-alert-card-note">{note}</div> : null}
        {action ? <div className="launcher-alert-card-actions">{action}</div> : null}
      </div>
    </section>
  )
}
