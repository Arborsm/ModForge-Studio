import { ChevronDown, Code2, Crown, Download, MessageSquare, Network, ScrollText } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import { canUseDesktopHost } from '@shared/lib/desktop'
import { LoadingMotionReveal } from '@shared/ui/loading-motion'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'
import {
  DebugModeSwitch,
  DebugSectionTitle,
  DebugToolCard,
  LogTestButtons,
  NotificationTestButtons,
} from './LauncherConfigurationDebugTools'
import { nexusModsBbcodeSample } from './launcherConfigurationBbcodeSample'

type LauncherConfigurationMoreToolsProps = {
  debugEnabled: boolean
  debugToolsExpanded: boolean
  forceNonPremium: boolean
  forceNonPremiumBusy: boolean
  forceOffline: boolean
  forceOfflineBusy: boolean
  bbcodePreviewExpanded: boolean
  debugSimulationActive: boolean
  onToggleDebugMode: () => void
  onToggleForceNonPremium: () => void
  onToggleForceOffline: () => void
  onClearLauncherImageCache: () => void
  onStartDebugSimulation: (title: string) => void
  setDebugToolsExpanded: Dispatch<SetStateAction<boolean>>
  setBbcodePreviewExpanded: Dispatch<SetStateAction<boolean>>
}

/** Renders the launcher configuration page's debug-only utilities and diagnostics affordances. */
export function LauncherConfigurationMoreTools({
  debugEnabled,
  debugToolsExpanded,
  forceNonPremium,
  forceNonPremiumBusy,
  forceOffline,
  forceOfflineBusy,
  bbcodePreviewExpanded,
  debugSimulationActive,
  onToggleDebugMode,
  onToggleForceNonPremium,
  onToggleForceOffline,
  onClearLauncherImageCache,
  onStartDebugSimulation,
  setDebugToolsExpanded,
  setBbcodePreviewExpanded,
}: LauncherConfigurationMoreToolsProps) {
  const copy = useEditorCopy().launcher
  const settingsCopy = useSettingsMenuCopy()
  return (
    <section className="launcher-config-tools" aria-label={copy.configuration.moreToolsTitle}>
      <LoadingMotionReveal itemId="launcher-debug-tools-toggle" index={3}>
        <section className="launcher-debug-more-card">
          <div className="launcher-debug-tool-copy">
            <h2 className="launcher-debug-tool-title">{copy.configuration.moreToolsTitle}</h2>
          </div>
          <button
            type="button"
            className="control-button launcher-debug-more-button"
            aria-expanded={debugToolsExpanded}
            onClick={() => setDebugToolsExpanded((value) => !value)}
          >
            <span>{debugToolsExpanded ? copy.configuration.lessToolsAction : copy.configuration.moreToolsAction}</span>
            <ChevronDown className={cx('h-4 w-4', debugToolsExpanded && 'rotate-180')} aria-hidden="true" />
          </button>
        </section>
      </LoadingMotionReveal>

      {debugToolsExpanded ? (
        <div className="launcher-debug-tools-stack">
          <LoadingMotionReveal itemId="launcher-debug-overview" index={4}>
            <section className="launcher-debug-overview-card" aria-label={copy.configuration.moreToolsTitle}>
              <div className="launcher-debug-stat-card launcher-debug-stat-card-primary">
                <strong className="launcher-debug-overview-value">5</strong>
                <span className="launcher-debug-overview-label">{copy.configuration.notificationsOverviewTitle}</span>
              </div>
              <div className="launcher-debug-stat-card launcher-debug-stat-card-neutral">
                <strong className="launcher-debug-overview-value">4</strong>
                <span className="launcher-debug-overview-label">{copy.configuration.logsOverviewTitle}</span>
              </div>
            </section>
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-state-group" index={5}>
            <DebugSectionTitle>{copy.configuration.debugToolsStateGroupTitle}</DebugSectionTitle>
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-mode" index={5}>
            <DebugModeSwitch
              checked={debugEnabled}
              title={copy.configuration.debugOnlyTitle}
              enabledLabel={settingsCopy.enableDebugModeLabel}
              disabledLabel={settingsCopy.disableDebugModeLabel}
              onToggle={onToggleDebugMode}
            />
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-force-non-premium" index={6}>
            <DebugToolCard
              title={copy.configuration.forceNonPremiumEnableButton}
              icon={<Crown className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-account"
              headerActions={
                <button
                  type="button"
                  className={cx('settings-switch', forceNonPremium && 'settings-switch-active')}
                  role="switch"
                  aria-checked={forceNonPremium}
                  aria-label={copy.configuration.forceNonPremiumEnableButton}
                  title={forceNonPremium ? copy.configuration.forceNonPremiumDisableButton : copy.configuration.forceNonPremiumEnableButton}
                  disabled={!canUseDesktopHost() || forceNonPremiumBusy}
                  onClick={onToggleForceNonPremium}
                >
                  <span className="settings-switch-copy">
                    {forceNonPremium ? copy.configuration.forceNonPremiumEnabledLabel : copy.configuration.forceNonPremiumDisabledLabel}
                  </span>
                  <span className="settings-switch-track" aria-hidden="true">
                    <span className="settings-switch-thumb" />
                  </span>
                </button>
              }
            />
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-force-offline" index={7}>
            <DebugToolCard
              title={copy.configuration.forceOfflineEnableButton}
              icon={<Network className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-offline"
              tone="danger"
              headerActions={
                <button
                  type="button"
                  className={cx('control-button launcher-config-danger-button', forceOffline && 'launcher-config-danger-button-active')}
                  disabled={!canUseDesktopHost() || forceOfflineBusy}
                  onClick={onToggleForceOffline}
                >
                  {forceOffline ? copy.configuration.forceOfflineDisableButton : copy.configuration.forceOfflineEnableButton}
                </button>
              }
            />
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-feedback-group" index={8}>
            <DebugSectionTitle>{copy.configuration.debugToolsFeedbackGroupTitle}</DebugSectionTitle>
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-notifications" index={9}>
            <DebugToolCard
              title={copy.configuration.notificationsTitle}
              icon={<MessageSquare className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-notifications"
              headerActions={<NotificationTestButtons labels={copy.configuration.notificationButtons} debugEnabled={debugEnabled} />}
            />
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-logs" index={10}>
            <DebugToolCard
              title={copy.configuration.logsTitle}
              icon={<ScrollText className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-logs"
              headerActions={<LogTestButtons labels={copy.configuration.logButtons} debugEnabled={debugEnabled} />}
            />
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-modules-group" index={11}>
            <DebugSectionTitle>{copy.configuration.debugToolsModulesGroupTitle}</DebugSectionTitle>
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-image-cache" index={12}>
            <DebugToolCard
              title={copy.configuration.clearImageCacheTitle}
              icon={<ScrollText className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-cache"
              headerActions={
                <button type="button" className="control-button" onClick={onClearLauncherImageCache}>
                  {copy.configuration.clearImageCacheButton}
                </button>
              }
            />
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-bbcode-preview" index={13}>
            <DebugToolCard
              title={copy.configuration.bbcodePreviewTitle}
              icon={<Code2 className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-code"
              headerActions={
                <button
                  type="button"
                  className="control-button"
                  aria-expanded={bbcodePreviewExpanded}
                  onClick={() => setBbcodePreviewExpanded((value) => !value)}
                >
                  {bbcodePreviewExpanded ? copy.configuration.bbcodePreviewCollapseAction : copy.configuration.bbcodePreviewExpandAction}
                </button>
              }
            >
              {bbcodePreviewExpanded ? (
                <div className="launcher-debug-bbcode-preview" data-testid="launcher-debug-bbcode-preview">
                  <NexusModsBbcode source={nexusModsBbcodeSample} />
                </div>
              ) : null}
            </DebugToolCard>
          </LoadingMotionReveal>

          <LoadingMotionReveal itemId="launcher-debug-simulation" index={14}>
            <DebugToolCard
              title={copy.configuration.simulationTitle}
              subtitle={copy.configuration.simulationParametersLabel}
              icon={<Download className="h-4 w-4" />}
              iconClassName="launcher-debug-icon-download"
              headerActions={
                <button
                  type="button"
                  className="control-button control-button-primary"
                  onClick={() => onStartDebugSimulation(copy.configuration.simulationTitle)}
                  disabled={debugSimulationActive}
                >
                  {debugSimulationActive ? copy.configuration.simulationButtonRunning : copy.configuration.simulationButtonIdle}
                </button>
              }
            />
          </LoadingMotionReveal>
        </div>
      ) : null}
    </section>
  )
}
