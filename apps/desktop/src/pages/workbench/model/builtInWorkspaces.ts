import { createElement } from 'react'
import { BuildingDataPatchEditor } from '../workspaces/building-data'
import { CharacterDataPatchEditor } from '../workspaces/character-data'
import { EventPatchEditor } from '../workspaces/event-stage'
import { ImagePatchEditor } from '../workspaces/image-patch'
import { ItemObjectPatchEditor } from '../workspaces/item-data'
import { MapPatchEditor } from '../workspaces/map'
import { GenericPatchEditor, registerWorkspacePlugin, type EditorComponent, type WorkspaceId } from '@features/cp-maker'
import { selectEditorKind, type EditorKind } from './editorRouting'

const EDITORS: Record<EditorKind, EditorComponent> = {
  map: MapPatchEditor,
  image: ImagePatchEditor,
  'character-data': CharacterDataPatchEditor,
  'building-data': BuildingDataPatchEditor,
  'item-data': ItemObjectPatchEditor,
  events: EventPatchEditor,
  raw: GenericPatchEditor,
}

/** Every workspace routes its patches through the same declared editor table. */
const workspaceEditor: EditorComponent = (props) => createElement(EDITORS[selectEditorKind(props.patch)], props)

const WORKSPACE_IDS: readonly WorkspaceId[] = ['map', 'events', 'mods', 'characters', 'buildings', 'items', 'dialogue', 'schedules', 'mail']

for (const id of WORKSPACE_IDS) {
  registerWorkspacePlugin({ id, editMode: { editor: workspaceEditor } })
}
