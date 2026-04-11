import { Bug, Download, MessageSquare, ScrollText } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { useEditorCopy, useSettingsMenuCopy } from '../../../lib/app/localeContext'
import { reportAppEvent, type AppEventLevel } from '../../../lib/app/observability'
import { clearLauncherImageCache } from '../../../lib/desktop'
import { useLauncherDownloads } from '../../../lib/launcher/useLauncherDownloads'

type DebugButtonGroup = Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
type DebugLogButtonGroup = Record<'debug' | 'info' | 'warning' | 'error', string>

function NotificationTestButtons({ labels, debugEnabled }: { labels: DebugButtonGroup; debugEnabled: boolean }) {
  const notify = (level: AppEventLevel, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug notification test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
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

function LogTestButtons({ labels, debugEnabled }: { labels: DebugLogButtonGroup; debugEnabled: boolean }) {
  const logOnly = (level: Extract<AppEventLevel, 'debug' | 'info' | 'warning' | 'error'>, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug log test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
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

type LauncherDebugPageProps = {
  debugEnabled: boolean
  onToggleDebugMode: () => void
  downloads: ReturnType<typeof useLauncherDownloads>
}

function DebugModeSwitch({
  checked,
  title,
  description,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  checked: boolean
  title: string
  description: string
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <section className="launcher-debug-card">
      <div className="launcher-debug-card-header launcher-debug-card-header-center">
        <div className="launcher-debug-setting">
          <span className="launcher-debug-setting-icon" aria-hidden="true">
            <Bug className="h-4 w-4" />
          </span>
          <div className="launcher-debug-setting-copy">
            <h2 id={titleId} className="launcher-debug-card-title">
              {title}
            </h2>
            <p id={descriptionId} className="launcher-debug-card-description">
              {description}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={cx('settings-switch', checked && 'settings-switch-active')}
          role="switch"
          aria-checked={checked}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
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

function DebugActionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string
  description: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section className="launcher-debug-card">
      <div className="launcher-debug-card-header">
        <div className="launcher-debug-card-copy">
          <h2 className="launcher-debug-card-title">{title}</h2>
          <p className="launcher-debug-card-description">{description}</p>
        </div>
        <span className="launcher-debug-card-badge" aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="launcher-debug-card-tray">{children}</div>
    </section>
  )
}

export function LauncherDebugPage({ debugEnabled, onToggleDebugMode, downloads }: LauncherDebugPageProps) {
  const copy = useEditorCopy().launcher
  const settingsCopy = useSettingsMenuCopy()
  const debugSimulationActive = downloads.activeItems.some((item) => item.source === 'debug' && item.status === 'downloading')
  const handleClearLauncherImageCache = () => {
    void clearLauncherImageCache().catch(() => {
      // Debug-only affordance: ignore desktop bridge failures here.
    })
  }

  return (
    <section className="launcher-debug-page">
      <div className="launcher-debug-canvas">
        <header className="launcher-debug-page-header">
          <h1 className="launcher-debug-page-title">{copy.debug.title}</h1>
          <p className="launcher-debug-page-subtitle">{copy.debug.subtitle}</p>
        </header>

        <section className="launcher-debug-overview-card" aria-label={copy.debug.title}>
          <div className="launcher-debug-overview-cell">
            <span className="launcher-debug-overview-label">{copy.debug.notificationsOverviewTitle}</span>
            <strong className="launcher-debug-overview-value">5</strong>
          </div>
          <div className="launcher-debug-overview-divider" aria-hidden="true" />
          <div className="launcher-debug-overview-cell">
            <span className="launcher-debug-overview-label">{copy.debug.logsOverviewTitle}</span>
            <strong className="launcher-debug-overview-value">4</strong>
          </div>
        </section>

        <div className="launcher-debug-stack">
          <DebugModeSwitch
            checked={debugEnabled}
            title={copy.debug.debugOnlyTitle}
            description={copy.debug.debugOnlyDescription}
            enabledLabel={settingsCopy.enableDebugModeLabel}
            disabledLabel={settingsCopy.disableDebugModeLabel}
            onToggle={onToggleDebugMode}
          />

          <DebugActionCard
            title={copy.debug.notificationsTitle}
            description={copy.debug.notificationsSubtitle}
            icon={<MessageSquare className="h-4 w-4" />}
          >
            <NotificationTestButtons labels={copy.debug.notificationButtons} debugEnabled={debugEnabled} />
          </DebugActionCard>

          <DebugActionCard
            title={copy.debug.logsTitle}
            description={copy.debug.logsSubtitle}
            icon={<ScrollText className="h-4 w-4" />}
          >
            <LogTestButtons labels={copy.debug.logButtons} debugEnabled={debugEnabled} />
          </DebugActionCard>

          <DebugActionCard
            title={copy.debug.clearImageCacheTitle}
            description={copy.debug.clearImageCacheSubtitle}
            icon={<ScrollText className="h-4 w-4" />}
          >
            <div className="launcher-toolbar">
              <button type="button" className="control-button" onClick={handleClearLauncherImageCache}>
                {copy.debug.clearImageCacheButton}
              </button>
            </div>
          </DebugActionCard>

          <DebugActionCard
            title={copy.debug.simulationTitle}
            description={copy.debug.simulationSubtitle}
            icon={<Download className="h-4 w-4" />}
          >
            <div className="launcher-toolbar">
              <button
                type="button"
                className="control-button control-button-primary"
                onClick={() => downloads.startDebugSimulation(copy.debug.simulationTitle)}
                disabled={debugSimulationActive}
              >
                {debugSimulationActive ? copy.debug.simulationButtonRunning : copy.debug.simulationButtonIdle}
              </button>
              <span className="dock-chip">2 MB/s · 10s · 20 MB</span>
            </div>
          </DebugActionCard>
        </div>
      </div>
    </section>
  )
}
