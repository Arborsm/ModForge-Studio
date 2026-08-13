import { AlertTriangle, CircleAlert, Info } from 'lucide-react'
import { useAssetAuthoringCopy } from '@locales/provider'
import type { AssetIssue, AssetIssueSeverity } from '../model/fieldSchema'
import { countAssetIssues, formatIssuePath } from '../model/validation'

export type AssetValidationRailProps = {
  issues: readonly AssetIssue[]
  /** Focuses the entry an issue points at; omitted when the host has no navigation. */
  onSelectIssue?: (issue: AssetIssue) => void
}

const SEVERITY_ICON: Record<AssetIssueSeverity, typeof CircleAlert> = {
  error: CircleAlert,
  warning: AlertTriangle,
  info: Info,
}

const SEVERITY_ORDER: Record<AssetIssueSeverity, number> = { error: 0, warning: 1, info: 2 }

/**
 * Renders validation findings of one asset, errors first.
 *
 * Messages resolve from `AssetIssue.messageKey` against the locale bundle, so a
 * schema never carries user-visible text and the same issue list renders
 * identically on the authoring page and the browser page.
 */
export function AssetValidationRail({ issues, onSelectIssue }: AssetValidationRailProps) {
  const copy = useAssetAuthoringCopy()
  const counts = countAssetIssues(issues)
  const sorted = [...issues].sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity])

  return (
    <section className="asset-validation-rail" aria-label={copy.validation.title}>
      <header className="asset-validation-head">
        <h3 className="asset-validation-title">{copy.validation.title}</h3>
        {counts.total > 0 ? (
          <span className="asset-validation-count">{copy.validation.countSummary(counts.errors, counts.warnings)}</span>
        ) : null}
      </header>
      {sorted.length === 0 ? (
        <p className="asset-validation-empty">{copy.validation.empty}</p>
      ) : (
        <ul className="asset-validation-list">
          {sorted.map((issue, index) => {
            const Icon = SEVERITY_ICON[issue.severity]
            const path = formatIssuePath(issue.path)
            const message = copy.issues[issue.messageKey](issue.params ?? {})
            const body = (
              <>
                <Icon className="asset-validation-icon h-3.5 w-3.5" aria-hidden="true" />
                <span className="asset-validation-body">
                  <span className="asset-validation-message">{message}</span>
                  <span className="asset-validation-path">{copy.validation.pathLabel(path)}</span>
                </span>
              </>
            )
            return (
              <li key={`${issue.code}:${path}:${index}`} className={`asset-validation-item is-${issue.severity}`}>
                {onSelectIssue ? (
                  <button type="button" className="asset-validation-button" onClick={() => onSelectIssue(issue)}>
                    <span className="sr-only">{copy.validation.severity[issue.severity]}</span>
                    {body}
                  </button>
                ) : (
                  <span className="asset-validation-static">
                    <span className="sr-only">{copy.validation.severity[issue.severity]}</span>
                    {body}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
