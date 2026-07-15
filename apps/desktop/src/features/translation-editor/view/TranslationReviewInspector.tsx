import { ArrowDown, ArrowUp, Ban, Check, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { useTranslationEditorCopy } from '@locales/provider'
import type { AiReviewIssue, AiReviewResult } from '@shared/contracts'
import { cx } from '@shared/lib/helper'

export function TranslationReviewInspector({
  result,
  selectedId,
  checked,
  onSelect,
  onChecked,
  onUpdate,
  running,
  error,
  onReviewCurrent,
  onClose,
}: {
  result: AiReviewResult | null
  selectedId: string | null
  checked: Set<string>
  onSelect: (id: string) => void
  onChecked: (value: Set<string>) => void
  onUpdate: (updates: Array<{ issue: AiReviewIssue; status: 'open' | 'ignored' | 'accepted' }>) => Promise<void>
  running: boolean
  error: string | null
  onReviewCurrent: () => void
  onClose: () => void
}) {
  const copy = useTranslationEditorCopy()
  const issues = result?.issues ?? []
  const selected = issues.find((issue) => issue.id === selectedId) ?? null
  const selectedIndex = selected ? issues.findIndex((issue) => issue.id === selected.id) : -1
  const acceptable = issues.filter((issue) => checked.has(issue.id) && issue.status === 'open' && issue.suggestion)
  const toggle = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChecked(next)
  }
  return (
    <aside className="translation-review-inspector" aria-label={copy.reviewInspector}>
      <header>
        <div>
          <ShieldCheck className="h-4 w-4" />
          <strong>{copy.reviewInspector}</strong>
          {result ? (
            <span>
              {result.run.summary.open}/{result.run.summary.total}
            </span>
          ) : null}
        </div>
        <div>
          {selected ? <code>{selected.unitKey}</code> : null}
          <button
            type="button"
            className="icon-button h-10 w-10"
            disabled={selectedIndex <= 0}
            onClick={() => onSelect(issues[selectedIndex - 1]!.id)}
            title={copy.shortcutSaveAndPrevious}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button h-10 w-10"
            disabled={selectedIndex < 0 || selectedIndex >= issues.length - 1}
            onClick={() => onSelect(issues[selectedIndex + 1]!.id)}
            title={copy.shortcutSaveAndNext}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="icon-button h-10 w-10"
            onClick={onClose}
            title={copy.reviewCancel}
            aria-label={copy.reviewCancel}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>
      {running ? (
        <div className="translation-review-skeleton" role="status" aria-live="polite">
          <span>{copy.reviewRunningState}</span>
          <i />
          <i />
          <i />
        </div>
      ) : error ? (
        <div className="translation-review-empty" role="alert">
          <p>{error}</p>
          <button type="button" className="control-button" onClick={onReviewCurrent}>
            {copy.retry}
          </button>
        </div>
      ) : !result ? (
        <div className="translation-review-empty">
          <p>{copy.reviewNotRun}</p>
          <button type="button" className="control-button" onClick={onReviewCurrent}>
            {copy.reviewCurrent}
          </button>
        </div>
      ) : !issues.length ? (
        <div className="translation-review-empty" role="status">
          <ShieldCheck className="h-5 w-5" />
          <p>{copy.reviewEmpty}</p>
        </div>
      ) : (
        <div className="translation-review-body">
          <div className="translation-review-list">
            {issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                className={cx('translation-review-row', selectedId === issue.id && 'is-active')}
                onClick={() => onSelect(issue.id)}
              >
                <input
                  type="checkbox"
                  checked={checked.has(issue.id)}
                  disabled={issue.status !== 'open' || !issue.suggestion}
                  onClick={(event) => event.stopPropagation()}
                  onChange={() => toggle(issue.id)}
                  aria-label={`${copy.reviewAccept}: ${issue.unitKey}`}
                />
                <span className={cx('translation-review-severity', `is-${issue.severity}`)}>{copy.reviewSeverity[issue.severity]}</span>
                <div>
                  <code>{issue.unitKey}</code>
                  <span>{issue.category}</span>
                </div>
                <span>{copy.reviewStatus[issue.status]}</span>
              </button>
            ))}
          </div>
          <div className="translation-review-detail">
            {selected ? (
              <>
                <div className="translation-review-meta">
                  <span className={cx('translation-review-severity', `is-${selected.severity}`)}>
                    {copy.reviewSeverity[selected.severity]}
                  </span>
                  <span>{copy.reviewStatus[selected.status]}</span>
                </div>
                <code>{selected.unitKey}</code>
                <label>{copy.reviewReason}</label>
                <p>{copy.reviewLocalReasons[selected.reason] ?? selected.reason}</p>
                {selected.suggestion ? (
                  <>
                    <label>{copy.reviewSuggestion}</label>
                    <div className="translation-review-diff">
                      <pre className="is-removed">
                        <span>-</span>
                        {selected.targetSnapshot}
                      </pre>
                      <pre className="is-added">
                        <span>+</span>
                        {selected.suggestion}
                      </pre>
                    </div>
                  </>
                ) : null}
                {selected.status === 'stale' ? <p className="translation-review-stale">{copy.reviewStale}</p> : null}
                <div className="translation-review-actions">
                  {selected.status === 'open' ? (
                    <>
                      <button
                        type="button"
                        className="control-button"
                        onClick={() => void onUpdate([{ issue: selected, status: 'ignored' }])}
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {copy.reviewIgnore}
                      </button>
                      {selected.suggestion ? (
                        <button
                          type="button"
                          className="control-button control-button-primary"
                          onClick={() => void onUpdate([{ issue: selected, status: 'accepted' }])}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {copy.reviewAccept}
                        </button>
                      ) : null}
                    </>
                  ) : selected.status === 'ignored' ? (
                    <button type="button" className="control-button" onClick={() => void onUpdate([{ issue: selected, status: 'open' }])}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      {copy.reviewReopen}
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <p>{copy.reviewSelectIssue}</p>
            )}
          </div>
        </div>
      )}
      {acceptable.length ? (
        <footer>
          <button
            type="button"
            className="control-button control-button-primary"
            onClick={() => void onUpdate(acceptable.map((issue) => ({ issue, status: 'accepted' })))}
          >
            <Check className="h-3.5 w-3.5" />
            {copy.reviewAcceptSelected}
          </button>
        </footer>
      ) : null}
    </aside>
  )
}
