import { describe, expect, it } from 'vite-plus/test'
import { mapPatchDraftToContentFields } from '@features/cp-maker'

describe('mapPatchDraftToContentFields', () => {
  it('preserves warp source shape and raw token expressions', () => {
    expect(
      mapPatchDraftToContentFields({
        warps: [],
        rawWarps: ['{{WarpExpression}}'],
        warpsSourceShape: 'string',
      }),
    ).toEqual({ AddWarps: '{{WarpExpression}}', PatchMode: 'ReplaceByLayer' })

    expect(
      mapPatchDraftToContentFields({
        warps: [{ fromX: '1', fromY: '2', toMap: 'Town', toX: '3', toY: '4' }],
        rawWarps: ['{{MoreWarps}}'],
        warpsSourceShape: 'array',
      }),
    ).toEqual({ AddWarps: ['1 2 Town 3 4', '{{MoreWarps}}'], PatchMode: 'ReplaceByLayer' })
  })

  it('round-trips MapTiles scalar types and unknown fields', () => {
    const fields = mapPatchDraftToContentFields({
      mapTiles: [
        {
          _raw: {
            Layer: 'Back',
            Position: { X: '{{X}}', Y: 2, Extra: 'kept' },
            Remove: 'true',
            SetIndex: '7',
            CustomField: { preserved: true },
          },
          layer: 'Back',
          x: '{{X}}',
          y: 2,
          remove: true,
          setIndex: '7',
        },
        {
          _raw: { Layer: 'Buildings', Position: { X: 1, Y: 3 }, Remove: true, SetIndex: 4 },
          layer: 'Buildings',
          x: 1,
          y: 3,
          remove: true,
          setIndex: 4,
        },
      ],
    })

    expect(fields['MapTiles']).toEqual([
      {
        Layer: 'Back',
        Position: { X: '{{X}}', Y: 2, Extra: 'kept' },
        Remove: 'true',
        SetIndex: '7',
        CustomField: { preserved: true },
      },
      { Layer: 'Buildings', Position: { X: 1, Y: 3 }, Remove: true, SetIndex: 4 },
    ])
  })

  it('keeps token areas, null properties, text operations, and unknown CP fields', () => {
    expect(
      mapPatchDraftToContentFields({
        properties: { Warp: null, Music: '{{Music}}' },
        fromArea: '{{FromArea}}',
        toArea: { _raw: { X: 1, Y: 2, Width: '{{Width}}', Extra: true }, x: 1, y: 2, width: '{{Width}}', height: 5 },
        textOperations: [{ operation: 'Append', target: ['MapProperties', 'Warp'], value: '{{Warp}}' }],
        FutureField: { retained: true },
        mapDocument: { editorOnly: true },
      }),
    ).toEqual({
      MapProperties: { Warp: null, Music: '{{Music}}' },
      FromArea: '{{FromArea}}',
      ToArea: { X: 1, Y: 2, Width: '{{Width}}', Height: 5, Extra: true },
      PatchMode: 'ReplaceByLayer',
      TextOperations: [{ Operation: 'Append', Target: ['MapProperties', 'Warp'], Value: '{{Warp}}' }],
      FutureField: { retained: true },
    })
  })
})

describe('mapPatchDraftToContentFields — changes card model', () => {
  it('derives FromFile from the patch level, not the file card', () => {
    expect(
      mapPatchDraftToContentFields(
        {
          changes: [
            {
              id: 'file-1',
              type: 'file',
              fromArea: { x: 1, y: 2, width: '{{Width}}', height: 4 },
              toArea: { x: 10, y: 20, width: 3, height: 4 },
              patchMode: 'Overlay',
            },
          ],
        },
        'assets/maps/Source.tbin',
      ),
    ).toEqual({
      FromFile: 'assets/maps/Source.tbin',
      FromArea: { X: 1, Y: 2, Width: '{{Width}}', Height: 4 },
      ToArea: { X: 10, Y: 20, Width: 3, Height: 4 },
      PatchMode: 'Overlay',
    })
  })

  it('lets a stale card-level fromFile never override the patch-level path', () => {
    // A card migrated before the single-source-of-truth model can still carry a
    // leftover `fromFile`; the patch-level value must win for the export.
    expect(
      mapPatchDraftToContentFields(
        {
          changes: [
            {
              id: 'file-1',
              type: 'file',
              fromFile: 'assets/maps/Stale.tbin',
              patchMode: 'ReplaceByLayer',
            },
          ],
        },
        'assets/maps/Current.tbin',
      ),
    ).toEqual({ FromFile: 'assets/maps/Current.tbin', PatchMode: 'ReplaceByLayer' })
  })

  it('flattens tiles cards into MapTiles in card order', () => {
    expect(
      mapPatchDraftToContentFields({
        changes: [
          {
            id: 'tiles-1',
            type: 'tiles',
            mapTiles: [
              { layer: 'Back', x: 1, y: 2, setTilesheet: 'Spring_outdoorsTileSheet', setIndex: 3 },
              { layer: 'Back', x: 5, y: 6, remove: true },
            ],
          },
          {
            id: 'tiles-2',
            type: 'tiles',
            mapTiles: [{ layer: 'Buildings', x: 7, y: 8, setIndex: '{{Index}}', setProperties: { Warp: 'Town 1 2 3 4' } }],
          },
        ],
      }),
    ).toEqual({
      MapTiles: [
        { Layer: 'Back', Position: { X: 1, Y: 2 }, SetTilesheet: 'Spring_outdoorsTileSheet', SetIndex: 3 },
        { Layer: 'Back', Position: { X: 5, Y: 6 }, Remove: true },
        { Layer: 'Buildings', Position: { X: 7, Y: 8 }, SetIndex: '{{Index}}', SetProperties: { Warp: 'Town 1 2 3 4' } },
      ],
    })
  })

  it('merges properties cards into MapProperties, ignoring empty cards', () => {
    expect(
      mapPatchDraftToContentFields({
        changes: [
          { id: 'props-1', type: 'properties', properties: { Warp: 'Town', Music: '{{Music}}' } },
          { id: 'props-2', type: 'properties', properties: {} },
          { id: 'props-3', type: 'properties', properties: { Warp: 'null' } },
        ],
      }),
    ).toEqual({ MapProperties: { Warp: 'null', Music: '{{Music}}' } })
  })

  it('flattens warps and npcWarps cards into AddWarps/AddNpcWarps strings', () => {
    expect(
      mapPatchDraftToContentFields({
        changes: [
          {
            id: 'warps-1',
            type: 'warps',
            warps: [{ fromX: 1, fromY: 2, toMap: 'Town', toX: 3, toY: 4 }],
          },
          {
            id: 'warps-2',
            type: 'warps',
            npcWarps: [{ fromX: 5, fromY: 6, toMap: 'Beach', toX: 7, toY: 8 }],
          },
        ],
      }),
    ).toEqual({
      AddWarps: ['1 2 Town 3 4'],
      AddNpcWarps: ['5 6 Beach 7 8'],
    })
  })

  it('converts text card operations to PascalCase keys', () => {
    expect(
      mapPatchDraftToContentFields({
        changes: [
          {
            id: 'text-1',
            type: 'text',
            textOperations: [{ operation: 'Append', target: 'MapProperties/Warp', value: '{{Warp}}' }],
          },
          {
            id: 'text-2',
            type: 'text',
            textOperations: [{ operation: 'Remove', target: 'Buildings', search: 'x', replaceMode: 'Replace' }],
          },
        ],
      }),
    ).toEqual({
      TextOperations: [
        { Operation: 'Append', Target: 'MapProperties/Warp', Value: '{{Warp}}' },
        { Operation: 'Remove', Target: 'Buildings', Search: 'x', ReplaceMode: 'Replace' },
      ],
    })
  })

  it('does not leak the changes field into content fields while retaining unknown fields', () => {
    const fields = mapPatchDraftToContentFields({
      changes: [{ id: 'tiles-1', type: 'tiles', mapTiles: [{ layer: 'Back', x: 1, y: 2 }] }],
      FutureField: { retained: true },
    })
    expect(fields['changes']).toBeUndefined()
    expect(fields['FutureField']).toEqual({ retained: true })
    expect(fields['MapTiles']).toEqual([{ Layer: 'Back', Position: { X: 1, Y: 2 } }])
  })

  it('falls back to flat fields when changes is empty', () => {
    expect(
      mapPatchDraftToContentFields({
        changes: [],
        properties: { Warp: 'Town' },
        patchMode: 'Overlay',
      }),
    ).toEqual({ MapProperties: { Warp: 'Town' }, PatchMode: 'Overlay' })
  })

  it('omits FromFile when the file card has no patch-level path and defaults PatchMode', () => {
    expect(
      mapPatchDraftToContentFields({
        changes: [{ id: 'file-1', type: 'file' }],
      }),
    ).toEqual({ PatchMode: 'ReplaceByLayer' })
  })

  it('omits FromFile when changes exist but no file card, even with a patch-level path', () => {
    // Deleting the last file card must not leave a region-less FromFile behind:
    // while the card model is active, the file card is the only exit.
    expect(
      mapPatchDraftToContentFields(
        {
          changes: [{ id: 'tiles-1', type: 'tiles', mapTiles: [{ layer: 'Back', x: 1, y: 2, setIndex: 3 }] }],
        },
        'assets/maps/Stale.tbin',
      ),
    ).toEqual({ MapTiles: [{ Layer: 'Back', Position: { X: 1, Y: 2 }, SetIndex: 3 }] })
  })

  it('appends raw token bags after structured card values', () => {
    expect(
      mapPatchDraftToContentFields(
        {
          changes: [
            {
              id: 'warps-1',
              type: 'warps',
              warps: [{ fromX: 1, fromY: 2, toMap: 'Town', toX: 3, toY: 4 }],
              npcWarps: [{ fromX: 5, fromY: 6, toMap: 'Beach', toX: 7, toY: 8 }],
            },
            { id: 'tiles-1', type: 'tiles', mapTiles: [{ layer: 'Back', x: 1, y: 2, setIndex: 3 }] },
          ],
          rawWarps: ['{{MoreWarps}}'],
          rawNpcWarps: '{{NpcWarpExpression}}',
          rawMapTiles: [{ Layer: 'Back', Position: { X: 9, Y: 9 }, SetIndex: '{{TileExpression}}' }],
        },
        undefined,
      ),
    ).toEqual({
      AddWarps: ['1 2 Town 3 4', '{{MoreWarps}}'],
      AddNpcWarps: ['5 6 Beach 7 8', '{{NpcWarpExpression}}'],
      MapTiles: [
        { Layer: 'Back', Position: { X: 1, Y: 2 }, SetIndex: 3 },
        { Layer: 'Back', Position: { X: 9, Y: 9 }, SetIndex: '{{TileExpression}}' },
      ],
    })
  })

  it('keeps editorState.fromFile out of unknown forwarded fields', () => {
    const fields = mapPatchDraftToContentFields({
      changes: [{ id: 'tiles-1', type: 'tiles', mapTiles: [{ layer: 'Back', x: 1, y: 2 }] }],
      fromFile: 'legacy/inside-editor-state.tbin',
    })
    expect(fields['fromFile']).toBeUndefined()
    expect(fields['MapTiles']).toEqual([{ Layer: 'Back', Position: { X: 1, Y: 2 } }])
  })
})
