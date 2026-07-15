import { Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocalization } from '@entities/localization'
import { useSettingsMenuCopy } from '@locales/provider'
import type { AiSemanticIndexStatus } from '@shared/contracts'
import { requestAppSettings } from '@shared/lib/app-settings-events'

export function SemanticSearchStatus({ scopeId }: { scopeId?: string }) {
  const localization = useLocalization()
  const copy = useSettingsMenuCopy().ai.semantic
  const [index, setIndex] = useState<AiSemanticIndexStatus | null>(null)

  useEffect(() => {
    let current = true
    void localization
      .inspectSemanticIndex(scopeId ? [scopeId] : [])
      .then((nextIndex) => {
        if (!current) return
        setIndex(nextIndex)
      })
      .catch(() => {
        if (current) setIndex(null)
      })
    return () => {
      current = false
    }
  }, [localization, scopeId])

  const mode = index?.retrievalMode ?? 'lexical'
  return (
    <div className="ai-localization-semantic-status">
      <span>{copy.retrievalModes[mode]}</span>
      {index ? <span>{copy.coverage(index.indexedRecords, index.sourceRecords, index.coveragePercentage)}</span> : null}
      <button type="button" className="control-button" onClick={() => requestAppSettings('ai')}>
        <Settings2 className="h-4 w-4" />
        {copy.configure}
      </button>
    </div>
  )
}
