import { AlertTriangle, LoaderCircle, PackageSearch } from 'lucide-react'
import { cx } from '@shared/lib/helper'

type LauncherInstallStateViewTone = 'loading' | 'error' | 'empty'

type LauncherInstallStateViewProps = {
  /** Visual tone: spinner for loading, warning glyph for error, box glyph for empty. */
  tone: LauncherInstallStateViewTone
  title: string
  /** Optional secondary line (e.g. the backend error message). */
  detail?: string | null
}

const TONE_ICON = {
  loading: LoaderCircle,
  error: AlertTriangle,
  empty: PackageSearch,
} as const

/** Centered status block shared by the install-flow dialogs (loading / error / empty states). Purely presentational. */
export function LauncherInstallStateView({ tone, title, detail }: LauncherInstallStateViewProps) {
  const Icon = TONE_ICON[tone]
  return (
    <div className="launcher-install-state" data-tone={tone}>
      <span className="launcher-install-state-icon" aria-hidden="true">
        <Icon className={cx('h-5 w-5', tone === 'loading' && 'animate-spin')} />
      </span>
      <p className="launcher-install-state-title">{title}</p>
      {detail ? <p className="launcher-install-state-detail">{detail}</p> : null}
    </div>
  )
}
