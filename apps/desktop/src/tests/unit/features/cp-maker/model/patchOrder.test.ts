import { describe, expect, it } from 'vite-plus/test'
import type { DraftPatch } from '@features/cp-maker'
import { duplicatePatchInArray, groupPatchesByTarget, movePatchWithin } from '@features/cp-maker'

function makePatch(id: string, target: string, action: DraftPatch['action'] = 'EditMap', extra: Partial<DraftPatch> = {}): DraftPatch {
  return {
    id,
    workspace: 'map',
    target,
    action,
    logName: `log-${id}`,
    enabled: true,
    editorState: {},
    ...extra,
  }
}

describe('movePatchWithin', () => {
  it('moves a patch one position down in export order', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Town'), makePatch('c', 'Maps/Town')]

    expect(movePatchWithin(patches, 'b', 1).map((patch) => patch.id)).toEqual(['a', 'c', 'b'])
  })

  it('moves a patch one position up in export order', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Town'), makePatch('c', 'Maps/Town')]

    expect(movePatchWithin(patches, 'b', -1).map((patch) => patch.id)).toEqual(['b', 'a', 'c'])
  })

  it('returns the original array when the move would cross the upper boundary', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Town')]

    expect(movePatchWithin(patches, 'a', -1)).toBe(patches)
  })

  it('returns the original array when the move would cross the lower boundary', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Town')]

    expect(movePatchWithin(patches, 'b', 1)).toBe(patches)
  })

  it('returns the original array when the patch is absent', () => {
    const patches = [makePatch('a', 'Maps/Town')]

    expect(movePatchWithin(patches, 'missing', 1)).toBe(patches)
  })

  it('allocates a new array only when a move actually happens', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Town')]

    expect(movePatchWithin(patches, 'a', 1)).not.toBe(patches)
  })
})

describe('duplicatePatchInArray', () => {
  it('inserts a deep copy right after the original with the new id', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Town')]

    const next = duplicatePatchInArray(patches, 'a', 'a-copy')

    expect(next.map((patch) => patch.id)).toEqual(['a', 'a-copy', 'b'])
    expect(next[1]).toMatchObject({ target: 'Maps/Town', action: 'EditMap', logName: 'log-a' })
  })

  it('isolates the clone from the original after mutation', () => {
    const patches = [
      makePatch('a', 'Maps/Town', 'EditMap', {
        when: { Season: 'spring' },
        editorState: { note: 'original' },
      }),
    ]

    const [, clone] = duplicatePatchInArray(patches, 'a', 'a-copy')
    clone.when = { Season: 'winter' }
    clone.editorState = { note: 'mutated' }

    expect(patches[0]).toMatchObject({ when: { Season: 'spring' }, editorState: { note: 'original' } })
    expect(patches).toHaveLength(1)
  })

  it('preserves Uint32Array gids inside editor state instead of degrading them to plain objects', () => {
    const gids = new Uint32Array([0x80000001, 2, 3])
    const patches = [
      makePatch('a', 'Maps/Town', 'EditMap', {
        editorState: { mapDocument: { layers: [{ name: 'Back', gids }] } },
      }),
    ]

    const [, clone] = duplicatePatchInArray(patches, 'a', 'a-copy')
    const cloneGids = (clone.editorState as { mapDocument: { layers: Array<{ gids: unknown }> } }).mapDocument.layers[0]!.gids

    // jsdom's structuredClone lives in a different realm, so `instanceof` is
    // unreliable here; the tag and values still prove the clone is a real
    // Uint32Array rather than the plain object a JSON round-trip would produce.
    expect(Object.prototype.toString.call(cloneGids)).toBe('[object Uint32Array]')
    expect(Array.from(cloneGids as Uint32Array)).toEqual([0x80000001, 2, 3])
    expect(cloneGids).not.toBe(gids)
    expect(Array.from(gids)).toEqual([0x80000001, 2, 3])
  })

  it('returns the original array when the patch is absent', () => {
    const patches = [makePatch('a', 'Maps/Town')]

    expect(duplicatePatchInArray(patches, 'missing', 'copy')).toBe(patches)
  })
})

describe('groupPatchesByTarget', () => {
  it('groups case- and separator-equivalent targets under the first-seen spelling', () => {
    const patches = [makePatch('a', 'Maps/Town'), makePatch('b', 'Maps/Farm'), makePatch('c', 'maps\\town')]

    const groups = groupPatchesByTarget(patches)

    expect(groups.map((group) => group.target)).toEqual(['Maps/Town', 'Maps/Farm'])
    expect(groups[0]?.patches.map((patch) => patch.id)).toEqual(['a', 'c'])
  })

  it('keeps group order by first appearance and patch order by array order', () => {
    const patches = [makePatch('p2', 'Maps/Beach'), makePatch('p1', 'Maps/Town'), makePatch('p3', 'Maps/Town')]

    const groups = groupPatchesByTarget(patches)

    expect(groups.map((group) => group.target)).toEqual(['Maps/Beach', 'Maps/Town'])
    expect(groups[1]?.patches.map((patch) => patch.id)).toEqual(['p1', 'p3'])
  })

  it('keeps a multi-target comma expression as one group instead of splitting it', () => {
    const patches = [makePatch('a', 'Maps/Town, Maps/Beach'), makePatch('b', 'maps/town, maps/beach')]

    const groups = groupPatchesByTarget(patches)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.target).toBe('Maps/Town, Maps/Beach')
    expect(groups[0]?.patches.map((patch) => patch.id)).toEqual(['a', 'b'])
  })

  it('keeps comma tokens inside braces intact', () => {
    const patches = [makePatch('a', 'Maps/{{Comma,Target}}'), makePatch('b', 'maps/{{comma,target}}')]

    const groups = groupPatchesByTarget(patches)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.patches.map((patch) => patch.id)).toEqual(['a', 'b'])
  })

  it('applies the action filter before grouping', () => {
    const patches = [
      makePatch('a', 'Maps/Town', 'EditMap'),
      makePatch('b', 'Maps/Town', 'Load', { fromFile: 'assets/maps/Town.tmx' }),
      makePatch('c', 'Maps/Town', 'EditData'),
    ]

    const groups = groupPatchesByTarget(patches, (action) => action === 'EditMap' || action === 'Load')

    expect(groups[0]?.patches.map((patch) => patch.id)).toEqual(['a', 'b'])
  })

  it('returns an empty list for an empty input', () => {
    expect(groupPatchesByTarget([])).toEqual([])
  })
})
