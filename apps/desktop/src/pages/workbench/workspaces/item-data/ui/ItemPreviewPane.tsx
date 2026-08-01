import type { AssetEntryDraft } from '@entities/asset-schema'
import { ItemSprite, OBJECT_INEDIBLE, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import { useItemDataEditorCopy } from '@locales/provider'

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function ItemSummary({ draft }: { draft: AssetEntryDraft }) {
  const copy = useItemDataEditorCopy()
  const fields = draft.fields
  const edibility = readNumber(fields['Edibility'])
  const buffCount = Array.isArray(fields['Buffs']) ? fields['Buffs'].length : 0
  const contextTagCount = Array.isArray(fields['ContextTags']) ? fields['ContextTags'].length : 0
  const price = readNumber(fields['Price'])
  const category = readNumber(fields['Category'])
  const rows = [
    { label: copy.summary.type, value: readText(fields['Type']) },
    { label: copy.summary.category, value: category === null ? null : String(category) },
    { label: copy.summary.price, value: price === null ? null : copy.summary.goldValue(price) },
    {
      label: copy.summary.edibility,
      value: edibility === null ? null : edibility <= OBJECT_INEDIBLE ? copy.summary.inedible : copy.summary.energyValue(edibility),
    },
    { label: copy.summary.buffs, value: buffCount === 0 ? null : copy.summary.countValue(buffCount) },
    { label: copy.summary.contextTags, value: contextTagCount === 0 ? null : copy.summary.countValue(contextTagCount) },
  ]
  return (
    <dl className="asset-editor-summary-list item-preview-summary">
      {rows.map((row) => (
        <div key={row.label} className="asset-editor-summary-chip">
          <dt>{row.label}</dt>
          <dd className={row.value === null ? 'is-unset' : undefined}>{row.value ?? copy.summary.notSet}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Pure live result and player-facing data preview for one item. */
export function ItemPreviewPane({
  item,
  draft,
  textureState,
}: {
  item: ItemWorkspaceEntry | null
  draft: AssetEntryDraft | null
  textureState: ItemTextureAssetState
}) {
  const copy = useItemDataEditorCopy()
  return (
    <aside className="asset-preview-pane item-preview-pane">
      {item === null ? (
        <p className="asset-field-hint">{copy.preview.empty}</p>
      ) : (
        <section className="item-preview-content">
          <div className="asset-preview-head">
            <span className="asset-editor-card-title">{copy.preview.title}</span>
            <span className="asset-editor-badge is-ok">{item.itemId}</span>
          </div>
          <div className="item-preview-stage">
            <ItemSprite item={item} textureState={textureState} scale={5} className="item-preview-sprite" />
          </div>
          <div className="item-preview-name">{item.displayName}</div>
          {item.description ? <p className="item-preview-description">{item.description}</p> : null}
          <p className="asset-editor-asset-hint">
            {textureState.url === null
              ? copy.preview.spriteMissing
              : copy.preview.spriteHint(item.textureAssetName ?? '', item.spriteIndex ?? 0)}
          </p>
          {draft !== null ? <ItemSummary draft={draft} /> : null}
        </section>
      )}
    </aside>
  )
}
