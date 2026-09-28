import { Server } from 'lucide-react'
import { useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { DebugToolCard } from './LauncherConfigurationDebugTools'

/**
 * Default dev-server target: `10.0.2.2` is the emulator's alias for the host
 * loopback, where `vp run web:dev` serves the front-end.
 */
const DEFAULT_DEV_SERVER_URL = 'http://10.0.2.2:5175'

function isValidDevServerUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

type LauncherDevServerToolsProps = {
  /** Dev-server URL currently persisted on the Android host; null serves the bundled assets. */
  devServerUrl: string | null
  busy: boolean
  /** Persists the override (null clears it); the host recreates the activity on success. */
  onSetDevServerUrl: (url: string | null) => void
}

/**
 * Android-only debug card that points the launcher WebView at a local Vite dev
 * server for front-end HMR. It replaces the desktop debug-tools stack, whose
 * cards are all desktop-host concerns.
 */
export function LauncherDevServerTools({ devServerUrl, busy, onSetDevServerUrl }: LauncherDevServerToolsProps) {
  const copy = useEditorCopy().launcher.configuration
  const [draftUrl, setDraftUrl] = useState(devServerUrl ?? DEFAULT_DEV_SERVER_URL)
  const draftValid = isValidDevServerUrl(draftUrl.trim())

  return (
    <DebugToolCard
      title={copy.devServerTitle}
      subtitle={copy.devServerSubtitle}
      icon={<Server className="h-4 w-4" />}
      iconClassName="launcher-debug-icon-dev-server"
      headerActions={
        devServerUrl ? (
          <button
            type="button"
            className="control-button launcher-config-danger-button launcher-config-danger-button-active"
            disabled={busy}
            onClick={() => onSetDevServerUrl(null)}
          >
            {copy.devServerDisableButton}
          </button>
        ) : (
          <button
            type="button"
            className="control-button control-button-primary"
            disabled={busy || !draftValid}
            onClick={() => onSetDevServerUrl(draftUrl.trim())}
          >
            {copy.devServerEnableButton}
          </button>
        )
      }
    >
      <div className="launcher-debug-dev-server-tray">
        <input
          type="text"
          className="control-input launcher-debug-dev-server-input"
          value={draftUrl}
          placeholder={copy.devServerPlaceholder}
          aria-label={copy.devServerTitle}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          disabled={busy}
          onChange={(event) => setDraftUrl(event.target.value)}
        />
        <p className={cx('launcher-debug-dev-server-note', !draftValid && 'launcher-debug-dev-server-note-danger')}>
          {!draftValid ? copy.devServerInvalidUrl : copy.devServerNote}
        </p>
      </div>
    </DebugToolCard>
  )
}
