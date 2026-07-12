import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it } from 'vite-plus/test'
import { GenericPatchEditor, getWorkspacePlugin, type CpMakerDraft, type DraftPatch, type EditorComponent } from '@features/cp-maker'
import { EventPatchEditor } from '@pages/workbench/workspaces/event-stage'
import { ImagePatchEditor } from '@pages/workbench/workspaces/image-patch'
import { MapPatchEditor } from '@pages/workbench/workspaces/map'
import '@pages/workbench/model/builtInWorkspaces'

function patch(action: DraftPatch['action'], target: string, editorState: unknown = {}): DraftPatch {
  return { id: `${action}:${target}`, workspace: 'mods', action, target, logName: target, enabled: true, editorState }
}

function editorType(workspaceId: 'map' | 'events' | 'characters' | 'buildings' | 'items', draftPatch: DraftPatch) {
  const editor = getWorkspacePlugin(workspaceId)?.editMode.editor as ((props: ComponentProps<EditorComponent>) => ReactElement) | undefined
  const element = editor?.({
    patch: draftPatch,
    draft: { projectMetadata: {}, virtualAssets: [] } as unknown as CpMakerDraft,
    onPatchChange: () => undefined,
    onAddVirtualAsset: () => undefined,
  })
  return element?.type
}

describe('built-in CP Maker workspace plugins', () => {
  it('routes every allowed asset action to its real editor', () => {
    expect(editorType('map', patch('EditMap', 'Maps/Town'))).toBe(MapPatchEditor)
    expect(editorType('map', patch('EditData', 'Data/Locations'))).toBe(GenericPatchEditor)
    expect(editorType('events', patch('EditData', 'Data/Events/Town'))).toBe(EventPatchEditor)
    expect(editorType('events', patch('Load', 'Data/Events/Town'))).toBe(GenericPatchEditor)
    expect(editorType('characters', patch('EditImage', 'Characters/Abigail'))).toBe(ImagePatchEditor)
    expect(editorType('characters', patch('EditData', 'Data/NPC'))).toBe(GenericPatchEditor)
    expect(editorType('buildings', patch('EditMap', 'Maps/BuildingInterior'))).toBe(MapPatchEditor)
    expect(editorType('buildings', patch('EditData', 'Data/Buildings'))).toBe(GenericPatchEditor)
    expect(editorType('items', patch('EditImage', 'TileSheets/crops'))).toBe(ImagePatchEditor)
    expect(editorType('items', patch('EditData', 'Data/Objects'))).toBe(GenericPatchEditor)
  })

  it('serializes data, map, and image state without crossing formats', () => {
    const mapPlugin = getWorkspacePlugin('map')!
    const eventPlugin = getWorkspacePlugin('events')!
    const buildingPlugin = getWorkspacePlugin('buildings')!
    const itemPlugin = getWorkspacePlugin('items')!

    expect(mapPlugin.serializer.toChangeEntry(patch('EditData', 'Data/Locations', { Entries: { Town: {} } }))).toEqual({
      Action: 'EditData',
      Target: 'Data/Locations',
      Entries: { Town: {} },
    })
    expect(
      buildingPlugin.serializer.toChangeEntry(patch('EditMap', 'Maps/BuildingInterior', { properties: { Music: 'spring' } })),
    ).toMatchObject({ Action: 'EditMap', Target: 'Maps/BuildingInterior', MapProperties: { Music: 'spring' } })
    expect(itemPlugin.serializer.toChangeEntry(patch('EditImage', 'TileSheets/crops', { patchMode: 'Overlay' }))).toMatchObject({
      Action: 'EditImage',
      Target: 'TileSheets/crops',
      PatchMode: 'Overlay',
    })
    expect(eventPlugin.serializer.toChangeEntry({ ...patch('Load', 'Data/Events/Town'), fromFile: 'assets/events.json' })).toEqual({
      Action: 'Load',
      Target: 'Data/Events/Town',
      FromFile: 'assets/events.json',
    })
  })
})
