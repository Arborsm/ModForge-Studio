import { useEffect, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useLocalization } from '@entities/localization'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiSemanticIndexStatus, AiSemanticSearchMode } from '@shared/contracts'
import { requestAppSettings } from '@shared/lib/app-settings-events'

export function SemanticSearchStatus({ scopeId, showConfigure = true }: { scopeId?: string; showConfigure?: boolean }) {
  const localization = useLocalization()
  const copy = useSettingsMenuCopy().ai.semantic
  const [index, setIndex] = useState<AiSemanticIndexStatus | null>(null)
  const [configuredMode, setConfiguredMode] = useState<AiSemanticSearchMode | null>(null)

  useEffect(() => {
    let current = true
    void localization
      .loadSemanticSettings()
      .then((settings) => {
        if (!current) return
        setConfiguredMode(settings.mode)
        return localization.inspectSemanticIndex(scopeId ? [scopeId] : []).then((nextIndex) => {
          if (current) setIndex(nextIndex)
        })
      })
      .catch(() => {
        if (current) {
          setConfiguredMode(null)
          setIndex(null)
        }
      })
    return () => {
      current = false
    }
  }, [localization, scopeId])

  const retrievalMode = configuredMode === 'lexical' ? 'lexical' : (index?.retrievalMode ?? 'lexical')
  const usesSemanticIndex = configuredMode !== null && configuredMode !== 'lexical'
  return (
    <div className="ai-localization-semantic-status">
      <span>{copy.retrievalModes[retrievalMode]}</span>
      {usesSemanticIndex && index ? (
        <span>{copy.coverage(index.indexedRecords, index.sourceRecords, index.coveragePercentage)}</span>
      ) : null}
      {configuredMode === 'lexical' ? <span>{copy.lexicalIndexNotRequired}</span> : null}
      {showConfigure ? (
        <button type="button" className="control-button" onClick={() => requestAppSettings({ category: 'ai', aiTab: 'semantic' })}>
          <Settings2 className="h-4 w-4" />
          {copy.configure}
        </button>
      ) : null}
    </div>
  )
}
