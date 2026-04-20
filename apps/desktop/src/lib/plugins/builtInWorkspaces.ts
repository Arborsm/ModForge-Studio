import { MapPatchEditor } from '../../components/map-workflow/MapPatchEditor'
import { EventPatchEditor } from '../../components/event-workflow/EventPatchEditor'
import { ImagePatchEditor } from '../../components/image-workflow/ImagePatchEditor'
import { registerWorkspacePlugin, type WorkspacePlugin } from './workspaceRegistry'

const mapWorkspacePlugin: WorkspacePlugin = {
  id: 'map',
  label: 'Map',
  icon: 'Map',
  editMode: {
    patchListFields: [
      { key: 'logName', label: 'Name' },
      { key: 'target', label: 'Target' },
      { key: 'action', label: 'Action' },
    ],
    targetPicker: () => null, // TODO: Map target picker
    editor: MapPatchEditor,
  },
  serializer: {
    toChangeEntry: (patch) => {
      const state = (patch.editorState as Record<string, unknown>) ?? {}
      const entry: Record<string, unknown> = {
        Action: patch.action,
        Target: patch.target,
      }
      // Merge editor state excluding internal fields
      for (const [k, v] of Object.entries(state)) {
        if (k === 'entries') continue
        entry[k] = v
      }
      return entry
    },
    fromChangeEntry: (change) => ({
      properties: change['Entries'] ?? {},
      warps: change['Warps'] ?? [],
    }),
  },
}

const eventWorkspacePlugin: WorkspacePlugin = {
  id: 'events',
  label: 'Events',
  icon: 'Calendar',
  editMode: {
    patchListFields: [
      { key: 'logName', label: 'Name' },
      { key: 'target', label: 'Target' },
      { key: 'action', label: 'Action' },
    ],
    targetPicker: () => null, // TODO: Event target picker
    editor: EventPatchEditor,
  },
  serializer: {
    toChangeEntry: (patch) => {
      const state = (patch.editorState as Record<string, unknown>) ?? {}
      return {
        Action: patch.action,
        Target: patch.target,
        Entries: state['entries'] ?? {},
      }
    },
    fromChangeEntry: (change) => ({
      entries: change['Entries'] ?? {},
    }),
  },
}

const imageWorkspacePlugin = (id: 'characters' | 'buildings' | 'items', label: string, icon: string): WorkspacePlugin => ({
  id,
  label,
  icon,
  editMode: {
    patchListFields: [
      { key: 'logName', label: 'Name' },
      { key: 'target', label: 'Target' },
      { key: 'action', label: 'Action' },
    ],
    targetPicker: () => null, // TODO: Image target picker
    editor: ImagePatchEditor,
  },
  serializer: {
    toChangeEntry: (patch) => {
      const state = (patch.editorState as Record<string, unknown>) ?? {}
      const entry: Record<string, unknown> = {
        Action: patch.action,
        Target: patch.target,
      }
      if (patch.fromFile) {
        entry['FromFile'] = patch.fromFile
      }
      if (state['patchMode']) {
        entry['PatchMode'] = state['patchMode']
      }
      if (state['fromArea']) {
        entry['FromArea'] = state['fromArea']
      }
      if (state['toArea']) {
        entry['ToArea'] = state['toArea']
      }
      return entry
    },
    fromChangeEntry: (change) => ({
      patchMode: change['PatchMode'] ?? 'Replace',
      fromArea: change['FromArea'] ?? null,
      toArea: change['ToArea'] ?? null,
    }),
  },
})

// Register all built-in workspaces
registerWorkspacePlugin(mapWorkspacePlugin)
registerWorkspacePlugin(eventWorkspacePlugin)
registerWorkspacePlugin(imageWorkspacePlugin('characters', 'Characters', 'User'))
registerWorkspacePlugin(imageWorkspacePlugin('buildings', 'Buildings', 'Building2'))
registerWorkspacePlugin(imageWorkspacePlugin('items', 'Items', 'Package'))
