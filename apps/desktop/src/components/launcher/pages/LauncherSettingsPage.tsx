import { Bug, MessageSquare, ScrollText } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { reportAppEvent, type AppEventLevel } from '../../../lib/app/observability'
import { LauncherControlBar } from '../shared/LauncherControlBar'
import { LauncherPageScaffold } from '../shared/LauncherPageScaffold'

type DebugButtonGroup = Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
type DebugLogButtonGroup = Record<'debug' | 'info' | 'warning' | 'error', string>

function NotificationTestButtons({ labels }: { labels: DebugButtonGroup }) {
  const notify = (level: AppEventLevel, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug notification test: ${level}`,
      keyValues: {
        source: 'launcher-debug-page',
        kind: 'notification-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button type="button" className="control-button" onClick={() => notify('debug', labels.debug)}>
        {labels.debug}
      </button>
      <button type="button" className="control-button" onClick={() => notify('info', labels.info)}>
        {labels.info}
      </button>
      <button type="button" className="control-button" onClick={() => notify('success', labels.success)}>
        {labels.success}
      </button>
      <button type="button" className="control-button" onClick={() => notify('warning', labels.warning)}>
        {labels.warning}
      </button>
      <button type="button" className="control-button control-button-primary" onClick={() => notify('error', labels.error)}>
        {labels.error}
      </button>
    </div>
  )
}

function LogTestButtons({ labels }: { labels: DebugLogButtonGroup }) {
  const logOnly = (level: Extract<AppEventLevel, 'debug' | 'info' | 'warning' | 'error'>, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug log test: ${level}`,
      notify: false,
      keyValues: {
        source: 'launcher-debug-page',
        kind: 'log-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button type="button" className="control-button" onClick={() => logOnly('debug', labels.debug)}>
        {labels.debug}
      </button>
      <button type="button" className="control-button" onClick={() => logOnly('info', labels.info)}>
        {labels.info}
      </button>
      <button type="button" className="control-button" onClick={() => logOnly('warning', labels.warning)}>
        {labels.warning}
      </button>
      <button type="button" className="control-button control-button-primary" onClick={() => logOnly('error', labels.error)}>
        {labels.error}
      </button>
    </div>
  )
}

export function LauncherSettingsPage() {
  const copy = useEditorCopy().launcher

  return (
    <LauncherPageScaffold
      eyebrow={copy.pages.settings}
      title={copy.debug.title}
      subtitle={copy.debug.subtitle}
      stats={
        <div className="launcher-page-stats-grid">
          <div className="metric-card">
            <span className="metric-label">{copy.debug.notificationsTitle}</span>
            <strong className="metric-value">5</strong>
          </div>
          <div className="metric-card">
            <span className="metric-label">{copy.debug.logsTitle}</span>
            <strong className="metric-value">4</strong>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <LauncherControlBar title={copy.debug.title} subtitle={copy.debug.subtitle}>
          <div className="settings-window-control-card">
            <div className="settings-window-control-meta">
              <span className="settings-window-control-icon" aria-hidden="true">
                <Bug className="h-4 w-4" />
              </span>
              <div>
                <p className="settings-window-section-title">{copy.debug.debugOnlyTitle}</p>
                <p className="settings-window-section-copy mt-2">{copy.debug.debugOnlyDescription}</p>
              </div>
            </div>
          </div>
        </LauncherControlBar>

        <LauncherControlBar
          title={copy.debug.notificationsTitle}
          subtitle={copy.debug.notificationsSubtitle}
          action={<MessageSquare className="h-4 w-4 text-[var(--accent)]" />}
        >
          <NotificationTestButtons labels={copy.debug.notificationButtons} />
        </LauncherControlBar>

        <LauncherControlBar
          title={copy.debug.logsTitle}
          subtitle={copy.debug.logsSubtitle}
          action={<ScrollText className="h-4 w-4 text-[var(--accent)]" />}
        >
          <LogTestButtons labels={copy.debug.logButtons} />
        </LauncherControlBar>
      </div>
    </LauncherPageScaffold>
  )
}
