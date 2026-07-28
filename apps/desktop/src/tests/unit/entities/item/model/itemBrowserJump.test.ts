/**
 * "Open in item authoring" target resolution.
 *
 * The rule this pins down is the scope boundary of the item slice: a supported
 * family resolves to the structured editor and carries the entry to select, an
 * unsupported family resolves to the raw escape hatch — and neither ever resolves
 * to nothing, because a codex jump must not dead-end.
 */

import { describe, expect, it } from 'vite-plus/test'
import {
  findItemAssetFamily,
  findItemAssetFamilyByAssetId,
  isStructuredItemAsset,
  ITEM_ASSET_FAMILIES,
  OBJECT_DATA_ASSET_ID,
  resolveItemAuthoringTarget,
  resolveItemFamilyTarget,
  useItemAuthoringHandoff,
} from '@entities/item'
import type { ItemKind } from '@entities/item'

const ALL_KINDS: readonly ItemKind[] = [
  'object',
  'big-craftable',
  'weapon',
  'tool',
  'boots',
  'hat',
  'shirt',
  'pants',
  'trinket',
  'furniture',
]

function resetHandoff() {
  useItemAuthoringHandoff.setState({ pendingTarget: null, pendingEntry: null })
}

describe('item asset families', () => {
  it('declares exactly one family per item kind', () => {
    expect(ITEM_ASSET_FAMILIES.map((family) => family.kind).sort()).toEqual([...ALL_KINDS].sort())
    for (const kind of ALL_KINDS) {
      expect(findItemAssetFamily(kind).kind).toBe(kind)
    }
  })

  it('edits Data/Objects structurally and every other family as raw JSON', () => {
    expect(isStructuredItemAsset(OBJECT_DATA_ASSET_ID)).toBe(true)
    const structured = ITEM_ASSET_FAMILIES.filter((family) => family.editor === 'structured')
    expect(structured.map((family) => family.assetId)).toEqual([OBJECT_DATA_ASSET_ID])
  })

  it('matches a target regardless of case and slash direction', () => {
    expect(findItemAssetFamilyByAssetId('data\\objects')?.kind).toBe('object')
    expect(findItemAssetFamilyByAssetId('Data/Hats')?.kind).toBe('hat')
    expect(findItemAssetFamilyByAssetId('Data/Buildings')).toBeNull()
    expect(isStructuredItemAsset('Data/Weapons')).toBe(false)
  })
})

describe('jump target resolution', () => {
  it('sends a supported family to the structured editor, carrying the entry', () => {
    const target = resolveItemAuthoringTarget('object', '424')

    expect(target).toEqual({
      kind: 'object',
      assetId: OBJECT_DATA_ASSET_ID,
      itemId: '424',
      qualifiedItemId: '(O)424',
      editor: 'structured',
    })
  })

  it('sends an unsupported family to the raw escape hatch instead of nowhere', () => {
    const weapon = resolveItemAuthoringTarget('weapon', '4')
    expect(weapon.editor).toBe('raw')
    expect(weapon.assetId).toBe('Data/Weapons')
    expect(weapon.itemId).toBe('4')

    const hat = resolveItemAuthoringTarget('hat', 'Aspen_Cap')
    expect(hat.editor).toBe('raw')
    expect(hat.assetId).toBe('Data/hats')
  })

  it('degrades a blank id to the family target', () => {
    expect(resolveItemAuthoringTarget('object', '   ')).toEqual(resolveItemFamilyTarget('object'))
    expect(resolveItemFamilyTarget('trinket').itemId).toBeNull()
  })

  it('trims the id it carries', () => {
    expect(resolveItemAuthoringTarget('object', '  424 ').itemId).toBe('424')
  })
})

describe('authoring handoff phases', () => {
  it('hands a structured target to the editor once its patch is open', () => {
    resetHandoff()
    const store = useItemAuthoringHandoff.getState()
    store.requestOpen(resolveItemAuthoringTarget('object', '424'))

    expect(useItemAuthoringHandoff.getState().pendingTarget?.assetId).toBe(OBJECT_DATA_ASSET_ID)
    expect(useItemAuthoringHandoff.getState().pendingEntry).toBeNull()

    useItemAuthoringHandoff.getState().patchOpened()

    expect(useItemAuthoringHandoff.getState().pendingTarget).toBeNull()
    expect(useItemAuthoringHandoff.getState().pendingEntry?.itemId).toBe('424')

    expect(useItemAuthoringHandoff.getState().consumePendingEntry()?.itemId).toBe('424')
    expect(useItemAuthoringHandoff.getState().consumePendingEntry()).toBeNull()
  })

  it('ends a raw jump once its patch is open, leaving no entry to select', () => {
    resetHandoff()
    useItemAuthoringHandoff.getState().requestOpen(resolveItemAuthoringTarget('weapon', '4'))
    useItemAuthoringHandoff.getState().patchOpened()

    expect(useItemAuthoringHandoff.getState().pendingTarget).toBeNull()
    expect(useItemAuthoringHandoff.getState().pendingEntry).toBeNull()
  })

  it('ends a family jump without selecting an entry, even for the structured family', () => {
    resetHandoff()
    useItemAuthoringHandoff.getState().requestOpen(resolveItemFamilyTarget('object'))
    useItemAuthoringHandoff.getState().patchOpened()

    expect(useItemAuthoringHandoff.getState().pendingEntry).toBeNull()
  })

  it('replaces an unconsumed request rather than queueing it', () => {
    resetHandoff()
    useItemAuthoringHandoff.getState().requestOpen(resolveItemAuthoringTarget('object', '424'))
    useItemAuthoringHandoff.getState().requestOpen(resolveItemAuthoringTarget('weapon', '4'))

    expect(useItemAuthoringHandoff.getState().pendingTarget?.kind).toBe('weapon')
    resetHandoff()
  })
})
