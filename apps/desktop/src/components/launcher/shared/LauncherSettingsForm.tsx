import { FolderOpen, KeyRound, Save } from 'lucide-react'
import { useEditorCopy } from '../../../lib/app/localeContext'
import { openLauncherPath } from '../../../lib/desktop'
import { useLauncherSettings } from '../../../lib/launcher/useLauncherSettings'
import { LauncherControlBar } from './LauncherControlBar'
import { LauncherStateBlock } from './LauncherStateBlock'

type LauncherSettingsFormProps = {
  settingsState: ReturnType<typeof useLauncherSettings>
}

function SettingPathField({
  label,
  value,
  onChange,
  onBrowse,
  onOpen,
  openLabel,
  browseLabel,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  onBrowse: () => void
  onOpen: () => void
  openLabel: string
  browseLabel: string
}) {
  return (
    <label className="launcher-form-field">
      <span>{label}</span>
      <div className="launcher-form-input-group">
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
          <button type="button" className="control-button" onClick={onOpen}>
            <span>{openLabel}</span>
          </button>
        ) : null}
      </div>
    </label>
  )
}

export function LauncherSettingsForm({ settingsState }: LauncherSettingsFormProps) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const { settings, updateField, pickDirectory, save, error } = settingsState

  return (
    <div className="space-y-4">
      {error ? <LauncherStateBlock title={copy.settings.saveFailed} detail={error} tone="warning" /> : null}

      <LauncherControlBar
        title={copy.settings.title}
        subtitle={copy.settings.subtitle}
        action={
          <button type="button" className="control-button control-button-primary" onClick={() => void save()}>
            <Save className="h-4 w-4" />
            <span>{copy.actions.saveSettings}</span>
          </button>
        }
      >
        <div className="launcher-form-grid">
          <SettingPathField
            label={copy.fields.gamePath}
            value={settings.gamePath}
            onChange={(value) => updateField('gamePath', value)}
            onBrowse={() => void pickDirectory('gamePath', copy.fields.gamePath)}
            onOpen={() => void openLauncherPath({ path: settings.gamePath! })}
            openLabel={copy.actions.openFolder}
            browseLabel={rootCopy.controls.browse}
          />
          <SettingPathField
            label={copy.fields.modsPath}
            value={settings.modsPath}
            onChange={(value) => updateField('modsPath', value)}
            onBrowse={() => void pickDirectory('modsPath', copy.fields.modsPath)}
            onOpen={() => void openLauncherPath({ path: settings.modsPath! })}
            openLabel={copy.actions.openFolder}
            browseLabel={rootCopy.controls.browse}
          />
          <SettingPathField
            label={copy.fields.downloadPath}
            value={settings.downloadPath}
            onChange={(value) => updateField('downloadPath', value)}
            onBrowse={() => void pickDirectory('downloadPath', copy.fields.downloadPath)}
            onOpen={() => void openLauncherPath({ path: settings.downloadPath! })}
            openLabel={copy.actions.openFolder}
            browseLabel={rootCopy.controls.browse}
          />
        </div>
      </LauncherControlBar>

      <LauncherControlBar title="Nexus" subtitle={copy.discover.credentialsHint}>
        <div className="launcher-form-grid">
          <label className="launcher-form-field">
            <span>{copy.fields.nexusApiKey}</span>
            <div className="launcher-form-input-group">
              <input
                type="password"
                className="control-input"
                value={settings.nexusApiKey ?? ''}
                onChange={(event) => updateField('nexusApiKey', event.target.value || null)}
                spellCheck={false}
              />
              <span className="dock-chip">
                <KeyRound className="h-3 w-3" />
                <span>API</span>
              </span>
            </div>
          </label>

          <label className="launcher-form-field">
            <span>{copy.fields.nexusCookie}</span>
            <input
              type="password"
              className="control-input"
              value={settings.nexusCookie ?? ''}
              onChange={(event) => updateField('nexusCookie', event.target.value || null)}
              spellCheck={false}
            />
          </label>
        </div>
      </LauncherControlBar>

      <LauncherControlBar title={copy.settings.pathsHint} subtitle={copy.settings.autoInstallHint}>
        <div className="launcher-toggle-grid">
          <label className="launcher-toggle-card panel-list-card">
            <input
              type="checkbox"
              checked={settings.autoInstallDownloads}
              onChange={(event) => updateField('autoInstallDownloads', event.target.checked)}
            />
            <div>
              <p>{copy.toggles.autoInstallDownloads}</p>
              <p>{copy.settings.autoInstallHint}</p>
            </div>
          </label>

          <label className="launcher-toggle-card panel-list-card">
            <input
              type="checkbox"
              checked={settings.keepDownloadedArchives}
              onChange={(event) => updateField('keepDownloadedArchives', event.target.checked)}
            />
            <div>
              <p>{copy.toggles.keepDownloadedArchives}</p>
              <p>{copy.settings.keepArchivesHint}</p>
            </div>
          </label>
        </div>
      </LauncherControlBar>
    </div>
  )
}
