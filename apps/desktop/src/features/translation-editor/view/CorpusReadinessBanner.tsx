import { AlertTriangle, Settings2, X } from 'lucide-react'
import { useTranslationEditorCopy } from '@locales/provider'
import type { CorpusReadiness } from '../model/useCorpusReadiness'

/**
 * Reminds the user to build the official corpus index and download the semantic
 * model so AI translation can use official knowledge. Rendered only when the
 * readiness hook reports something actionable.
 */
export function CorpusReadinessBanner({ readiness, onOpenSettings }: { readiness: CorpusReadiness; onOpenSettings?: () => void }) {
  const copy = useTranslationEditorCopy()
  const { dismiss } = readiness
  const corpusMissing = readiness.corpusInspected && !readiness.corpusReady
  const semanticMissing = readiness.semanticInspected && !readiness.semanticReady
  const description =
    corpusMissing && semanticMissing
      ? copy.corpusReminderDescription
      : corpusMissing && readiness.semanticMode === 'lexical'
        ? copy.corpusReminderLexicalDescription
        : corpusMissing
          ? copy.corpusReminderCorpusDescription
          : copy.corpusReminderSemanticDescription
  return (
    <div className="translation-corpus-banner" role="status">
      <AlertTriangle className="translation-corpus-banner-icon h-4 w-4" aria-hidden="true" />
      <div className="translation-corpus-banner-text">
        <p className="translation-corpus-banner-title">{copy.corpusReminderTitle}</p>
        <p className="translation-corpus-banner-description">{description}</p>
      </div>
      <div className="translation-corpus-banner-actions">
        {onOpenSettings ? (
          <button type="button" className="control-button h-8 px-3 text-xs" onClick={onOpenSettings}>
            <Settings2 className="h-3.5 w-3.5" />
            {copy.corpusOpenSettings}
          </button>
        ) : null}
        <button
          type="button"
          className="icon-button h-8 w-8"
          aria-label={copy.reminderDismiss}
          title={copy.reminderDismiss}
          onClick={dismiss}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default CorpusReadinessBanner
