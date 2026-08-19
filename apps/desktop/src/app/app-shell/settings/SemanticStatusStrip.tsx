/**
 * @file Semantic search status strip: displays compact semantic index/model status above all AI settings tabs.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiSemanticIndexStatus, AiSemanticModelStatus, AiSemanticProgress, AiSemanticSettingsSnapshot } from '@shared/contracts'
import { isTimeoutError, withLoadTimeout } from '@shared/lib/async/withLoadTimeout'
import { composeSemanticStripState, type SemanticStripItemState } from './semanticStatusStripModel'

const SEMANTIC_STRIP_LOAD_TIMEOUT_MS = 10_000

/**
 * Compact semantic-search status line rendered above every AI settings tab.
 * Each host query settles independently (with its own timeout) so one slow or
 * failed command only degrades its own field instead of pinning the strip.
 */
export function SemanticStatusStrip({ active, onConfigure }: { active: boolean; onConfigure: () => void }) {
  const localization = useLocalization()
  const copy = useSettingsMenuCopy().ai.semantic
  const [settings, setSettings] = useState<SemanticStripItemState<AiSemanticSettingsSnapshot>>({ status: 'pending' })
  const [model, setModel] = useState<SemanticStripItemState<AiSemanticModelStatus>>({ status: 'pending' })
  const [index, setIndex] = useState<SemanticStripItemState<AiSemanticIndexStatus>>({ status: 'pending' })
  const [progress, setProgress] = useState<AiSemanticProgress | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!mountedRef.current) return
    const load = async <T,>(command: () => Promise<T>): Promise<SemanticStripItemState<T>> => {
      try {
        const value = await withLoadTimeout(command(), SEMANTIC_STRIP_LOAD_TIMEOUT_MS)
        return { status: 'ok', value }
      } catch (cause) {
        return { status: 'error', timedOut: isTimeoutError(cause) }
      }
    }
    const [nextSettings, nextModel, nextIndex] = await Promise.all([
      load(() => localization.loadSemanticSettings()),
      load(() => localization.inspectSemanticModel()),
      load(() => localization.inspectSemanticIndex([])),
    ])
    if (!mountedRef.current) return
    setSettings(nextSettings)
    setModel(nextModel)
    setIndex(nextIndex)
  }, [localization])

  // Load status on mount: the strip renders across all tabs, so it must not wait
  // for the semantic tab to become active, otherwise users who never open it would
  // keep seeing "Loading semantic search configuration...".
  useEffect(() => {
    void refreshStatus()
  }, [localization, refreshStatus])

  // Subscribe to progress only while the semantic tab is active: the progress bar
  // belongs to the semantic tab, avoiding needless background listening on other tabs.
  useEffect(() => {
    if (!active) return
    let disposed = false
    let dispose: (() => void) | undefined
    void localization
      .listenSemanticProgress((value) => {
        if (disposed) return
        setProgress(value)
        if (value.phase === 'complete') void refreshStatus()
      })
      .then((value) => {
        if (disposed) value()
        else dispose = value
      })
    return () => {
      disposed = true
      dispose?.()
    }
  }, [active, localization, refreshStatus])

  const state = composeSemanticStripState({ settings, model, index })
  const stripText = (() => {
    switch (state.kind) {
      case 'loading':
        return copy.loading
      case 'load-error':
        return state.timedOut ? copy.loadTimeout : copy.loadError
      case 'ready': {
        const parts: string[] = [copy.modes[state.mode]]
        if (state.mode === 'lexical') {
          parts.push(copy.lexicalIndexNotRequired)
        } else {
          if (state.model) parts.push(state.model.available ? copy.available : copy.unavailable)
          else if (state.modelDegraded) parts.push(copy.statusUnknown)
          if (state.index) {
            parts.push(`${state.index.coveragePercentage.toFixed(1)}%`)
            if (state.index.pendingRecords > 0) parts.push(copy.pending(state.index.pendingRecords))
          } else if (state.indexDegraded) {
            parts.push(copy.statusUnknown)
          }
        }
        if (progress && progress.phase !== 'complete') {
          parts.push(`${progress.currentFile} · ${progress.percentage.toFixed(1)}%`)
        }
        return parts.join(' · ')
      }
    }
  })()

  return (
    <aside className="settings-ai-semantic-strip" aria-label={copy.title}>
      <div>
        <strong>{copy.title}</strong>
        <span> · {stripText}</span>
      </div>
      <div className="settings-ai-semantic-strip-actions">
        {state.kind === 'load-error' ? (
          <button type="button" className="settings-window-btn settings-ai-link-btn" onClick={() => void refreshStatus()}>
            {copy.retry}
          </button>
        ) : null}
        {!active ? (
          <button type="button" className="settings-window-btn settings-ai-link-btn" onClick={onConfigure}>
            {copy.configure}
          </button>
        ) : null}
      </div>
    </aside>
  )
}
