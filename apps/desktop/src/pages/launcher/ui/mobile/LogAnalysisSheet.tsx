import { useEffect, useState } from 'react'
import { RefreshCw, Settings2, Sparkles } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import type { SmapiLogError } from '@features/launcher/model/gameLogErrors'
import { isLogAnalysisAiConfigReady, LOG_ANALYSIS_PROVIDERS, type LogAnalysisProvider } from '@features/launcher/model/logAnalysisAi'
import { useLogAnalysis } from '@features/launcher/model/useLogAnalysis'
import { MobileSheet } from './MobileSheet'

/**
 * @file Analysis sheet for SMAPI errors caught by the Android game-log watch:
 * the raw error lines plus a self-contained AI analysis (provider setup when
 * no config exists yet, the running state, and the rendered result). Android
 * host only — the sheet is opened from the error notification's action.
 */

const MAX_RENDERED_ERRORS = 20

function providerModelPlaceholder(provider: LogAnalysisProvider) {
  return provider.defaultModel
}

export function LogAnalysisSheet({ open, onClose, errors }: { open: boolean; onClose: () => void; errors: SmapiLogError[] | null }) {
  const copy = useEditorCopy().launcher.logAnalysis
  const { config, updateConfig, state, runAnalysis } = useLogAnalysis()
  const ready = isLogAnalysisAiConfigReady(config)
  const initialProvider = LOG_ANALYSIS_PROVIDERS.find((provider) => provider.id === config?.providerId) ?? LOG_ANALYSIS_PROVIDERS[0]
  const [providerId, setProviderId] = useState(initialProvider.id)
  const [model, setModel] = useState(config?.model || initialProvider.defaultModel)
  const [apiKey, setApiKey] = useState(config?.apiKey ?? '')
  const [showSetup, setShowSetup] = useState(!ready)
  const [setupError, setSetupError] = useState<string | null>(null)

  // Fresh batch opened from the notification: start the analysis right away
  // when the provider config is usable.
  useEffect(() => {
    if (!open || !errors?.length || !ready || showSetup) {
      return
    }
    void runAnalysis(errors)
  }, [open, errors, ready, showSetup, runAnalysis])

  const handleSaveAndRun = () => {
    const selectedProvider = LOG_ANALYSIS_PROVIDERS.find((provider) => provider.id === providerId)
    // An empty model means "the provider default suggested by the placeholder".
    const next = {
      providerId,
      model: model.trim() || selectedProvider?.defaultModel || '',
      apiKey: apiKey.trim(),
    }
    if (!isLogAnalysisAiConfigReady(next)) {
      setSetupError(copy.incompleteConfigMessage)
      return
    }
    setSetupError(null)
    updateConfig(next)
    setShowSetup(false)
    if (errors?.length) {
      void runAnalysis(errors)
    }
  }

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

      {showSetup || !ready ? (
        <div className="mobile-log-analysis-setup">
          <h4 className="mobile-log-analysis-subtitle">{copy.setupTitle}</h4>
          <p className="mobile-log-analysis-description">{copy.setupDescription}</p>
          <label className="mobile-log-analysis-field">
            <span>{copy.providerLabel}</span>
            <select
              value={providerId}
              onChange={(event) => {
                const nextProvider = LOG_ANALYSIS_PROVIDERS.find((provider) => provider.id === event.target.value)
                setProviderId(event.target.value)
                if (nextProvider) {
                  setModel(nextProvider.defaultModel)
                }
              }}
            >
              {LOG_ANALYSIS_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mobile-log-analysis-field">
            <span>{copy.modelLabel}</span>
            <input
              type="text"
              value={model}
              placeholder={providerModelPlaceholder(
                LOG_ANALYSIS_PROVIDERS.find((provider) => provider.id === providerId) ?? LOG_ANALYSIS_PROVIDERS[0],
              )}
              onChange={(event) => setModel(event.target.value)}
            />
          </label>
          <label className="mobile-log-analysis-field">
            <span>{copy.apiKeyLabel}</span>
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <span className="mobile-log-analysis-hint">{copy.apiKeyHint}</span>
          </label>
          {setupError ? <p className="mobile-log-analysis-error">{setupError}</p> : null}
          <button type="button" className="mobile-log-analysis-primary" onClick={handleSaveAndRun}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{copy.saveConfigAction}</span>
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
          {state.kind === 'failed' ? (
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
          <button type="button" className="mobile-log-analysis-settings" onClick={() => setShowSetup(true)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span>{copy.setupTitle}</span>
          </button>
        </div>
      )}
    </MobileSheet>
  )
}
