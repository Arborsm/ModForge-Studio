import { Bug } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { appEvent, type AppEventLevel } from '@platform/observability'
import { cx } from '@shared/lib/helper'
import { publishNotification } from '@shared/ui/notifications'

export type DebugButtonGroup = Record<'debug' | 'info' | 'success' | 'warning' | 'error', string> & {
  fullAttributes: string
}
export type DebugLogButtonGroup = Record<'debug' | 'info' | 'warning' | 'error', string>

export function NotificationTestButtons({ labels, debugEnabled }: { labels: DebugButtonGroup; debugEnabled: boolean }) {
  const notify = (level: AppEventLevel, title: string) => {
    appEvent(level, title)
      .description(`Launcher debug notification test: ${level}`)
      .debugDiagnostics(debugEnabled)
      .context({ source: 'launcher-configuration-page', kind: 'notification-test', level })
      .emit()
  }

  return (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-debug"
        onClick={() => notify('debug', labels.debug)}
      >
        {labels.debug}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-info"
        onClick={() => notify('info', labels.info)}
      >
        {labels.info}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-success"
        onClick={() => notify('success', labels.success)}
      >
        {labels.success}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-warning"
        onClick={() => notify('warning', labels.warning)}
      >
        {labels.warning}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-error"
        onClick={() => notify('error', labels.error)}
      >
        {labels.error}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button"
        onClick={() =>
          publishNotification({
            id: 'launcher-debug-full-attributes',
            level: 'warning',
            variant: 'diagnostic',
            eyebrow: 'Diagnostic',
            title: 'Full Attributes Card',
            subtitle: 'Subtitle line for layout verification',
            summary: 'Summary block with accent tinted background',
            description: 'Description text with pre-line whitespace\nand a second line for wrapping checks.',
            note: 'Footnote / hint line at the bottom',
            chips: [{ label: 'info chip', tone: 'info' }, { label: 'warning chip', tone: 'warning' }, { label: 'neutral chip' }],
            action: { label: 'Primary Action', callback: () => {}, tone: 'primary' },
            secondaryAction: { label: 'Secondary', callback: () => {}, tone: 'default' },
            autoDismissMs: null,
          })
        }
      >
        {labels.fullAttributes}
      </button>
    </div>
  )
}

export function LogTestButtons({ labels, debugEnabled }: { labels: DebugLogButtonGroup; debugEnabled: boolean }) {
  const logOnly = (level: Extract<AppEventLevel, 'debug' | 'info' | 'warning' | 'error'>, title: string) => {
    appEvent(level, title)
      .description(`Launcher debug log test: ${level}`)
      .debugDiagnostics(debugEnabled)
      .context({ source: 'launcher-configuration-page', kind: 'log-test', level })
      .emit({ notify: false })
  }

  return (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-debug"
        onClick={() => logOnly('debug', labels.debug)}
      >
        {labels.debug}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-info"
        onClick={() => logOnly('info', labels.info)}
      >
        {labels.info}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-warning"
        onClick={() => logOnly('warning', labels.warning)}
      >
        {labels.warning}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-error"
        onClick={() => logOnly('error', labels.error)}
      >
        {labels.error}
      </button>
    </div>
  )
}

export function DebugModeSwitch({
  checked,
  title,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  checked: boolean
  title: string
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()

  return (
    <section className="launcher-debug-tool-card">
      <div className="launcher-debug-tool-header launcher-debug-tool-header-center">
        <div className="launcher-debug-setting">
          <span className="launcher-debug-setting-icon launcher-debug-icon-debug-mode" aria-hidden="true">
            <Bug className="h-4 w-4" />
          </span>
          <div className="launcher-debug-setting-copy">
            <h2 id={titleId} className="launcher-debug-tool-title">
              {title}
            </h2>
          </div>
        </div>

        <button
          type="button"
          className={cx('settings-switch', checked && 'settings-switch-active')}
          role="switch"
          aria-checked={checked}
          aria-labelledby={titleId}
          title={checked ? disabledLabel : enabledLabel}
          onClick={onToggle}
        >
          <span className="settings-switch-copy">{checked ? disabledLabel : enabledLabel}</span>
          <span className="settings-switch-track" aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </button>
      </div>
    </section>
  )
}

export function DebugToolCard({
  title,
  subtitle,
  icon,
  iconClassName,
  headerActions,
  children,
  tone,
}: {
  title: string
  subtitle?: string
  icon: ReactNode
  iconClassName?: string
  headerActions?: ReactNode
  children?: ReactNode
  tone?: 'danger' | 'warning'
}) {
  return (
    <section className={cx('launcher-debug-tool-card', (tone === 'danger' || tone === 'warning') && 'launcher-debug-tool-card-danger')}>
      <div className="launcher-debug-tool-header">
        <div className="launcher-debug-tool-copy">
          {icon ? (
            <span className={cx('launcher-debug-tool-badge', iconClassName)} aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="launcher-debug-tool-text">
            <h2 className="launcher-debug-tool-title">{title}</h2>
            {subtitle ? <p className="launcher-debug-tool-subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <div className="launcher-debug-tool-header-side">
          {headerActions ? <div className="launcher-debug-tool-header-actions">{headerActions}</div> : null}
        </div>
      </div>
      {children != null ? <div className="launcher-debug-tool-tray">{children}</div> : null}
    </section>
  )
}

export function DebugSectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="launcher-debug-section-title">{children}</h3>
}
