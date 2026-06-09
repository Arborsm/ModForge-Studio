import { EventPatchEditor } from '../workspaces/event-stage'
import { ImagePatchEditor } from '../workspaces/image-patch'
import { MapPatchEditor } from '../workspaces/map'
import { registerWorkspacePlugin, type WorkspacePlugin } from '@features/cp-maker'

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
    targetPicker: () => null,
    editor: MapPatchEditor,
  },
  serializer: {
    toChangeEntry: (patch) => {
      const state = (patch.editorState as Record<string, unknown>) ?? {}
      const entry: Record<string, unknown> = {
        Action: patch.action,
        Target: patch.target,
      }
      for (const [key, value] of Object.entries(state)) {
        if (key === 'entries') {
          continue
        }

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
    },
    fromChangeEntry: (change) => ({
      properties: change['MapProperties'] ?? {},
      warps: change['AddWarps'] ?? [],
      npcWarps: change['AddNpcWarps'] ?? [],
      mapTiles: change['MapTiles'] ?? [],
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
    targetPicker: () => null,
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
    targetPicker: () => null,
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

      if (patch.action !== 'Load') {
        if (state['patchMode']) {
          entry['PatchMode'] = state['patchMode']
        }
        if (state['fromArea']) {
          entry['FromArea'] = state['fromArea']
        }
        if (state['toArea']) {
          entry['ToArea'] = state['toArea']
        }
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

registerWorkspacePlugin(mapWorkspacePlugin)
registerWorkspacePlugin(eventWorkspacePlugin)
registerWorkspacePlugin(imageWorkspacePlugin('characters', 'Characters', 'User'))
registerWorkspacePlugin(imageWorkspacePlugin('buildings', 'Buildings', 'Building2'))
registerWorkspacePlugin(imageWorkspacePlugin('items', 'Items', 'Package'))
