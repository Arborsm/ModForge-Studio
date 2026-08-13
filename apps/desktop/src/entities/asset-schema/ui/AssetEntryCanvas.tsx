import { useId, type ReactNode } from 'react'
import { useAssetAuthoringCopy } from '@locales/provider'
import { setAssetField, type AssetEntryDraft } from '../model/entryDraft'
import { fieldsInGroup, type AssetSchema } from '../model/fieldSchema'
import type { AssetResources } from '../model/resources'
import { AssetFieldRenderer } from './AssetFieldRenderer'
import { JsonField, ReadOnlyField, type OpenGsqBuilder } from './controls'
import type { RenderResourcePickerControl } from './visualControls'

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
  /** Resource browser renderer composed by a feature or page layer. */
  renderResourcePicker?: RenderResourcePickerControl
  /** Fields replaced by page-owned visual controls and omitted from this canvas. */
  hiddenFieldKeys?: readonly string[]
  /** Group navigation style; tabs keep long authoring forms focused on one task. */
  groupPresentation?: 'disclosure' | 'tabs'
  /** Controlled active group when `groupPresentation` is `tabs`. */
  activeGroupId?: string
  /** Selects the visible group rendered by the tab presentation. */
  onActiveGroupChange?: (groupId: string) => void
  /** Page-owned tools rendered inside the active tab before schema fields. */
  renderGroupLead?: (groupId: string) => ReactNode
  /** Page-owned status rendered before each tab label. */
  renderGroupTabLead?: (groupId: string) => ReactNode
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
export function AssetEntryCanvas({
  schema,
  draft,
  onDraftChange,
  resources,
  readOnly,
  onOpenGsqBuilder,
  renderResourcePicker,
  hiddenFieldKeys = [],
  groupPresentation = 'disclosure',
  activeGroupId,
  onActiveGroupChange,
  renderGroupLead,
  renderGroupTabLead,
}: AssetEntryCanvasProps) {
  const copy = useAssetAuthoringCopy()
  const tabPanelId = useId()
  const unknownKeys = Object.keys(draft.unknown)
  const hiddenFields = new Set(hiddenFieldKeys)
  const visibleGroups = schema.groups.flatMap((group) => {
    const fields = fieldsInGroup(schema, group.id).filter((field) => !hiddenFields.has(field.key))
    return fields.length === 0 ? [] : [{ group, fields }]
  })
  const activeGroup = visibleGroups.find(({ group }) => group.id === activeGroupId) ?? visibleGroups[0] ?? null

  const renderFields = (fields: (typeof visibleGroups)[number]['fields']) => (
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
          renderResourcePicker={renderResourcePicker}
        />
      ))}
    </div>
  )

  return (
    <div className="asset-entry-canvas">
      {groupPresentation === 'tabs' ? (
        <section className="asset-entry-tabs">
          <div className="asset-entry-tab-list" role="tablist" aria-orientation="horizontal">
            {visibleGroups.map(({ group }) => {
              const selected = activeGroup?.group.id === group.id
              return (
                <button
                  key={group.id}
                  type="button"
                  id={`${tabPanelId}-${group.id}-tab`}
                  className="asset-entry-tab"
                  role="tab"
                  aria-label={copy.groups[group.labelKey]}
                  aria-selected={selected}
                  aria-controls={selected ? tabPanelId : undefined}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onActiveGroupChange?.(group.id)}
                >
                  {renderGroupTabLead?.(group.id)}
                  {copy.groups[group.labelKey]}
                </button>
              )
            })}
          </div>
          {activeGroup ? (
            <div
              id={tabPanelId}
              className="asset-entry-tab-panel"
              role="tabpanel"
              aria-labelledby={`${tabPanelId}-${activeGroup.group.id}-tab`}
              data-asset-group={activeGroup.group.id}
            >
              {renderGroupLead?.(activeGroup.group.id)}
              {renderFields(activeGroup.fields)}
            </div>
          ) : null}
        </section>
      ) : (
        visibleGroups.map(({ group, fields }) => (
          <details key={group.id} className="asset-entry-group" data-asset-group={group.id} open={!group.collapsedByDefault}>
            <summary className="asset-entry-group-summary">{copy.groups[group.labelKey]}</summary>
            {renderFields(fields)}
          </details>
        ))
      )}

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
