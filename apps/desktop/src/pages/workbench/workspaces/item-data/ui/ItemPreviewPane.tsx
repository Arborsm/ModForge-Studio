/**
 * Right pane of the item authoring editor: the sprite the entry resolves to, the
 * numbers a player will feel, and everything validation has to say.
 *
 * The sprite goes through the shared `ItemSprite`, so the codex and this editor
 * cut the same sheet the same way — an author checking a `SpriteIndex` here sees
 * exactly what the item browser will show once the patch ships.
 */

import { useEffect, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { AssetValidationRail, type AssetEntryDraft, type AssetIssue, type AssetTexturePatchState } from '@entities/asset-schema'
import { ItemSprite, loadItemTextureAssetState, OBJECT_INEDIBLE, type ItemTextureAssetState, type ItemWorkspaceEntry } from '@entities/item'
import type { LocaleCode } from '@locales'
import { useItemDataEditorCopy } from '@locales/provider'

const EMPTY_TEXTURE: ItemTextureAssetState = { loading: false, path: null, url: null, width: null, height: null }

/** Loads the sheet the entry's `Texture` names, from the game directory. */
function useItemTexture(assetName: string | null, gameRootPath: string | null, locale: LocaleCode): ItemTextureAssetState {
  const [state, setState] = useState<ItemTextureAssetState>(EMPTY_TEXTURE)

  useEffect(() => {
    if (!assetName || !gameRootPath) {
      setState(EMPTY_TEXTURE)
      return
    }

    let cancelled = false
    setState({ ...EMPTY_TEXTURE, loading: true })

    void loadItemTextureAssetState(gameRootPath, assetName, locale)
      .then((texture) => {
        if (!cancelled) {
          setState(texture)
        }
      })
      .catch(() => {
        if (!cancelled) {
          // A custom sheet usually exists only as a Load patch; the texture card
          // below reports that, so the stage just stays empty.
          setState(EMPTY_TEXTURE)
        }
      })

    return () => {
      cancelled = true
    }
  }, [assetName, gameRootPath, locale])

  return state
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function SummaryCard({ draft }: { draft: AssetEntryDraft }) {
  const copy = useItemDataEditorCopy()
  const fields = draft.fields
  const edibility = readNumber(fields['Edibility'])
  const buffCount = Array.isArray(fields['Buffs']) ? fields['Buffs'].length : 0
  const contextTagCount = Array.isArray(fields['ContextTags']) ? fields['ContextTags'].length : 0
  const price = readNumber(fields['Price'])
  const category = readNumber(fields['Category'])

  const chips: Array<{ label: string; value: string | null }> = [
    { label: copy.summary.type, value: readText(fields['Type']) },
    // The category is an id the game matches on, not a quantity, so it stays bare.
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
    <section className="asset-editor-card">
      <div className="asset-editor-card-title">{copy.summary.title}</div>
      <dl className="asset-editor-summary-list">
        {chips.map((chip) => (
          <div key={chip.label} className="asset-editor-summary-chip">
            <dt>{chip.label}</dt>
            <dd className={chip.value === null ? 'is-unset' : undefined}>{chip.value ?? copy.summary.notSet}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function TextureCard({
  state,
  resolvedFromGame,
  onOpenEditor,
}: {
  state: AssetTexturePatchState
  resolvedFromGame: boolean
  onOpenEditor: () => void
}) {
  const copy = useItemDataEditorCopy()
  // An object that keeps the vanilla sheet needs no Load patch at all, so the
  // "missing" badge is only honest once the sheet failed to resolve too.
  const status = state.patchFound ? copy.texture.patchFound : resolvedFromGame ? copy.texture.vanillaSheet : copy.texture.patchMissing
  // Whole-file replacement of a shared `Maps/` sheet is never what an item
  // author wants (and routes to the map editor); only custom sheets open here.
  const canProvide = !state.assetTarget.trim().toLowerCase().startsWith('maps/')

  return (
    <section className="asset-editor-card">
      <div className="asset-editor-card-title">
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        <span>{copy.texture.title}</span>
      </div>
      <div className="asset-editor-asset-row">
        <span className="asset-editor-asset-file-label">{copy.texture.assetLabel}</span>
        <span className={state.patchFound || resolvedFromGame ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>{status}</span>
      </div>
      <div className="asset-editor-asset-target">{state.assetTarget}</div>
      {state.fromFile !== null ? (
        <div className="asset-editor-asset-file">
          <span className="asset-editor-asset-file-value">{state.fromFile}</span>
          <span className={state.fileInDraft ? 'asset-editor-badge is-ok' : 'asset-editor-badge is-warn'}>
            {state.fileInDraft ? copy.texture.patchFound : copy.texture.patchMissing}
          </span>
        </div>
      ) : null}
      {canProvide ? (
        <>
          <p className="asset-editor-asset-hint">{copy.texture.manageHint}</p>
          <button type="button" className="control-button mt-2" onClick={onOpenEditor}>
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copy.texture.openEditorAction}</span>
          </button>
        </>
      ) : null}
    </section>
  )
}

export function ItemPreviewPane({
  item,
  draft,
  issues,
  texturePatchState,
  gameRootPath,
  locale,
  onOpenTextureEditor,
  onSelectIssue,
}: {
  item: ItemWorkspaceEntry | null
  draft: AssetEntryDraft | null
  issues: AssetIssue[]
  texturePatchState: AssetTexturePatchState | null
  gameRootPath: string | null
  locale: LocaleCode
  onOpenTextureEditor: () => void
  onSelectIssue: (issue: AssetIssue) => void
}) {
  const copy = useItemDataEditorCopy()
  const textureState = useItemTexture(item?.textureAssetName ?? null, gameRootPath, locale)

  return (
    <aside className="asset-preview-pane">
      {item === null ? (
        <div className="asset-editor-card">
          <p className="asset-field-hint">{copy.preview.empty}</p>
        </div>
      ) : (
        <section className="asset-editor-card">
          <div className="asset-preview-head">
            <span className="asset-editor-card-title">{copy.preview.title}</span>
            <span className="asset-editor-badge is-ok">{item.itemId}</span>
          </div>

          <div className="item-preview-stage">
            <ItemSprite item={item} textureState={textureState} scale={4} className="item-preview-sprite" />
          </div>

          <div className="item-preview-name">{item.displayName}</div>
          {item.description ? <p className="item-preview-description">{item.description}</p> : null}
          <p className="asset-editor-asset-hint">
            {textureState.url === null
              ? copy.preview.spriteMissing
              : copy.preview.spriteHint(item.textureAssetName ?? '', item.spriteIndex ?? 0)}
          </p>
        </section>
      )}

      {draft !== null ? <SummaryCard draft={draft} /> : null}
      {item !== null && texturePatchState !== null ? (
        <TextureCard state={texturePatchState} resolvedFromGame={textureState.url !== null} onOpenEditor={onOpenTextureEditor} />
      ) : null}

      <AssetValidationRail issues={issues} onSelectIssue={onSelectIssue} />
    </aside>
  )
}
