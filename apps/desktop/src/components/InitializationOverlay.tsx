import { X } from 'lucide-react'
import { useEffect } from 'react'
import type { EditorCopy } from '../lib/editor-shell'

type InitializationOverlayProps = {
  copy: EditorCopy
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
  copy,
  desktopHost,
  gameDirectory,
  detectedDirectories,
  onGameDirectoryChange,
  onSelectDirectory,
  onChooseDirectory,
  onScanAndOpenTown,
  onClose,
}: InitializationOverlayProps) {
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
      className="absolute inset-0 z-40 flex items-center justify-center bg-[color-mix(in_srgb,var(--bg-app)_72%,transparent)] px-6 backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
    >
      <div className="relative w-full max-w-2xl rounded-[28px] border border-[var(--border-color)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-panel)_96%,transparent),color-mix(in_srgb,var(--bg-elevated)_96%,transparent))] p-6 shadow-[var(--shadow-panel)]">
        {onClose ? (
          <button
            type="button"
            className="absolute right-4 top-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            aria-label="Close project overlay"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-tertiary)]">
            {copy.leftDock.project}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{copy.leftDock.gameDirectory}</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{copy.leftDock.projectSubtitle}</p>
        </div>

        <div className="mt-6 grid gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
            {copy.leftDock.gameDirectory}
          </label>
          <input
            className="control-input h-11"
            value={gameDirectory}
            onChange={(event) => onGameDirectoryChange(event.target.value)}
            placeholder={copy.leftDock.directoryPlaceholder}
            spellCheck={false}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className="control-button h-10" onClick={onChooseDirectory}>
            {copy.controls.browse}
          </button>
          <button type="button" className="control-button control-button-primary h-10" onClick={onScanAndOpenTown}>
            {copy.controls.scanAndOpenTown}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            {copy.leftDock.hostMode}
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
            {desktopHost ? copy.leftDock.desktopHost : copy.leftDock.browserHost}
          </p>
        </div>

        <section className="mt-5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              {copy.initialization.detected}
            </p>
            <span className="text-[11px] text-[var(--text-tertiary)]">{copy.initialization.clickToUse}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {detectedDirectories.length ? (
              detectedDirectories.map((path) => (
                <button
                  key={`detected:${path}`}
                  type="button"
                  className="max-w-full rounded-full border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-1.5 text-left text-xs text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  title={path}
                  onClick={() => onSelectDirectory(path)}
                >
                  <span className="block truncate">{path}</span>
                </button>
              ))
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">{copy.initialization.none}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
