import { createElement, type ComponentProps } from 'react'
import { EventPatchEditor } from '../workspaces/event-stage'
import { ImagePatchEditor } from '../workspaces/image-patch'
import { MapPatchEditor } from '../workspaces/map'
import { GenericPatchEditor, registerWorkspacePlugin, type EditorComponent, type WorkspacePlugin } from '@features/cp-maker'

const BASE_CHANGE_KEYS = new Set(['Action', 'Target', 'FromFile', 'LogName', 'Enabled', 'When'])

function genericEditorState(change: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(change).filter(([key]) => !BASE_CHANGE_KEYS.has(key)))
}

function changeString(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string').join(', ')
  return ''
}

function genericChangeEntry(patch: Parameters<WorkspacePlugin['serializer']['toChangeEntry']>[0]) {
  return {
    Action: patch.action,
    ...(patch.action === 'Include' ? {} : { Target: patch.target }),
    ...(patch.fromFile ? { FromFile: patch.fromFile } : {}),
    ...((patch.editorState && typeof patch.editorState === 'object' && !Array.isArray(patch.editorState)
      ? patch.editorState
      : {}) as Record<string, unknown>),
  }
}

function isMapPatch(action: string, target: string) {
  return action === 'EditMap' || (action === 'Load' && target.startsWith('Maps/'))
}

function isImagePatch(action: string, target: string) {
  return (
    action === 'EditImage' ||
    (action === 'Load' && ['Portraits/', 'Characters/', 'TileSheets/', 'LooseSprites/'].some((prefix) => target.startsWith(prefix)))
  )
}

function selectEditor(props: ComponentProps<EditorComponent>, preferred: 'map' | 'events' | 'image') {
  if (isMapPatch(props.patch.action, props.patch.target)) return createElement(MapPatchEditor, props)
  if (isImagePatch(props.patch.action, props.patch.target)) return createElement(ImagePatchEditor, props)
  if (preferred === 'events' && props.patch.action === 'EditData' && props.patch.target.startsWith('Data/Events')) {
    return createElement(EventPatchEditor, props)
  }
  return createElement(GenericPatchEditor, props)
}

const mapWorkspaceEditor: EditorComponent = (props) => selectEditor(props, 'map')
const eventWorkspaceEditor: EditorComponent = (props) => selectEditor(props, 'events')
const assetWorkspaceEditor: EditorComponent = (props) => selectEditor(props, 'image')

function mapChangeEntry(patch: Parameters<WorkspacePlugin['serializer']['toChangeEntry']>[0]) {
  if (!isMapPatch(patch.action, patch.target)) return genericChangeEntry(patch)
  const state = (patch.editorState as Record<string, unknown>) ?? {}
  const entry: Record<string, unknown> = { Action: patch.action, Target: patch.target }
  if (patch.fromFile) entry['FromFile'] = patch.fromFile
  for (const [key, value] of Object.entries(state)) {
    const cpKey =
      key === 'properties'
        ? 'MapProperties'
        : key === 'warps'
          ? 'AddWarps'
          : key === 'npcWarps'
            ? 'AddNpcWarps'
            : key === 'mapTiles'
              ? 'MapTiles'
              : key
    entry[cpKey] = value
  }
  return entry
}

function imageChangeEntry(patch: Parameters<WorkspacePlugin['serializer']['toChangeEntry']>[0]) {
  if (isMapPatch(patch.action, patch.target)) return mapChangeEntry(patch)
  if (!isImagePatch(patch.action, patch.target)) return genericChangeEntry(patch)
  const state = (patch.editorState as Record<string, unknown>) ?? {}
  const entry: Record<string, unknown> = { Action: patch.action, Target: patch.target }
  if (patch.fromFile) entry['FromFile'] = patch.fromFile
  if (patch.action !== 'Load') {
    if (state['patchMode']) entry['PatchMode'] = state['patchMode']
    if (state['fromArea']) entry['FromArea'] = state['fromArea']
    if (state['toArea']) entry['ToArea'] = state['toArea']
  }
  return entry
}

const mapWorkspacePlugin: WorkspacePlugin = {
  id: 'map',
  editMode: {
    editor: mapWorkspaceEditor,
  },
  serializer: {
    toChangeEntry: mapChangeEntry,
    fromChangeEntry: (change) =>
      isMapPatch(changeString(change['Action']), changeString(change['Target']))
        ? {
            properties: change['MapProperties'] ?? {},
            warps: change['AddWarps'] ?? [],
            npcWarps: change['AddNpcWarps'] ?? [],
            mapTiles: change['MapTiles'] ?? [],
            patchMode: change['PatchMode'] ?? 'ReplaceByLayer',
            fromArea: change['FromArea'] ?? null,
            toArea: change['ToArea'] ?? null,
          }
        : genericEditorState(change),
  },
}

const eventWorkspacePlugin: WorkspacePlugin = {
  id: 'events',
  editMode: {
    editor: eventWorkspaceEditor,
  },
  serializer: {
    toChangeEntry: (patch) =>
      patch.action === 'EditData' && patch.target.startsWith('Data/Events')
        ? {
            Action: patch.action,
            Target: patch.target,
            Entries: (patch.editorState as Record<string, unknown> | undefined)?.['entries'] ?? {},
          }
        : genericChangeEntry(patch),
    fromChangeEntry: (change) =>
      change['Action'] === 'EditData' && changeString(change['Target']).startsWith('Data/Events')
        ? { entries: change['Entries'] ?? {} }
        : genericEditorState(change),
  },
}

const projectContentWorkspacePlugin: WorkspacePlugin = {
  id: 'mods',
  editMode: {
    editor: GenericPatchEditor,
  },
  serializer: {
    toChangeEntry: genericChangeEntry,
    fromChangeEntry: genericEditorState,
  },
}

const imageWorkspacePlugin = (id: 'characters' | 'buildings' | 'items'): WorkspacePlugin => ({
  id,
  editMode: {
    editor: assetWorkspaceEditor,
  },
  serializer: {
    toChangeEntry: imageChangeEntry,
    fromChangeEntry: (change) => {
      const action = changeString(change['Action'])
      const target = changeString(change['Target'])
      if (isMapPatch(action, target)) {
        return {
          properties: change['MapProperties'] ?? {},
          warps: change['AddWarps'] ?? [],
          npcWarps: change['AddNpcWarps'] ?? [],
          mapTiles: change['MapTiles'] ?? [],
        }
      }
      return isImagePatch(action, target)
        ? { patchMode: change['PatchMode'] ?? 'Replace', fromArea: change['FromArea'] ?? null, toArea: change['ToArea'] ?? null }
        : genericEditorState(change)
    },
  },
})

registerWorkspacePlugin(mapWorkspacePlugin)
registerWorkspacePlugin(eventWorkspacePlugin)
registerWorkspacePlugin(projectContentWorkspacePlugin)
registerWorkspacePlugin(imageWorkspacePlugin('characters'))
registerWorkspacePlugin(imageWorkspacePlugin('buildings'))
registerWorkspacePlugin(imageWorkspacePlugin('items'))
