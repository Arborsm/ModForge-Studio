import { useAssetAuthoringCopy } from '@locales/provider'
import { setAssetField, type AssetEntryDraft } from '../model/entryDraft'
import { fieldsInGroup, type AssetSchema } from '../model/fieldSchema'
import type { AssetResources } from '../model/resources'
import { AssetFieldRenderer } from './AssetFieldRenderer'
import { JsonField, ReadOnlyField, type OpenGsqBuilder } from './controls'

export type AssetEntryCanvasProps = {
  schema: AssetSchema
  draft: AssetEntryDraft
  /** Commits a new draft; the caller owns persistence. */
  onDraftChange: (next: AssetEntryDraft) => void
  resources: AssetResources
  /** Renders the same schema without editing affordances, used by browser pages. */
  readOnly?: boolean
  /** Opens the shared GameStateQuery builder for `gsq` controls. */
  onOpenGsqBuilder?: OpenGsqBuilder
}

/**
 * Renders one asset entry as collapsible schema groups plus a panel for keys the
 * schema does not know.
 *
 * Unknown keys are never dropped: they round-trip through the draft and stay
 * editable as raw JSON, so a mod authored against a newer game version survives
 * a pass through the editor unchanged.
 *
 * Mount with a `key` tied to the entry id — several controls keep local draft
 * text that must resync when the edited entry changes.
 */
export function AssetEntryCanvas({ schema, draft, onDraftChange, resources, readOnly, onOpenGsqBuilder }: AssetEntryCanvasProps) {
  const copy = useAssetAuthoringCopy()
  const unknownKeys = Object.keys(draft.unknown)

  return (
    <div className="asset-entry-canvas">
      {schema.groups.map((group) => {
        const fields = fieldsInGroup(schema, group.id)
        if (fields.length === 0) {
          return null
        }
        return (
          <details key={group.id} className="asset-entry-group" open={!group.collapsedByDefault}>
            <summary className="asset-entry-group-summary">{copy.groups[group.labelKey]}</summary>
            <div className="asset-field-grid">
              {fields.map((field) => (
                <AssetFieldRenderer
                  key={field.key}
                  field={field}
                  value={draft.fields[field.key]}
                  onChange={(next) => onDraftChange(setAssetField(draft, field.key, next))}
                  resources={resources}
                  readOnly={readOnly}
                  onOpenGsqBuilder={onOpenGsqBuilder}
                />
              ))}
            </div>
          </details>
        )
      })}

      {unknownKeys.length > 0 ? (
        <details className="asset-entry-group is-unknown">
          <summary className="asset-entry-group-summary">
            <span>{copy.chrome.unknownFieldsTitle}</span>
            <span className="asset-entry-group-count">{copy.chrome.unknownFieldsCount(unknownKeys.length)}</span>
          </summary>
          <p className="asset-field-hint">{copy.chrome.unknownFieldsHint}</p>
          <div className="asset-field-grid">
            {unknownKeys.map((key) =>
              readOnly ? (
                <ReadOnlyField key={key} label={key} wide text={JSON.stringify(draft.unknown[key])} />
              ) : (
                <JsonField
                  key={key}
                  label={key}
                  wide
                  expect="any"
                  value={draft.unknown[key]}
                  onCommit={(next) => {
                    const unknown = { ...draft.unknown }
                    if (next === undefined) {
                      delete unknown[key]
                    } else {
                      unknown[key] = next
                    }
                    onDraftChange({ ...draft, unknown })
                  }}
                />
              ),
            )}
          </div>
        </details>
      ) : null}
    </div>
  )
}
