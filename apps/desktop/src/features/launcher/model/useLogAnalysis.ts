import { useCallback, useRef, useState } from 'react'
import { useLocale } from '@locales/provider'
import { appEvent } from '@platform/observability'
import type { SmapiLogError } from './gameLogErrors'
import { loadLogAnalysisAiConfig, requestLogAnalysisAi, saveLogAnalysisAiConfig } from '../api/launcherAndroidAiApi'
import {
  buildLogAnalysisAiRequest,
  buildLogAnalysisPrompt,
  extractLogAnalysisAiText,
  findLogAnalysisProvider,
  isLogAnalysisAiConfigReady,
  type LogAnalysisAiConfig,
} from './logAnalysisAi'

/**
 * @file Runner for the Android launcher's self-contained game-log AI analysis.
 * The minimal provider config (provider, model, API key) is Android-only state
 * persisted through the platform key-value storage — the desktop AI
 * profile/keychain system is not available on the bridge and must not be
 * affected. The runner builds the provider request, pipes it through the
 * native `android:ai_request` HTTP proxy, and surfaces the assistant text.
 */

/** Outcome of one analysis run, rendered by the analysis sheet. */
export type LogAnalysisState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ready'; text: string }
  | { kind: 'failed'; message: string }

/** Drives one AI analysis run for a batch of parsed SMAPI errors. */
export function useLogAnalysis() {
  const locale = useLocale()
  const [config, setConfig] = useState<LogAnalysisAiConfig | null>(() => loadLogAnalysisAiConfig())
  const [state, setState] = useState<LogAnalysisState>({ kind: 'idle' })
  const runIdRef = useRef(0)

  const updateConfig = useCallback((next: LogAnalysisAiConfig) => {
    saveLogAnalysisAiConfig(next)
    setConfig(next)
  }, [])

  const runAnalysis = useCallback(
    async (errors: SmapiLogError[]): Promise<boolean> => {
      const activeConfig = config
      if (!activeConfig || !isLogAnalysisAiConfigReady(activeConfig)) {
        setState({ kind: 'failed', message: 'not-configured' })
        return false
      }
      const provider = findLogAnalysisProvider(activeConfig.providerId)
      const request = buildLogAnalysisAiRequest(activeConfig, buildLogAnalysisPrompt(errors, locale))
      if (!provider || !request) {
        setState({ kind: 'failed', message: 'not-configured' })
        return false
      }

      const runId = ++runIdRef.current
      setState({ kind: 'running' })
      try {
        const response = await requestLogAnalysisAi(request)
        if (runId !== runIdRef.current) {
          return false
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const snippet = response.body.trim().slice(0, 400)
          setState({
            kind: 'failed',
            message: snippet || `HTTP ${response.statusCode}`,
          })
          return false
        }
        const text = extractLogAnalysisAiText(provider.protocol, response.body)
        if (!text) {
          const snippet = response.body.trim().slice(0, 400)
          setState({ kind: 'failed', message: snippet || 'empty-response' })
          return false
        }
        setState({ kind: 'ready', text })
        return true
      } catch (error) {
        if (runId !== runIdRef.current) {
          return false
        }
        appEvent('error', 'Game log AI analysis request failed')
          .error(error)
          .context({ source: 'launcher-log-analysis', operation: 'ai-request' })
          .emit({ notify: false })
        setState({
          kind: 'failed',
          message: error instanceof Error && error.message.trim() ? error.message : 'request-failed',
        })
        return false
      }
    },
    [config, locale],
  )

  return { config, updateConfig, state, runAnalysis }
}
