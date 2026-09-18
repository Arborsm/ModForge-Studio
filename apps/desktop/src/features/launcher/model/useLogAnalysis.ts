import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '@locales/provider'
import { appEvent } from '@platform/observability'
import type { AiProviderPreset, AiProviderProfile } from '@shared/contracts'
import type { SmapiLogError } from './gameLogErrors'
import { loadLogAnalysisProfile, requestLogAnalysisAi } from '../api/launcherAndroidAiApi'
import { buildLogAnalysisAiRequest, buildLogAnalysisPrompt, extractLogAnalysisAiText, isLogAnalysisProfileReady } from './logAnalysisAi'

/**
 * @file Runner for the Android launcher's game-log AI analysis. The analysis
 * consumes the existing workbench AI settings (the same default profile the
 * translation editor uses) instead of a parallel config; credentials stay on
 * the native side and are attached by profileId inside the `android:ai_request`
 * proxy. The runner builds the provider request, pipes it through the proxy,
 * and surfaces the assistant text.
 */

/** Outcome of one analysis run, rendered by the analysis sheet. */
export type LogAnalysisState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ready'; text: string }
  | { kind: 'failed'; message: string }

/** Workbench profile resolved for analysis, with its preset (null preset = custom/unknown). */
export type LogAnalysisTarget = { profile: AiProviderProfile; preset: AiProviderPreset | null }

/** Drives one AI analysis run for a batch of parsed SMAPI errors. */
export function useLogAnalysis() {
  const locale = useLocale()
  const [target, setTarget] = useState<LogAnalysisTarget | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [state, setState] = useState<LogAnalysisState>({ kind: 'idle' })
  const runIdRef = useRef(0)

  const reloadProfile = useCallback(async () => {
    try {
      setTarget(await loadLogAnalysisProfile())
    } catch (error) {
      appEvent('error', 'Loading workbench AI profile for log analysis failed')
        .error(error)
        .context({ source: 'launcher-log-analysis', operation: 'load-profile' })
        .emit({ notify: false })
      setTarget(null)
    } finally {
      setProfileLoaded(true)
    }
  }, [])

  useEffect(() => {
    void reloadProfile()
  }, [reloadProfile])

  const ready = isLogAnalysisProfileReady(target?.profile, target?.preset?.requiresApiKey ?? true)

  const runAnalysis = useCallback(
    async (errors: SmapiLogError[]): Promise<boolean> => {
      if (!target || !ready) {
        setState({ kind: 'failed', message: 'not-configured' })
        return false
      }
      const request = buildLogAnalysisAiRequest(target.profile, buildLogAnalysisPrompt(errors, locale))
      if (!request) {
        setState({ kind: 'failed', message: 'not-configured' })
        return false
      }

      const runId = ++runIdRef.current
      setState({ kind: 'running' })
      try {
        const response = await requestLogAnalysisAi({ profileId: target.profile.id, ...request })
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
        const text = extractLogAnalysisAiText(target.profile.protocol, response.body)
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
    [target, ready, locale],
  )

  return { target, profileLoaded, ready, state, runAnalysis, reloadProfile }
}
