import { ArrowUpRight, FolderOpen, KeyRound } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/cx'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import { useLauncherSettings } from '../../model/useLauncherSettings'
import { LauncherStateBlock } from './LauncherStateBlock'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { LauncherNexusApiStatusCard } from './LauncherNexusApiStatusCard'

type LauncherSettingsFormProps = {
  settingsState: ReturnType<typeof useLauncherSettings>
  showDiagnostics?: boolean
  showApiStatus?: boolean
}

function SettingPathField({
  label,
  value,
  onChange,
  onBrowse,
  onOpen,
  openLabel,
  browseLabel,
  wide = false,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  onBrowse: () => void
  onOpen: () => void
  openLabel: string
  browseLabel: string
  wide?: boolean
}) {
  return (
    <label className={cx('settings-window-control-card launcher-settings-control-card', wide && 'launcher-settings-control-card-wide')}>
      <div className="launcher-settings-control-meta">
        <p className="settings-window-section-title">{label}</p>
      </div>
      <div className="launcher-form-input-group launcher-settings-inline-actions">
        <input
          className="control-input"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          spellCheck={false}
        />
        <button type="button" className="control-button" aria-label={browseLabel} title={browseLabel} onClick={onBrowse}>
          <FolderOpen className="h-4 w-4" />
        </button>
        {value ? (
          <button type="button" className="control-button" aria-label={openLabel} title={openLabel} onClick={onOpen}>
            <ArrowUpRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </label>
  )
}

function CredentialField({
  label,
  value,
  onChange,
  trailing,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  trailing?: ReactNode
}) {
  return (
    <label className="settings-window-control-card launcher-settings-control-card">
      <div className="launcher-settings-control-meta">
        <p className="settings-window-section-title">{label}</p>
      </div>
      <div className="launcher-form-input-group launcher-settings-inline-actions">
        <input
          type="password"
          className="control-input"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
          spellCheck={false}
        />
        {trailing}
      </div>
    </label>
  )
}

function LauncherSettingsSwitch({
  label,
  description,
  checked,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  label: string
  description: string
  checked: boolean
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()

  return (
    <div className="settings-window-control-card">
      <div className="launcher-settings-control-meta">
        <p id={titleId} className="settings-window-section-title">
          {label}
        </p>
        <p id={descriptionId} className="settings-window-section-copy">
          {description}
        </p>
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
  )
}

export function LauncherSettingsForm({ settingsState, showDiagnostics = true, showApiStatus = true }: LauncherSettingsFormProps) {
  const launcherPort = useLauncherPort()
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const commonCopy = rootCopy.common
  const settingsCopy = copy.settings
  const diagnosticsCopy = copy.diagnostics
  const { settings, updateField, pickDirectory, error } = settingsState

  return (
    <div className="launcher-settings-stack">
      {error ? <LauncherStateBlock title={copy.settings.saveFailed} detail={error} tone="warning" /> : null}

      <section className="launcher-settings-subsection launcher-settings-subsection-paths">
        <div>
          <p className="settings-window-section-title">{settingsCopy.pathsTitle}</p>
          <p className="settings-window-section-copy">{settingsCopy.pathsHint}</p>
        </div>
        <div className="launcher-form-grid launcher-settings-path-grid">
          <SettingPathField
            label={copy.fields.gamePath}
            value={settings.gamePath}
            onChange={(value) => updateField('gamePath', value)}
            onBrowse={() => void pickDirectory('gamePath', copy.fields.gamePath)}
            onOpen={() => void launcherPort.openPath({ path: settings.gamePath! })}
            openLabel={copy.actions.openFolder}
            browseLabel={rootCopy.controls.browse}
            wide
          />
          <SettingPathField
            label={copy.fields.modsPath}
            value={settings.modsPath}
            onChange={(value) => updateField('modsPath', value)}
            onBrowse={() => void pickDirectory('modsPath', copy.fields.modsPath)}
            onOpen={() => void launcherPort.openPath({ path: settings.modsPath! })}
            openLabel={copy.actions.openFolder}
            browseLabel={rootCopy.controls.browse}
            wide
          />
          <SettingPathField
            label={copy.fields.downloadPath}
            value={settings.downloadPath}
            onChange={(value) => updateField('downloadPath', value)}
            onBrowse={() => void pickDirectory('downloadPath', copy.fields.downloadPath)}
            onOpen={() => void launcherPort.openPath({ path: settings.downloadPath! })}
            openLabel={copy.actions.openFolder}
            browseLabel={rootCopy.controls.browse}
            wide
          />
        </div>
      </section>

      <section className="launcher-settings-subsection launcher-settings-subsection-nexus">
        <div>
          <p className="settings-window-section-title">{settingsCopy.nexusAccessTitle}</p>
          <p className="settings-window-section-copy">{copy.discover.credentialsHint}</p>
        </div>
        <div className="launcher-form-grid">
          <CredentialField
            label={copy.fields.nexusApiKey}
            value={settings.nexusApiKey}
            onChange={(value) => updateField('nexusApiKey', value)}
            trailing={
              <span className="dock-chip">
                <KeyRound className="h-3 w-3" />
                <span>{diagnosticsCopy.apiKeyBadge}</span>
              </span>
            }
          />
        </div>
        {showApiStatus ? <LauncherNexusApiStatusCard settingsState={settingsState} /> : null}
      </section>

      {showDiagnostics ? <DiagnosticsPanel launcherPort={launcherPort} /> : null}

      <section className="launcher-settings-subsection launcher-settings-subsection-downloads">
        <div>
          <p className="settings-window-section-title">{settingsCopy.downloadBehaviorTitle}</p>
          <p className="settings-window-section-copy">{settingsCopy.downloadBehaviorHint}</p>
        </div>
        <div className="launcher-settings-toggle-list">
          <LauncherSettingsSwitch
            label={copy.toggles.autoCheckModUpdates}
            description={settingsCopy.autoCheckUpdatesHint}
            checked={settings.autoCheckModUpdates}
            enabledLabel={commonCopy.yes}
            disabledLabel={commonCopy.no}
            onToggle={() => updateField('autoCheckModUpdates', !settings.autoCheckModUpdates)}
          />
          <LauncherSettingsSwitch
            label={copy.toggles.autoInstallDownloads}
            description={copy.settings.autoInstallHint}
            checked={settings.autoInstallDownloads}
            enabledLabel={commonCopy.yes}
            disabledLabel={commonCopy.no}
            onToggle={() => updateField('autoInstallDownloads', !settings.autoInstallDownloads)}
          />
          <LauncherSettingsSwitch
            label={copy.toggles.keepDownloadedArchives}
            description={copy.settings.keepArchivesHint}
            checked={settings.keepDownloadedArchives}
            enabledLabel={commonCopy.yes}
            disabledLabel={commonCopy.no}
            onToggle={() => updateField('keepDownloadedArchives', !settings.keepDownloadedArchives)}
          />
        </div>
      </section>
    </div>
  )
}
