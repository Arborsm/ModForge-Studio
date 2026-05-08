import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react'
import { cx } from '@shared/lib/cx'

type LauncherStateBlockProps = {
  title: string
  detail?: string
  action?: ReactNode
  tone?: 'info' | 'warning' | 'success'
  compact?: boolean
}

function getToneIcon(tone: NonNullable<LauncherStateBlockProps['tone']>) {
  if (tone === 'warning') {
    return <AlertTriangle className="h-4 w-4" />
  }

  if (tone === 'success') {
    return <CheckCircle2 className="h-4 w-4" />
  }

  return <Info className="h-4 w-4" />
}

export function LauncherStateBlock({
  title,
  detail,
  action,
  tone = 'info',
  compact = false,
}: LauncherStateBlockProps) {
  return (
    <section
      className={cx(
        'launcher-state-block',
        `launcher-state-block-${tone}`,
        compact && 'launcher-state-block-compact',
      )}
    >
      <div className="launcher-state-block-icon">{tone === 'info' ? <Sparkles className="h-4 w-4" /> : getToneIcon(tone)}</div>
      <div className="launcher-state-block-copy">
        <p className="launcher-state-block-title">{title}</p>
        {detail ? <p className="launcher-state-block-detail">{detail}</p> : null}
      </div>
      {action ? <div className="launcher-state-block-action">{action}</div> : null}
    </section>
  )
}
