import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useEditorCopy } from '@locales/localeContext'

type InitializationOverlayProps = {
  desktopHost: boolean
  gameDirectory: string
  detectedDirectories: string[]
  loading?: boolean
  status?: string | null
  error?: string | null
  onGameDirectoryChange: (value: string) => void
  onSelectDirectory: (value: string) => void
  onChooseDirectory: () => void
  onScanAndOpenTown: () => void
  onRetry?: () => void
  onChooseDirectoryAction?: () => void
  onClose?: () => void
}

export default function InitializationOverlay({
  desktopHost,
  gameDirectory,
  detectedDirectories,
  loading = false,
  status,
  error,
  onGameDirectoryChange,
  onSelectDirectory,
  onChooseDirectory,
  onScanAndOpenTown,
  onRetry,
  onChooseDirectoryAction,
  onClose,
}: InitializationOverlayProps) {
  const copy = useEditorCopy()

  useEffect(() => {
    if (!onClose) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="initialization-overlay-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div className="initialization-overlay-panel">
        {onClose ? (
          <button type="button" className="initialization-overlay-close" onClick={onClose} aria-label="Close project overlay" title="Close">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <div className="initialization-overlay-header">
          <p className="initialization-overlay-eyebrow">{copy.leftDock.project}</p>
          <h2 className="initialization-overlay-title">{copy.leftDock.gameDirectory}</h2>
          <p className="initialization-overlay-subtitle">{copy.leftDock.projectSubtitle}</p>
        </div>

        <div className="initialization-overlay-directory-field">
          <label className="initialization-overlay-directory-label">{copy.leftDock.gameDirectory}</label>
          <input
            className="control-input h-11"
            value={gameDirectory}
            onChange={(event) => onGameDirectoryChange(event.target.value)}
            placeholder={copy.leftDock.directoryPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="initialization-overlay-actions">
          <button type="button" className="control-button h-10" onClick={onChooseDirectory} disabled={loading}>
            {copy.controls.browse}
          </button>
          <button type="button" className="control-button control-button-primary h-10" onClick={onScanAndOpenTown} disabled={loading}>
            {copy.controls.scanAndOpenTown}
          </button>
        </div>

        {status || error ? (
          <div className={`launcher-state-block ${error ? 'launcher-state-block-error' : ''}`}>
            <p className="launcher-state-block-title">{error ? copy.initialization.error : copy.initialization.status}</p>
            <p className="launcher-state-block-detail">{error ?? status}</p>
            {error ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {onRetry ? (
                  <button type="button" className="control-button h-9" onClick={onRetry}>
                    {loading ? copy.initialization.status : copy.initialization.retry}
                  </button>
                ) : null}
                <button type="button" className="control-button h-9" onClick={onChooseDirectoryAction ?? onChooseDirectory}>
                  {copy.initialization.chooseDirectory}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="initialization-overlay-host">
          <p className="initialization-overlay-host-label">{copy.leftDock.hostMode}</p>
          <p className="initialization-overlay-host-value">{desktopHost ? copy.leftDock.desktopHost : copy.leftDock.browserHost}</p>
        </div>

        <section className="initialization-overlay-detected">
          <div className="initialization-overlay-detected-header">
            <p className="initialization-overlay-detected-label">{copy.initialization.detected}</p>
            <span className="initialization-overlay-detected-hint">{copy.initialization.clickToUse}</span>
          </div>
          <div className="initialization-overlay-detected-list">
            {detectedDirectories.length ? (
              detectedDirectories.map((path) => (
                <button
                  key={`detected:${path}`}
                  type="button"
                  className="initialization-overlay-detected-chip"
                  title={path}
                  disabled={loading}
                  onClick={() => onSelectDirectory(path)}
                >
                  <span className="initialization-overlay-detected-chip-text">{path}</span>
                </button>
              ))
            ) : (
              <p className="initialization-overlay-empty">{copy.initialization.none}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
