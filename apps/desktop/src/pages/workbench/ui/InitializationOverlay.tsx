import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useEditorCopy } from '@locales/localeContext'

type InitializationOverlayProps = {
  desktopHost: boolean
  gameDirectory: string
  detectedDirectories: string[]
  onGameDirectoryChange: (value: string) => void
  onSelectDirectory: (value: string) => void
  onChooseDirectory: () => void
  onScanAndOpenTown: () => void
  onClose?: () => void
}

export default function InitializationOverlay({
  desktopHost,
  gameDirectory,
  detectedDirectories,
  onGameDirectoryChange,
  onSelectDirectory,
  onChooseDirectory,
  onScanAndOpenTown,
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
          <button type="button" className="control-button h-10" onClick={onChooseDirectory}>
            {copy.controls.browse}
          </button>
          <button type="button" className="control-button control-button-primary h-10" onClick={onScanAndOpenTown}>
            {copy.controls.scanAndOpenTown}
          </button>
        </div>

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
