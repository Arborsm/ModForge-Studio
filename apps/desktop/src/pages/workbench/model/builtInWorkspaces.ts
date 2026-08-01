import { createElement, lazy } from 'react'
import { GenericPatchEditor, registerWorkspacePlugin, type EditorComponent, type WorkspaceId } from '@features/cp-maker'
import { loadAssetFamily } from '../workspaces/asset-library/model/mapLoadBinding'
import { selectEditorKind, type EditorKind } from './editorRouting'

const MapLoadSummary = lazy(() => import('../workspaces/map').then((module) => ({ default: module.MapLoadSummaryEditor })))
const GenericLoadSummary = lazy(() =>
  import('../workspaces/asset-library').then((module) => ({ default: module.GenericLoadSummaryEditor })),
)

/**
 * Read-only Load binding summary shown outside the asset library. Maps keep
 * their chip + preview-table summary; every other family uses the generic
 * target/FromFile/enabled summary. Editing always happens in the asset library.
 */
const LoadSummaryDispatcher: EditorComponent = (props) =>
  createElement(loadAssetFamily(props.patch.target) === 'maps' ? MapLoadSummary : GenericLoadSummary, props)

const EDITORS: Record<EditorKind, EditorComponent> = {
  'map-patch': lazy(() => import('../workspaces/map').then((module) => ({ default: module.MapPatchEditor }))),
  'load-summary': LoadSummaryDispatcher,
  image: lazy(() => import('../workspaces/image-patch').then((module) => ({ default: module.ImagePatchEditor }))),
  'character-data': lazy(() => import('../workspaces/character-data').then((module) => ({ default: module.CharacterDataPatchEditor }))),
  'building-data': lazy(() => import('../workspaces/building-data').then((module) => ({ default: module.BuildingDataPatchEditor }))),
  'item-data': lazy(() => import('../workspaces/item-data').then((module) => ({ default: module.ItemObjectPatchEditor }))),
  events: lazy(() => import('../workspaces/event-stage').then((module) => ({ default: module.EventPatchEditor }))),
  raw: GenericPatchEditor,
}

/** Every workspace routes its patches through the same declared editor table. */
const workspaceEditor: EditorComponent = (props) => createElement(EDITORS[selectEditorKind(props.patch)], props)

const WORKSPACE_IDS: readonly WorkspaceId[] = ['map', 'events', 'mods', 'characters', 'buildings', 'items', 'dialogue', 'schedules', 'mail']

for (const id of WORKSPACE_IDS) {
  registerWorkspacePlugin({ id, editMode: { editor: workspaceEditor } })
}
