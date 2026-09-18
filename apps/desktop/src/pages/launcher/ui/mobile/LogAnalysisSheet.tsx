import { useEffect } from 'react'
import { RefreshCw, Settings2, Sparkles } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { SmapiLogError } from '@features/launcher/model/gameLogErrors'
import { useLogAnalysis } from '@features/launcher/model/useLogAnalysis'
import { MobileSheet } from './MobileSheet'

/**
 * @file Analysis sheet for SMAPI errors caught by the Android game-log watch:
 * the raw error lines plus an AI analysis run through the existing workbench
 * AI settings (default profile). When no usable workbench profile is set up,
 * the sheet points at the AI settings page instead of carrying its own config.
 * Android host only — the sheet is opened from the error notification's action.
 */

const MAX_RENDERED_ERRORS = 20

export function LogAnalysisSheet({
  open,
  onClose,
  errors,
  onOpenAiSettings,
}: {
  open: boolean
  onClose: () => void
  errors: SmapiLogError[] | null
  onOpenAiSettings: () => void
}) {
  const copy = useEditorCopy().launcher.logAnalysis
  const { ready, profileLoaded, state, runAnalysis, reloadProfile } = useLogAnalysis()

  // Fresh batch opened from the notification: re-resolve the workbench profile
  // (the player may have just finished setting it up) and start the analysis
  // right away when a usable default profile exists.
  useEffect(() => {
    if (!open) {
      return
    }
    void reloadProfile()
  }, [open, reloadProfile])

  useEffect(() => {
    if (!open || !errors?.length || !profileLoaded || !ready) {
      return
    }
    void runAnalysis(errors)
  }, [open, errors, profileLoaded, ready, runAnalysis])

  const renderedErrors = errors?.slice(0, MAX_RENDERED_ERRORS) ?? []
  const hiddenErrorCount = Math.max(0, (errors?.length ?? 0) - renderedErrors.length)

  return (
    <MobileSheet open={open} onClose={onClose} title={copy.sheetTitle} presentation="dialog" className="mobile-log-analysis-sheet">
      {errors?.length ? (
        <div className="mobile-log-analysis-errors">
          <h4 className="mobile-log-analysis-subtitle">{copy.errorsSectionTitle(errors.length)}</h4>
          <ul className="mobile-log-analysis-error-list">
            {renderedErrors.map((error, index) => (
              <li key={`${index}:${error.raw}`} className="mobile-log-analysis-error-item">
                {error.message || copy.emptyErrorMessage}
                {error.source ? <span className="mobile-log-analysis-error-source">{error.source}</span> : null}
              </li>
            ))}
          </ul>
          {hiddenErrorCount > 0 ? <p className="mobile-log-analysis-truncated">{copy.errorsTruncated(hiddenErrorCount)}</p> : null}
        </div>
      ) : null}

      {!ready && profileLoaded ? (
        <div className="mobile-log-analysis-setup">
          <h4 className="mobile-log-analysis-subtitle">{copy.notConfiguredTitle}</h4>
          <p className="mobile-log-analysis-description">{copy.notConfiguredDescription}</p>
          <button
            type="button"
            className="mobile-log-analysis-primary"
            onClick={() => {
              onClose()
              onOpenAiSettings()
            }}
          >
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span>{copy.openSettingsAction}</span>
          </button>
        </div>
      ) : (
        <div className="mobile-log-analysis-result">
          {state.kind === 'running' ? <p className="mobile-log-analysis-running">{copy.runningLabel}</p> : null}
          {state.kind === 'ready' ? (
            <>
              <h4 className="mobile-log-analysis-subtitle">{copy.resultTitle}</h4>
              <p className="mobile-log-analysis-text">{state.text}</p>
            </>
          ) : null}
          {state.kind === 'failed' && state.message !== 'not-configured' ? (
            <>
              <h4 className="mobile-log-analysis-subtitle">{copy.failedTitle}</h4>
              <p className="mobile-log-analysis-error">{state.message}</p>
              <button
                type="button"
                className="mobile-log-analysis-secondary"
                onClick={() => {
                  if (errors?.length) {
                    void runAnalysis(errors)
                  }
                }}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                <span>{copy.retryAction}</span>
              </button>
            </>
          ) : null}
          {state.kind === 'idle' && ready ? (
            <button
              type="button"
              className="mobile-log-analysis-primary"
              onClick={() => {
                if (errors?.length) {
                  void runAnalysis(errors)
                }
              }}
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>{copy.analyzeAction}</span>
            </button>
          ) : null}
        </div>
      )}
    </MobileSheet>
  )
}
